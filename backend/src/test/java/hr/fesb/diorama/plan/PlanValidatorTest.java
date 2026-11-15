package hr.fesb.diorama.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.plan.StoryPlan.ActionType;
import hr.fesb.diorama.plan.StoryPlan.CameraType;
import hr.fesb.diorama.plan.StoryPlan.Environment;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.plan.StoryPlan.Mood;
import hr.fesb.diorama.plan.StoryPlan.Point;
import hr.fesb.diorama.plan.StoryPlan.Scene;
import org.junit.jupiter.api.Test;

class PlanValidatorTest {

	private static final String STORY = "Zec je skakutao šumom. Sreo je lisicu. Zajedno su plesali do večeri.";
	private static final String RABBIT_PROMPT = "cute stylized low-poly toy rabbit, full body, standing neutral pose, "
			+ "arms slightly away from body, single object, no base, no background, soft pastel colors";

	private final ObjectMapper json = new ObjectMapper();
	private final PlanValidator validator = new PlanValidator();

	private PlanValidator.Result validate(String raw) throws Exception {
		JsonNode node = raw == null ? null : json.readTree(raw);
		return validator.validate(node, STORY, "hr", "gemini");
	}

	private static String scene(String body) {
		return "{\"environment\":\"forest\",\"timeOfDay\":\"morning\",\"weather\":\"clear\","
				+ "\"narration\":\"Zec je skakutao šumom.\",\"durationSec\":6," + body + "}";
	}

	private static String plan(String characters, String... scenes) {
		return "{\"title\":\"Zec i lisica\",\"language\":\"hr\",\"mood\":\"funny\","
				+ "\"palette\":[\"#ffcc00\",\"#0af\",\"FF8800\"],\"characters\":[" + characters + "],\"scenes\":["
				+ String.join(",", scenes) + "]}";
	}

	private static final String TWO_CHARACTERS = "{\"key\":\"zec\",\"displayName\":\"Zec\",\"kind\":\"quadruped\","
			+ "\"relativeSize\":0.8,\"tripoPrompt\":\"" + RABBIT_PROMPT + "\"},"
			+ "{\"key\":\"lisica\",\"displayName\":\"Lisica\",\"kind\":\"quadruped\",\"relativeSize\":1,\"tripoPrompt\":\"fox\"}";
	private static final String GOOD_SCENE = scene("\"camera\":{\"type\":\"follow\",\"targetKey\":\"zec\"},\"actions\":["
			+ "{\"characterKey\":\"zec\",\"type\":\"enter\",\"to\":{\"x\":-2,\"z\":0},\"startAt\":0,\"duration\":2,\"emotion\":\"happy\"},"
			+ "{\"characterKey\":\"lisica\",\"type\":\"enter\",\"toX\":2,\"toZ\":1,\"startAt\":1,\"duration\":2}]");

	@Test
	void acceptsAValidPlanWithoutErrors() throws Exception {
		PlanValidator.Result result = validate(plan(TWO_CHARACTERS, GOOD_SCENE, GOOD_SCENE, GOOD_SCENE));

		assertThat(result.errors()).isEmpty();
		assertThat(result.needsRetry()).isFalse();
		StoryPlan plan = result.plan();
		assertThat(plan.title()).isEqualTo("Zec i lisica");
		assertThat(plan.mood()).isEqualTo(Mood.FUNNY);
		assertThat(plan.palette()).containsExactly("#FFCC00", "#00AAFF", "#FF8800");
		assertThat(plan.characters()).hasSize(2);
		assertThat(plan.characters().get(0).tripoPrompt()).isEqualTo(RABBIT_PROMPT);
		assertThat(plan.characters().get(1).tripoPrompt()).isEqualTo(PlanValidator.canonicalPrompt("fox"));
		assertThat(plan.characters().get(1).kind()).isEqualTo(Kind.QUADRUPED);
		assertThat(plan.scenes()).hasSize(3);
		Scene scene = plan.scenes().get(0);
		assertThat(scene.environment()).isEqualTo(Environment.FOREST);
		assertThat(scene.camera().type()).isEqualTo(CameraType.FOLLOW);
		assertThat(scene.camera().targetKey()).isEqualTo("zec");
		assertThat(scene.actions().get(1).to()).isEqualTo(new Point(2, 1));
		assertThat(plan.source()).isEqualTo("gemini");
	}

	@Test
	void buildsACompletePlanFromGarbage() throws Exception {
		for (String raw : new String[] { null, "[]", "\"hello\"", "{}", "{\"characters\":\"none\",\"scenes\":7}" }) {
			PlanValidator.Result result = validate(raw);

			assertThat(result.needsRetry()).as(String.valueOf(raw)).isTrue();
			StoryPlan plan = result.plan();
			assertThat(plan.characters()).hasSize(1);
			assertThat(plan.scenes()).hasSize(PlanValidator.MIN_SCENES);
			assertThat(plan.palette()).hasSize(3);
			assertThat(plan.title()).isNotBlank();
			assertThat(plan.scenes().get(0).narration()).isEqualTo("Zec je skakutao šumom.");
			assertThat(plan.scenes()).allSatisfy(scene -> assertThat(scene.actions()).isNotEmpty());
		}
	}

	@Test
	void clampsNumbersAndShortensNarration() throws Exception {
		String longNarration = "Bila jednom jedna vrlo dugačka rečenica koja nikako nije htjela stati. ".repeat(5);
		String scene = "{\"environment\":\"beach\",\"narration\":\"" + longNarration + "\",\"durationSec\":99,"
				+ "\"camera\":\"orbit\",\"actions\":[{\"characterKey\":\"zec\",\"type\":\"walk_to\",\"to\":{\"x\":40,\"z\":-40},"
				+ "\"startAt\":50,\"duration\":50}]}";
		String characters = "{\"key\":\"zec\",\"displayName\":\"Zec\",\"kind\":\"biped\",\"relativeSize\":9,\"tripoPrompt\":\"rabbit\"}";

		PlanValidator.Result result = validate(plan(characters, scene, scene, scene));

		StoryPlan plan = result.plan();
		assertThat(plan.characters().get(0).relativeSize()).isEqualTo(3.0);
		Scene first = plan.scenes().get(0);
		assertThat(first.durationSec()).isEqualTo(PlanValidator.MAX_DURATION);
		assertThat(first.narration().length()).isLessThanOrEqualTo(PlanValidator.MAX_NARRATION);
		assertThat(first.narration()).endsWith("…");
		assertThat(first.actions().get(0).to()).isEqualTo(new Point(5, -5));
		assertThat(first.actions().get(0).startAt()).isLessThan(first.durationSec());
		assertThat(first.actions().get(0).startAt() + first.actions().get(0).duration())
			.isLessThanOrEqualTo(first.durationSec());
		assertThat(first.camera().type()).isEqualTo(CameraType.ORBIT);
		assertThat(first.camera().targetKey()).isEqualTo("zec");
		assertThat(result.fixes()).anyMatch(fix -> fix.contains("relativeSize"));
	}

	@Test
	void repairsSloppyReferencesAndEnums() throws Exception {
		String scene = scene("\"camera\":{\"type\":\"crane\"},\"actions\":["
				+ "{\"characterKey\":\"ghost\",\"type\":\"walk_to\"},"
				+ "{\"characterKey\":\"Lisica\",\"type\":\"Run To\"},"
				+ "{\"characterKey\":\"zec\",\"type\":\"teleport\"},"
				+ "{\"characterKey\":\"ZEC\",\"type\":\"look_at\",\"targetKey\":\"lisica\"}]");

		StoryPlan plan = validate(plan(TWO_CHARACTERS, scene, scene, scene)).plan();

		Scene first = plan.scenes().get(0);
		assertThat(first.camera().type()).isEqualTo(CameraType.WIDE);
		assertThat(first.actions()).extracting(a -> a.characterKey() + ":" + a.type())
			.containsExactly("lisica:RUN_TO", "zec:LOOK_AT");
		assertThat(first.actions().get(0).to()).isNotNull();
		assertThat(first.actions().get(1).targetKey()).isEqualTo("lisica");
	}

	@Test
	void dropsExtraCharactersAndScenes() throws Exception {
		String characters = TWO_CHARACTERS + ",{\"key\":\"c\",\"tripoPrompt\":\"bear\"},{\"key\":\"d\",\"tripoPrompt\":\"owl\"}";
		String[] scenes = new String[9];
		java.util.Arrays.fill(scenes, GOOD_SCENE);

		StoryPlan plan = validate(plan(characters, scenes)).plan();

		assertThat(plan.characters()).hasSize(PlanValidator.MAX_CHARACTERS);
		assertThat(plan.scenes()).hasSize(PlanValidator.MAX_SCENES);
	}

	@Test
	void forcesTheTripoPromptStyleAndStripsUnsafeCharacters() throws Exception {
		String characters = "{\"key\":\"Zečić Đuro\",\"displayName\":\"Zečić <b>Đuro</b>\",\"kind\":\"biped\","
				+ "\"tripoPrompt\":\"šareni zečić!! {ignore previous} \\n\\\"photo\\\"\"},"
				+ "{\"key\":\"x\",\"displayName\":\"Čudo\"}";

		PlanValidator.Result result = validate(plan(characters, GOOD_SCENE, GOOD_SCENE, GOOD_SCENE));

		StoryPlan plan = result.plan();
		assertThat(plan.characters().get(0).key()).isEqualTo("zecic_duro");
		assertThat(plan.characters().get(0).displayName()).doesNotContain("<", ">");
		String prompt = plan.characters().get(0).tripoPrompt();
		assertThat(prompt).startsWith(PlanValidator.PROMPT_PREFIX + "sareni zecic").endsWith(PlanValidator.PROMPT_SUFFIX);
		assertThat(prompt).matches("[a-z0-9 ,'-]+");
		// a missing prompt is an error (worth a retry) but still gets a usable subject
		assertThat(result.errors()).anyMatch(error -> error.contains("characters[1].tripoPrompt"));
		assertThat(plan.characters().get(1).tripoPrompt()).isEqualTo(PlanValidator.canonicalPrompt("cudo"));
	}

	@Test
	void everyCharacterGetsOnStage() throws Exception {
		String onlyRabbit = scene("\"actions\":[{\"characterKey\":\"zec\",\"type\":\"jump\"}]");

		PlanValidator.Result result = validate(plan(TWO_CHARACTERS, onlyRabbit, onlyRabbit, onlyRabbit));

		assertThat(result.plan().scenes().get(0).actions())
			.anyMatch(action -> action.characterKey().equals("lisica") && action.type() == ActionType.ENTER);
	}

	@Test
	void planSurvivesAJsonRoundTrip() throws Exception {
		StoryPlan plan = validate(plan(TWO_CHARACTERS, GOOD_SCENE, GOOD_SCENE, GOOD_SCENE)).plan();

		String serialized = json.writeValueAsString(plan);

		assertThat(serialized).contains("\"mood\":\"funny\"", "\"kind\":\"quadruped\"", "\"type\":\"enter\"");
		assertThat(json.readValue(serialized, StoryPlan.class)).isEqualTo(plan);
	}

	@Test
	void storyChunksAlwaysReturnTheRequestedCount() {
		assertThat(PlanValidator.storyChunks("Jedna rečenica.", 3)).hasSize(3);
		assertThat(PlanValidator.storyChunks("", 4)).hasSize(4);
		assertThat(PlanValidator.storyChunks("A. B. C. D. E. F. G.", 3)).hasSize(3).doesNotContain("…");
	}

}
