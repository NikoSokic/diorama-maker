package hr.fesb.diorama.testsupport;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hr.fesb.diorama.plan.PlanValidator;
import hr.fesb.diorama.plan.StoryPlan;

public final class Fixtures {

	private static final ObjectMapper JSON = new ObjectMapper();

	private Fixtures() {
	}

	/** A well-formed Gemini answer (the StoryPlan JSON text). */
	public static String geminiPlan() {
		return read("/fixtures/gemini-plan.json");
	}

	public static String read(String resource) {
		try (InputStream in = Fixtures.class.getResourceAsStream(resource)) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	public static byte[] mockGlb(String name) {
		try (InputStream in = Fixtures.class.getResourceAsStream("/mock-models/" + name + ".glb")) {
			return in.readAllBytes();
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/**
	 * A valid three-scene plan with the given cast.
	 *
	 * @param characters triples of key, kind and prompt subject, e.g. {@code "robot", "biped", "mock-fail robot"}
	 */
	public static StoryPlan plan(String... characters) {
		ObjectNode root = JSON.createObjectNode();
		root.put("title", "Test").put("language", "en").put("mood", "cozy");
		root.putArray("palette").add("#F6C28B").add("#F7E8D0").add("#8FB996");
		ArrayNode cast = root.putArray("characters");
		for (int i = 0; i < characters.length; i += 3) {
			cast.addObject().put("key", characters[i]).put("displayName", characters[i]).put("kind", characters[i + 1])
				.put("relativeSize", 1).put("tripoPrompt", characters[i + 2]);
		}
		ArrayNode scenes = root.putArray("scenes");
		for (int s = 0; s < 3; s++) {
			ObjectNode scene = scenes.addObject();
			scene.put("environment", "meadow").put("timeOfDay", "day").put("weather", "clear");
			scene.put("narration", "Scene " + (s + 1) + ".").put("durationSec", 5);
			scene.putObject("camera").put("type", "wide");
			ArrayNode actions = scene.putArray("actions");
			for (int i = 0; i < characters.length; i += 3) {
				actions.addObject().put("characterKey", characters[i]).put("type", s == 0 ? "enter" : "jump")
					.put("toX", i - 2).put("toZ", 0).put("startAt", 0).put("duration", 1).put("emotion", "happy");
			}
		}
		PlanValidator.Result result = new PlanValidator().validate(root, "Test story.", "en", "test");
		if (result.needsRetry()) {
			throw new IllegalStateException("fixture plan is invalid: " + result.errors());
		}
		return result.plan();
	}

}
