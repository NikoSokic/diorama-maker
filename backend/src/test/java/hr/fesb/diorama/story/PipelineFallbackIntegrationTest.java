package hr.fesb.diorama.story;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fasterxml.jackson.databind.JsonNode;
import hr.fesb.diorama.model.CreditGuard;
import hr.fesb.diorama.plan.StoryPlanner;
import hr.fesb.diorama.testsupport.ApiTestSupport;
import hr.fesb.diorama.testsupport.Fixtures;
import hr.fesb.diorama.testsupport.TestDb;
import hr.fesb.diorama.tripo.MockTripoClient;
import hr.fesb.diorama.tripo.TripoClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * "Zero dead ends": what the pipeline does when generation fails, rigging is impossible, credits run short or
 * the planner breaks. The planner is scripted so each test controls the exact Tripo prompts; the mock Tripo
 * reacts to the keywords {@code mock-fail}, {@code mock-flaky} and {@code mock-norig}.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PipelineFallbackIntegrationTest extends ApiTestSupport {

	private static final String DATABASE = TestDb.newDatabaseUrl();
	/** Story text -> what the planner answers for it. */
	private static final Map<String, StoryPlanner.Outcome> SCRIPT = new ConcurrentHashMap<>();

	@DynamicPropertySource
	static void settings(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", () -> DATABASE);
		registry.add("diorama.storage.local-dir", () -> "target/test-files/fallback");
	}

	@TestConfiguration
	static class ScriptedPlannerConfig {

		@Bean
		@Primary
		StoryPlanner scriptedPlanner() {
			return (text, lang) -> {
				StoryPlanner.Outcome outcome = SCRIPT.get(text);
				if (outcome == null) {
					throw new IllegalStateException("planner exploded (test)");
				}
				return outcome;
			};
		}
	}

	@Autowired
	private TripoClient tripo;

	@Autowired
	private CreditGuard credits;

	private MockTripoClient wallet() {
		return (MockTripoClient) tripo;
	}

	@BeforeEach
	@AfterEach
	void refillWallet() {
		wallet().setBalance(10_000);
		credits.status();
	}

	@Test
	void aFailedModelBecomesAPlaceholderAndTheStoryStillPlays() throws Exception {
		SCRIPT.put("fallbacks", StoryPlanner.Outcome.ok(Fixtures.plan(
				"glitch", "biped", "mock-fail broken robot",
				"shy", "biped", "mock-norig shy robot",
				"lucky", "creature", "mock-flaky lucky bird")));

		JsonNode story = createAndAwait("fallbacks", "en");

		assertThat(story.path("status").asText()).isEqualTo("READY");
		assertThat(story.path("progress").asInt()).isEqualTo(100);

		JsonNode glitch = character(story, "glitch");
		assertThat(glitch.path("status").asText()).isEqualTo("PLACEHOLDER");
		assertThat(glitch.path("error").asText()).isEqualTo("GENERATION_FAILED");
		assertThat(glitch.path("progress").asInt()).isEqualTo(100);
		assertThat(glitch.has("model")).isFalse();

		JsonNode shy = character(story, "shy");
		assertThat(shy.path("status").asText()).isEqualTo("READY");
		assertThat(shy.path("model").path("rigged").asBoolean()).as("rig check said no").isFalse();
		assertThat(shy.path("model").path("animations")).isEmpty();
		assertThat(shy.path("model").path("glbUrl").asText()).endsWith("/base.glb");

		JsonNode lucky = character(story, "lucky");
		assertThat(lucky.path("status").asText()).as("one automatic retry").isEqualTo("READY");
		assertThat(lucky.has("error")).isFalse();
	}

	@Test
	void shortCreditsSkipRiggingFirstAndGenerationLast() throws Exception {
		SCRIPT.put("tight", StoryPlanner.Outcome.ok(Fixtures.plan(
				"alpha", "biped", "tiny robot alpha", "beta", "biped", "tiny robot beta")));
		wallet().setBalance(45);

		JsonNode tight = createAndAwait("tight", "en");

		assertThat(tight.path("status").asText()).isEqualTo("READY");
		for (String key : new String[] { "alpha", "beta" }) {
			assertThat(character(tight, key).path("status").asText()).isEqualTo("READY");
			assertThat(character(tight, key).path("model").path("rigged").asBoolean()).as("no credits left for rigging").isFalse();
		}
		assertThat(wallet().balance().balance()).isEqualTo(5);

		SCRIPT.put("broke", StoryPlanner.Outcome.ok(Fixtures.plan(
				"gamma", "creature", "tiny robot gamma", "delta", "creature", "tiny robot delta")));
		wallet().setBalance(25);

		JsonNode broke = createAndAwait("broke", "en");

		assertThat(broke.path("status").asText()).as("the story still plays").isEqualTo("READY");
		assertThat(character(broke, "gamma").path("status").asText()).isEqualTo("READY");
		assertThat(character(broke, "delta").path("status").asText()).isEqualTo("PLACEHOLDER");
		assertThat(character(broke, "delta").path("error").asText()).isEqualTo("NO_CREDITS");
		assertThat(wallet().balance().balance()).isEqualTo(5);
	}

	@Test
	void aBipedGetsFewerClipsWhenThatIsAllTheBudgetAllows() throws Exception {
		SCRIPT.put("some clips", StoryPlanner.Outcome.ok(Fixtures.plan("epsilon", "biped", "tiny robot epsilon")));
		// model 20 + rig 25 + 2 clips 20 = 65
		wallet().setBalance(70);

		JsonNode story = createAndAwait("some clips", "en");

		JsonNode model = character(story, "epsilon").path("model");
		assertThat(model.path("rigged").asBoolean()).isTrue();
		assertThat(model.path("animations")).extracting(clip -> clip.path("name").asText()).containsExactly("walk", "idle");
		assertThat(wallet().balance().balance()).isEqualTo(5);
	}

	@Test
	void newStoriesAreRefusedWhenCreditsAreGone() throws Exception {
		SCRIPT.put("no credits", StoryPlanner.Outcome.ok(Fixtures.plan("zeta", "creature", "tiny robot zeta")));
		wallet().setBalance(0);
		credits.status();

		JsonNode refused = postStory("no credits", "en", null, 503);

		assertThat(refused.path("code").asText()).isEqualTo("CREDITS_EXHAUSTED");
		assertThat(refused.path("message").asText()).contains("toy workshop");
	}

	@Test
	void plansMadeWithoutTheLlmStayOutOfTheGallery() throws Exception {
		SCRIPT.put("moderated", StoryPlanner.Outcome.ok(Fixtures.plan("eta", "object", "tiny robot eta")));
		SCRIPT.put("unmoderated", StoryPlanner.Outcome.fallback(Fixtures.plan("eta", "object", "tiny robot eta")));

		String shown = createAndAwait("moderated", "en").path("slug").asText();
		JsonNode hidden = createAndAwait("unmoderated", "en");

		assertThat(hidden.path("status").asText()).as("still playable by link").isEqualTo("READY");
		JsonNode gallery = getJson("/api/stories", 200);
		assertThat(gallery).extracting(item -> item.path("slug").asText()).contains(shown)
			.doesNotContain(hidden.path("slug").asText());
	}

	@Test
	void anUnexpectedPlannerErrorFailsTheStoryWithAFriendlyMessage() throws Exception {
		JsonNode story = createAndAwait("this text is not in the script", "en");

		assertThat(story.path("status").asText()).isEqualTo("FAILED");
		assertThat(story.path("errorCode").asText()).isEqualTo("INTERNAL");
		assertThat(story.path("error").asText()).isEqualTo("Something went wrong. Please try again.");
		assertThat(story.toString()).doesNotContain("exploded");
	}

}
