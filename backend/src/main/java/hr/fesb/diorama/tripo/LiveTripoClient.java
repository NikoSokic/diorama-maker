package hr.fesb.diorama.tripo;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.tripo.TripoException.Reason;

/**
 * Real Tripo v3 client. Endpoints, parameters and error codes are from docs/API_NOTES.md §1.
 *
 * <p>Retry policy: reads (GET) are retried with exponential backoff on transport errors, 5xx and 429.
 * Creating calls (POST) are retried only on 429, where Tripo certainly did not start a task; any other
 * failure might have created one, and submitting again could pay twice.
 */
public class LiveTripoClient implements TripoClient {

	private static final String NEGATIVE_PROMPT = "base, pedestal, ground, background, multiple objects, text";
	private static final int READ_ATTEMPTS = 4;
	private static final int CREATE_ATTEMPTS = 3;
	private static final Duration MAX_RETRY_AFTER = Duration.ofSeconds(30);
	private static final Duration DOWNLOAD_TIMEOUT = Duration.ofSeconds(90);

	private final DioramaProperties.Tripo props;
	private final ObjectMapper json;
	private final Http api;
	private final Http downloads;
	private final String baseUrl;

	public LiveTripoClient(DioramaProperties.Tripo props, ObjectMapper json) {
		this.props = props;
		this.json = json;
		this.api = new Http(Duration.ofSeconds(10), false);
		this.downloads = new Http(Duration.ofSeconds(10), true);
		this.baseUrl = props.baseUrl().replaceAll("/+$", "");
	}

	@Override
	public String source() {
		return "live";
	}

	@Override
	public Balance balance() {
		JsonNode data = call("GET", "/account/balance", null);
		return new Balance(data.path("balance").asDouble(0), data.path("frozen").asDouble(0));
	}

	@Override
	public String textToModel(String prompt, Kind kindHint) {
		ObjectNode body = json.createObjectNode();
		body.put("prompt", prompt);
		body.put("model", props.modelVersion());
		body.put("negative_prompt", NEGATIVE_PROMPT);
		body.put("face_limit", props.faceLimit());
		body.put("texture", true);
		body.put("pbr", false);
		body.put("texture_quality", props.textureQuality());
		return taskId(call("POST", "/generation/text-to-model", body));
	}

	@Override
	public String rigCheck(String modelTaskId) {
		return taskId(call("POST", "/animations/rig-check", json.createObjectNode().put("input", modelTaskId)));
	}

	@Override
	public String rig(String modelTaskId, String rigType, String rigModel) {
		ObjectNode body = json.createObjectNode();
		body.put("input", modelTaskId);
		body.put("model", rigModel);
		body.put("rig_type", rigType);
		body.put("out_format", "glb");
		return taskId(call("POST", "/animations/rig", body));
	}

	@Override
	public String retarget(String rigTaskId, List<String> presets) {
		if (presets.isEmpty() || presets.size() > 5) {
			throw new IllegalArgumentException("retarget takes 1 to 5 presets");
		}
		ObjectNode body = json.createObjectNode();
		body.put("input", rigTaskId);
		if (presets.size() == 1) {
			body.put("animation", presets.get(0));
		}
		else {
			ArrayNode animations = body.putArray("animations");
			presets.forEach(animations::add);
		}
		body.put("out_format", "glb");
		// the player moves characters itself; root motion would double the movement
		body.put("animate_in_place", true);
		return taskId(call("POST", "/animations/retarget", body));
	}

	@Override
	public TripoTask task(String taskId) {
		if (taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,100}")) {
			throw new TripoException(Reason.NOT_FOUND, "not a Tripo task id");
		}
		JsonNode data = call("GET", "/tasks/" + taskId, null);
		JsonNode output = data.path("output");
		return new TripoTask(
				data.path("task_id").asText(taskId),
				text(data, "type"),
				TripoTask.parseStatus(data.path("status").asText()),
				data.path("progress").asInt(0),
				firstText(output, "model_url", "pbr_model_url", "model", "pbr_model", "base_model"),
				firstText(output, "rendered_image_url", "rendered_image"),
				output.path("riggable").isBoolean() ? output.get("riggable").asBoolean() : null,
				text(output, "rig_type"),
				text(data, "error_message"),
				data.path("credits_consumed").isNumber() ? data.get("credits_consumed").asDouble() : null);
	}

	@Override
	public byte[] download(String url) {
		URI uri;
		try {
			uri = URI.create(url);
		}
		catch (IllegalArgumentException e) {
			throw new TripoException(Reason.BAD_OUTPUT, "Tripo returned an invalid output URL");
		}
		// plain http is only accepted when the API itself is a local stub (tests)
		boolean secure = "https".equalsIgnoreCase(uri.getScheme()) || ("http".equalsIgnoreCase(uri.getScheme()) && baseUrl.startsWith("http://"));
		if (!secure) {
			throw new TripoException(Reason.BAD_OUTPUT, "Tripo output URL is not https");
		}
		TripoException last = null;
		for (int attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
			try {
				// no Authorization header: output URLs are pre-signed and live on a different host
				Http.Response response = downloads.send("GET", uri, Map.of(), null, DOWNLOAD_TIMEOUT);
				if (response.ok()) {
					return response.body();
				}
				last = new TripoException(Reason.BAD_OUTPUT, "downloading the Tripo output failed with HTTP " + response.status());
				if (response.status() < 500 && response.status() != 429) {
					throw last;
				}
			}
			catch (IOException e) {
				last = new TripoException(Reason.TRANSPORT, "downloading the Tripo output failed (" + e.getClass().getSimpleName() + ")", e);
			}
			if (attempt < READ_ATTEMPTS && !Http.sleep(backoff(attempt))) {
				break;
			}
		}
		throw last;
	}

	/** Sends one API request and returns the envelope's {@code data}. */
	private JsonNode call(String method, String path, JsonNode body) {
		boolean read = "GET".equals(method);
		int attempts = read ? READ_ATTEMPTS : CREATE_ATTEMPTS;
		byte[] bytes = serialize(body);
		Map<String, String> headers = bytes == null
				? Map.of("Authorization", "Bearer " + props.apiKey())
				: Map.of("Authorization", "Bearer " + props.apiKey(), "Content-Type", "application/json");
		TripoException last = null;
		for (int attempt = 1; attempt <= attempts; attempt++) {
			Duration wait = backoff(attempt);
			try {
				Http.Response response = api.send(method, URI.create(baseUrl + path), headers, bytes, props.requestTimeout());
				JsonNode envelope = parse(response);
				int code = envelope.path("code").asInt(response.ok() ? 0 : -1);
				if (response.ok() && code == 0) {
					return envelope.path("data");
				}
				Reason reason = TripoException.reasonFor(response.status(), code);
				last = new TripoException(reason, "Tripo " + method + " " + path.replaceAll("/tasks/.*", "/tasks/{id}")
						+ " failed: HTTP " + response.status() + ", code " + code + " " + envelope.path("message").asText(""));
				boolean retry = reason == Reason.RATE_LIMITED || (read && reason == Reason.SERVER);
				if (!retry) {
					throw last;
				}
				wait = retryAfter(response, wait);
			}
			catch (IOException e) {
				last = new TripoException(Reason.TRANSPORT, "Tripo " + method + " request failed (" + e.getClass().getSimpleName() + ")", e);
				if (!read) {
					throw last;
				}
			}
			if (attempt < attempts && !Http.sleep(wait)) {
				break;
			}
		}
		throw last;
	}

	private Duration backoff(int attempt) {
		return props.retryBackoff().multipliedBy(1L << (attempt - 1));
	}

	private static Duration retryAfter(Http.Response response, Duration fallback) {
		String header = response.header("Retry-After");
		if (header != null && header.trim().matches("\\d{1,4}")) {
			Duration asked = Duration.ofSeconds(Long.parseLong(header.trim()));
			return asked.compareTo(MAX_RETRY_AFTER) > 0 ? MAX_RETRY_AFTER : asked;
		}
		return fallback;
	}

	private String taskId(JsonNode data) {
		String id = data.path("task_id").asText("");
		if (id.isEmpty()) {
			throw new TripoException(Reason.BAD_OUTPUT, "Tripo did not return a task id");
		}
		return id;
	}

	private byte[] serialize(JsonNode body) {
		if (body == null) {
			return null;
		}
		try {
			return json.writeValueAsBytes(body);
		}
		catch (JsonProcessingException e) {
			throw new IllegalStateException("could not serialize the Tripo request", e);
		}
	}

	private JsonNode parse(Http.Response response) {
		try {
			JsonNode node = json.readTree(response.body());
			return node == null || !node.isObject() ? json.createObjectNode() : node;
		}
		catch (IOException e) {
			return json.createObjectNode();
		}
	}

	private static String text(JsonNode node, String field) {
		JsonNode value = node.path(field);
		return value.isValueNode() && !value.isNull() && !value.asText().isBlank() ? value.asText() : null;
	}

	private static String firstText(JsonNode node, String... fields) {
		for (String field : fields) {
			String value = text(node, field);
			if (value != null) {
				return value;
			}
		}
		return null;
	}

}
