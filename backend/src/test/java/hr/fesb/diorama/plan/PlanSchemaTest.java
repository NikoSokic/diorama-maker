package hr.fesb.diorama.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class PlanSchemaTest {

	private static void collectKeywords(JsonNode node, List<String> found) {
		if (node.isObject()) {
			node.fieldNames().forEachRemaining(found::add);
		}
		node.forEach(child -> collectKeywords(child, found));
	}

	/**
	 * Gemini compiles the schema into a grammar and answers HTTP 400 ("too many states for serving") when it
	 * gets too big; numeric bounds and array length limits are what blow it up (measured, API_NOTES §2.3).
	 * Those limits live in the instruction text and in PlanValidator instead.
	 */
	@Test
	void staysWithinWhatGeminiCanCompile() {
		List<String> keywords = new ArrayList<>();
		collectKeywords(PlanSchema.schema(), keywords);

		assertThat(keywords).doesNotContain("minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern");
	}

	@Test
	void describesEveryPartOfThePlan() {
		JsonNode schema = PlanSchema.schema();

		assertThat(schema.path("required")).extracting(JsonNode::asText)
			.contains("safeForKids", "title", "language", "mood", "palette", "characters", "scenes");
		JsonNode scene = schema.path("properties").path("scenes").path("items").path("properties");
		assertThat(scene.fieldNames()).toIterable()
			.contains("environment", "timeOfDay", "weather", "narration", "durationSec", "camera", "actions", "props");
		JsonNode action = scene.path("actions").path("items").path("properties");
		assertThat(action.path("type").path("enum")).hasSize(StoryPlan.ActionType.values().length);
		assertThat(action.fieldNames()).toIterable().contains("characterKey", "toX", "toZ", "startAt", "duration", "emotion");
	}

	/** Writes the exact request parts to target/ so {@code npm run try:plan} can send them to the real Gemini API. */
	@Test
	void exportsTheRequestForManualLiveChecks() throws Exception {
		ObjectMapper json = new ObjectMapper();
		ObjectNode request = json.createObjectNode();
		request.put("systemInstruction", PlanSchema.SYSTEM_INSTRUCTION);
		request.set("schema", PlanSchema.schema());
		Path file = Path.of("target", "gemini-plan-request.json");
		Files.createDirectories(file.getParent());
		json.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), request);

		assertThat(Files.size(file)).isGreaterThan(1000);
	}

}
