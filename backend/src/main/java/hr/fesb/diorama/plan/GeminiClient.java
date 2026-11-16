package hr.fesb.diorama.plan;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Structured-output call to Gemini (API_NOTES §2): the Interactions API first, legacy {@code generateContent}
 * when that times out or misbehaves. Safety filters are set to their strictest level on both.
 */
public class GeminiClient {

	private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);
	private static final String API_REVISION = "2026-05-20";
	private static final List<String> SAFETY_CATEGORIES = List.of("harassment", "hate_speech", "sexually_explicit",
			"dangerous_content", "jailbreak");
	private static final Set<String> BLOCK_CODES = Set.of("safety", "jailbreak", "prohibited_content", "blocklist");

	/** The story was refused by the safety filters. */
	public static class BlockedException extends RuntimeException {

		public BlockedException(String message) {
			super(message);
		}
	}

	/** Gemini could not answer (quota, outage, bad key). The message never contains the key. */
	public static class UnavailableException extends RuntimeException {

		public UnavailableException(String message) {
			super(message);
		}
	}

	private final DioramaProperties.Gemini props;
	private final ObjectMapper json;
	private final Http http;

	public GeminiClient(DioramaProperties.Gemini props, ObjectMapper json) {
		this.props = props;
		this.json = json;
		this.http = new Http(props.timeout(), false);
	}

	/** @return the raw text of the model's answer (expected to be JSON matching {@code schema}) */
	public String generate(String systemInstruction, String input, JsonNode schema) {
		try {
			String text = interactions(systemInstruction, input, schema);
			if (text != null) {
				return text;
			}
		}
		catch (IOException e) {
			log.warn("Gemini Interactions API failed ({}), trying generateContent", e.getClass().getSimpleName());
		}
		return generateContent(systemInstruction, input, schema);
	}

	/** @return the answer, or null when the legacy endpoint should be tried instead */
	private String interactions(String systemInstruction, String input, JsonNode schema) throws IOException {
		ObjectNode body = json.createObjectNode();
		body.put("model", props.model());
		body.put("system_instruction", systemInstruction);
		body.put("input", input);
		body.put("store", false);
		body.putObject("generation_config").put("thinking_level", "low").put("max_output_tokens", 6000);
		ObjectNode format = body.putObject("response_format");
		format.put("type", "text").put("mime_type", "application/json").set("schema", schema);
		ArrayNode safety = body.putArray("safety_settings");
		SAFETY_CATEGORIES.forEach(category -> safety.addObject().put("type", category).put("threshold", "block_low_and_above"));

		Http.Response response = post(props.baseUrl() + "/interactions", body, true);
		if (response.status() == 429) {
			Http.sleep(props.retryBackoff());
			response = post(props.baseUrl() + "/interactions", body, true);
		}
		JsonNode answer = parse(response);
		if (response.ok()) {
			String text = interactionText(answer);
			if (text.isBlank()) {
				log.warn("Gemini Interactions API returned no text (status field: {})", answer.path("status").asText("n/a"));
				return null;
			}
			return text;
		}
		JsonNode error = answer.path("error");
		String code = error.path("code").asText("").toLowerCase(Locale.ROOT);
		String message = error.path("message").asText("");
		if (response.status() == 400 && (BLOCK_CODES.contains(code) || message.startsWith("Input blocked"))) {
			throw new BlockedException("blocked by Gemini safety filters (" + (code.isEmpty() ? "input" : code) + ")");
		}
		if (response.status() == 429) {
			throw new UnavailableException("Gemini quota exhausted (HTTP 429)");
		}
		if (response.status() == 401 || response.status() == 403) {
			throw new UnavailableException("Gemini rejected the API key (HTTP " + response.status() + ")");
		}
		log.warn("Gemini Interactions API answered HTTP {}, trying generateContent", response.status());
		return null;
	}

	private String generateContent(String systemInstruction, String input, JsonNode schema) {
		ObjectNode body = json.createObjectNode();
		body.putObject("systemInstruction").putArray("parts").addObject().put("text", systemInstruction);
		body.putArray("contents").addObject().put("role", "user").putArray("parts").addObject().put("text", input);
		ObjectNode config = body.putObject("generationConfig");
		config.put("responseMimeType", "application/json").set("responseSchema", schema);
		ArrayNode safety = body.putArray("safetySettings");
		for (String category : List.of("HARASSMENT", "HATE_SPEECH", "SEXUALLY_EXPLICIT", "DANGEROUS_CONTENT")) {
			safety.addObject().put("category", "HARM_CATEGORY_" + category).put("threshold", "BLOCK_LOW_AND_ABOVE");
		}
		String url = props.baseUrl() + "/models/" + URLEncoder.encode(props.model(), StandardCharsets.UTF_8) + ":generateContent";
		Http.Response response;
		try {
			response = post(url, body, false);
		}
		catch (IOException e) {
			throw new UnavailableException("Gemini did not answer (" + e.getClass().getSimpleName() + ")");
		}
		JsonNode answer = parse(response);
		if (!response.ok()) {
			throw new UnavailableException("Gemini answered HTTP " + response.status());
		}
		String blockReason = answer.path("promptFeedback").path("blockReason").asText("");
		JsonNode candidate = answer.path("candidates").path(0);
		String finish = candidate.path("finishReason").asText("");
		if (!blockReason.isEmpty() || Set.of("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST").contains(finish)) {
			throw new BlockedException("blocked by Gemini safety filters");
		}
		StringBuilder text = new StringBuilder();
		candidate.path("content").path("parts").forEach(part -> {
			if (!part.path("thought").asBoolean(false)) {
				text.append(part.path("text").asText(""));
			}
		});
		if (text.isEmpty()) {
			throw new UnavailableException("Gemini returned an empty answer");
		}
		return text.toString();
	}

	/** The text of the {@code model_output} step(s); {@code thought} steps are skipped (API_NOTES §2.2). */
	static String interactionText(JsonNode answer) {
		if (answer.path("output_text").isTextual()) {
			return answer.get("output_text").asText();
		}
		StringBuilder text = new StringBuilder();
		JsonNode steps = answer.path("steps").isArray() ? answer.path("steps") : answer.path("outputs");
		for (JsonNode step : steps) {
			if ("thought".equals(step.path("type").asText())) {
				continue;
			}
			JsonNode content = step.path("content");
			if (content.isArray()) {
				for (JsonNode part : content) {
					if (!"thought".equals(part.path("type").asText()) && part.path("text").isTextual()) {
						text.append(part.get("text").asText());
					}
				}
			}
			else if (step.path("text").isTextual()) {
				text.append(step.get("text").asText());
			}
		}
		return text.toString();
	}

	private Http.Response post(String url, JsonNode body, boolean interactions) throws IOException {
		Map<String, String> headers = interactions
				? Map.of("x-goog-api-key", props.apiKey(), "Content-Type", "application/json", "Api-Revision", API_REVISION)
				: Map.of("x-goog-api-key", props.apiKey(), "Content-Type", "application/json");
		try {
			return http.send("POST", URI.create(url), headers, json.writeValueAsBytes(body), props.timeout());
		}
		catch (JsonProcessingException e) {
			throw new IllegalStateException("could not serialize the Gemini request", e);
		}
	}

	private JsonNode parse(Http.Response response) {
		try {
			JsonNode node = json.readTree(response.body());
			return node == null ? json.createObjectNode() : node;
		}
		catch (IOException e) {
			return json.createObjectNode();
		}
	}

}
