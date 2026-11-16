package hr.fesb.diorama.narration;

import java.io.IOException;
import java.net.URI;
import java.util.Base64;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;

/**
 * Gemini speech generation (API_NOTES §2b): one scene's narration in, a WAV file out. Free tier; the key travels
 * in a header and never appears in messages or logs.
 */
public class GeminiSpeech implements SpeechClient {

	private static final String API_REVISION = "2026-05-20";

	private final DioramaProperties.Gemini props;
	private final ObjectMapper json;
	private final Http http;

	public GeminiSpeech(DioramaProperties.Gemini props, ObjectMapper json) {
		this.props = props;
		this.json = json;
		this.http = new Http(props.timeout(), false);
	}

	@Override
	public String model() {
		return props.ttsModel();
	}

	@Override
	public String voice() {
		return props.ttsVoice();
	}

	/**
	 * How the text is delivered. It goes in a speech annotation, which the model follows but does not read out, so
	 * the narration itself stays a verbatim transcript. Naming the language keeps Croatian from drifting into
	 * a neighbouring language's pronunciation.
	 */
	static String style(String lang) {
		return "warm, calm storyteller reading a picture book for children aloud in "
				+ ("hr".equals(lang) ? "standard Croatian" : "clear English");
	}

	@Override
	public byte[] speak(String text, String lang) {
		ObjectNode body = json.createObjectNode();
		body.put("model", props.ttsModel());
		ObjectNode part = body.putArray("input").addObject().put("type", "user_input").putArray("content").addObject();
		part.put("type", "text").put("text", text);
		part.putArray("annotations").addObject().put("type", "speech_metadata").put("style", style(lang));
		body.put("store", false);
		body.putObject("response_format").put("type", "audio");
		body.putObject("generation_config").putArray("speech_config").addObject().put("voice", props.ttsVoice());
		Http.Response response;
		try {
			response = http.send("POST", URI.create(props.baseUrl() + "/interactions"),
					Map.of("x-goog-api-key", props.apiKey(), "Content-Type", "application/json", "Api-Revision", API_REVISION),
					json.writeValueAsBytes(body), props.timeout());
		}
		catch (IOException e) {
			throw new SpeechException(false, "speech request failed (" + e.getClass().getSimpleName() + ")");
		}
		if (response.status() == 429) {
			throw new SpeechException(true, "speech quota exhausted (HTTP 429)");
		}
		if (!response.ok()) {
			throw new SpeechException(false, "speech request answered HTTP " + response.status());
		}
		return audio(response.body());
	}

	/** The last audio part of the model's output, decoded. */
	byte[] audio(byte[] responseBody) {
		JsonNode root;
		try {
			root = json.readTree(responseBody);
		}
		catch (IOException e) {
			throw new SpeechException(false, "speech answer is not JSON");
		}
		String data = null;
		for (JsonNode step : root.path("steps")) {
			if (!"model_output".equals(step.path("type").asText())) {
				continue;
			}
			for (JsonNode part : step.path("content")) {
				if ("audio".equals(part.path("type").asText()) && part.hasNonNull("data")) {
					data = part.path("data").asText();
				}
			}
		}
		if (data == null) {
			throw new SpeechException(false, "speech answer has no audio");
		}
		try {
			return Base64.getDecoder().decode(data);
		}
		catch (IllegalArgumentException e) {
			throw new SpeechException(false, "speech audio is not valid base64");
		}
	}

}
