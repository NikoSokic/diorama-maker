package hr.fesb.diorama.story;

import java.io.IOException;
import java.net.URI;
import java.util.Base64;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A look at an uploaded thumbnail before it can appear in the public gallery: the story's text was moderated,
 * the picture must be too. With Gemini live it asks the free text model (which reads images) whether the picture
 * is a cartoon toy scene fit for children; anything but a clear yes, including an error, refuses the picture.
 * Without Gemini, stories are made by the offline planner and never reach the public gallery, so nothing is checked.
 */
public interface ThumbnailModerator {

	boolean acceptable(byte[] jpeg);

	static ThumbnailModerator of(DioramaProperties.Gemini gemini, ObjectMapper json) {
		return gemini.resolvedMode() == DioramaProperties.Mode.LIVE ? new GeminiVision(gemini, json) : jpeg -> true;
	}

	final class GeminiVision implements ThumbnailModerator {

		private static final Logger log = LoggerFactory.getLogger(GeminiVision.class);
		static final String QUESTION = "This picture was uploaded as the cover of a children's story in a picture-book app. "
				+ "The app renders cute low-poly 3D toy scenes (islands, animals, people, props, sky). "
				+ "Answer with exactly one word: SAFE if it is such a cartoon 3D scene and contains nothing unsuitable for "
				+ "young children (no text messages, no real photos of people, no violence, nudity or symbols of hate); "
				+ "otherwise UNSAFE.";

		private final DioramaProperties.Gemini props;
		private final ObjectMapper json;
		private final Http http;

		GeminiVision(DioramaProperties.Gemini props, ObjectMapper json) {
			this.props = props;
			this.json = json;
			this.http = new Http(props.timeout(), false);
		}

		@Override
		public boolean acceptable(byte[] jpeg) {
			ObjectNode body = json.createObjectNode();
			var parts = body.putArray("contents").addObject().put("role", "user").putArray("parts");
			parts.addObject().putObject("inline_data").put("mime_type", "image/jpeg").put("data", Base64.getEncoder().encodeToString(jpeg));
			parts.addObject().put("text", QUESTION);
			body.putObject("generationConfig").put("maxOutputTokens", 5).put("temperature", 0);
			try {
				Http.Response response = http.send("POST",
						URI.create(props.baseUrl() + "/models/" + props.model() + ":generateContent"),
						Map.of("x-goog-api-key", props.apiKey(), "Content-Type", "application/json"),
						json.writeValueAsBytes(body), props.timeout());
				if (!response.ok()) {
					log.warn("thumbnail check unavailable (HTTP {}), picture refused", response.status());
					return false;
				}
				boolean ok = verdict(json.readTree(response.body()));
				if (!ok) {
					log.info("thumbnail check said no, picture refused");
				}
				return ok;
			}
			catch (IOException e) {
				log.warn("thumbnail check failed ({}), picture refused", e.getClass().getSimpleName());
				return false;
			}
		}

		static boolean verdict(JsonNode answer) {
			StringBuilder text = new StringBuilder();
			for (JsonNode part : answer.path("candidates").path(0).path("content").path("parts")) {
				text.append(part.path("text").asText(""));
			}
			return text.toString().trim().toUpperCase().startsWith("SAFE");
		}

	}

}
