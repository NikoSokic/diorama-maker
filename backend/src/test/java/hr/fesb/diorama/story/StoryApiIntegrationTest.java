package hr.fesb.diorama.story;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import hr.fesb.diorama.testsupport.ApiTestSupport;
import hr.fesb.diorama.testsupport.TestDb;
import hr.fesb.diorama.tripo.TripoClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The whole backend in mock mode: HTTP API, offline planner, mock Tripo, local file storage and a real
 * (embedded) Postgres with the Flyway schema. Nothing leaves this machine.
 */
@SpringBootTest
@AutoConfigureMockMvc
class StoryApiIntegrationTest extends ApiTestSupport {

	private static final String DATABASE = TestDb.newDatabaseUrl();

	@DynamicPropertySource
	static void settings(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", () -> DATABASE);
		registry.add("diorama.storage.local-dir", () -> "target/test-files/api");
	}

	@Autowired
	private TripoClient tripo;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private StartupTasks startupTasks;

	@Test
	void aStoryBecomesAPlayableDioramaWithRiggedModels() throws Exception {
		JsonNode story = createAndAwait("Robot i zec su se igrali u šumi. Zec je skočio visoko. Robot je plesao.", "hr");

		assertThat(story.path("status").asText()).isEqualTo("READY");
		assertThat(story.path("progress").asInt()).isEqualTo(100);
		assertThat(story.path("lang").asText()).isEqualTo("hr");
		assertThat(story.path("title").asText()).isNotBlank();
		assertThat(story.has("error")).isFalse();
		assertThat(story.path("plan").path("scenes")).hasSize(3);
		assertThat(story.path("plan").path("scenes").path(0).path("environment").asText()).isEqualTo("forest");
		assertThat(story.path("plan").path("source").asText()).isEqualTo("offline");
		assertThat(story.path("characters")).hasSize(2);

		JsonNode robot = character(story, "robot");
		assertThat(robot.path("displayName").asText()).isEqualTo("Robot");
		assertThat(robot.path("kind").asText()).isEqualTo("biped");
		assertThat(robot.path("status").asText()).isEqualTo("READY");
		assertThat(robot.path("progress").asInt()).isEqualTo(100);
		JsonNode model = robot.path("model");
		assertThat(model.path("rigged").asBoolean()).isTrue();
		assertThat(model.path("rigType").asText()).isEqualTo("biped");
		assertThat(model.path("glbUrl").asText()).startsWith("/api/files/").endsWith("/base.glb");
		assertThat(model.path("riggedGlbUrl").asText()).endsWith("/rigged.glb");
		assertThat(model.path("animations")).extracting(clip -> clip.path("name").asText())
			.containsExactly("walk", "idle", "run", "jump", "celebrate");
		assertThat(model.path("animations")).allSatisfy(clip -> {
			assertThat(clip.path("url").asText()).startsWith("/api/files/").endsWith("/anim.glb");
			assertThat(clip.path("clip").asText()).isNotBlank();
		});

		// the rabbit matches the mock library: a pre-animated model, no rig, clips already named like ours
		JsonNode rabbit = character(story, "rabbit").path("model");
		assertThat(rabbit.path("rigged").asBoolean()).isFalse();
		assertThat(rabbit.path("animations")).extracting(c -> c.path("name").asText()).contains("walk", "idle");
		assertThat(rabbit.path("animations").path(0).path("url").asText()).isEqualTo(rabbit.path("glbUrl").asText());

		// the model files are really served
		byte[] glb = mvc.perform(get(model.path("animations").path(0).path("url").asText()))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsByteArray();
		assertThat(new String(glb, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("glTF");

		JsonNode gallery = getJson("/api/stories?limit=48", 200);
		assertThat(gallery).anySatisfy(item -> {
			assertThat(item.path("slug").asText()).isEqualTo(story.path("slug").asText());
			assertThat(item.path("title").asText()).isEqualTo(story.path("title").asText());
			assertThat(item.path("environment").asText()).isEqualTo("forest");
			assertThat(item.path("characters")).extracting(JsonNode::asText).containsExactly("Robot", "Zec");
			assertThat(item.path("palette")).hasSize(3);
		});
	}

	@Test
	void theCreatorsPlayerSendsTheGalleryPictureOnce() throws Exception {
		JsonNode created = postStory("A fox finds a red kite in the meadow.", "en", null, 202);
		String slug = created.path("slug").asText();
		String token = created.path("uploadToken").asText();
		assertThat(token).hasSizeGreaterThan(20);
		assertThat(awaitStory(slug).path("thumbnailUrl").asText(null)).isNull();
		byte[] png = ThumbnailServiceTest.image("png", 960, 540);

		mvc.perform(put("/api/stories/" + slug + "/thumbnail").contentType("image/png").header("X-Upload-Token", "guess").content(png))
			.andExpect(status().isForbidden());
		mvc.perform(put("/api/stories/" + slug + "/thumbnail").contentType("image/png").header("X-Upload-Token", token).content(png))
			.andExpect(status().isOk());
		String url = getJson("/api/stories/" + slug, 200).path("thumbnailUrl").asText();
		assertThat(url).startsWith("/api/files/thumbs/" + slug);
		byte[] served = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
		assertThat(ThumbnailService.sniff(served)).contains("jpeg");

		// the token is spent and the story has its picture
		mvc.perform(put("/api/stories/" + slug + "/thumbnail").contentType("image/png").header("X-Upload-Token", token).content(png))
			.andExpect(status().isConflict());
		// bigger than the thumbnail limit: refused before it is read
		mvc.perform(put("/api/stories/" + slug + "/thumbnail").contentType("image/png").header("X-Upload-Token", token)
			.content(new byte[ThumbnailService.MAX_UPLOAD_BYTES + 10]))
			.andExpect(status().isPayloadTooLarge());
	}
	@Test
	void theSameCharactersAreServedFromTheCacheForFree() throws Exception {
		String text = "Medvjed i lisica šeću livadom. Lisica maše. Medvjed slavi.";
		JsonNode first = createAndAwait(text, "hr");
		double balanceAfterFirst = tripo.balance().balance();

		JsonNode second = createAndAwait(text, "hr");

		assertThat(second.path("status").asText()).isEqualTo("READY");
		assertThat(second.path("slug").asText()).isNotEqualTo(first.path("slug").asText());
		assertThat(tripo.balance().balance()).as("cached models cost no credits").isEqualTo(balanceAfterFirst);
		assertThat(character(second, "bear").path("model")).isEqualTo(character(first, "bear").path("model"));
		assertThat(character(second, "fox").path("model")).isEqualTo(character(first, "fox").path("model"));
	}

	@Test
	void englishStoriesGetEnglishPlans() throws Exception {
		JsonNode story = createAndAwait("A penguin found a rocket. The penguin jumped in. They flew to space!", "en");

		assertThat(story.path("status").asText()).isEqualTo("READY");
		assertThat(story.path("lang").asText()).isEqualTo("en");
		assertThat(story.path("plan").path("language").asText()).isEqualTo("en");
		assertThat(character(story, "penguin").path("displayName").asText()).isEqualTo("Penguin");
		assertThat(character(story, "rocket").path("model").path("rigged").asBoolean()).as("objects are not rigged").isFalse();
		assertThat(character(story, "rocket").path("model").path("animations")).isEmpty();
	}

	@Test
	void rejectsTextThatIsEmptyOrTooLong() throws Exception {
		assertThat(postStory("", "hr", null, 400).path("code").asText()).isEqualTo("INVALID_TEXT");
		assertThat(postStory("  \n\t ", "hr", null, 400).path("code").asText()).isEqualTo("INVALID_TEXT");
		assertThat(postStory(null, "hr", null, 400).path("code").asText()).isEqualTo("INVALID_TEXT");
		JsonNode tooLong = postStory("a".repeat(501), "en", null, 400);
		assertThat(tooLong.path("code").asText()).isEqualTo("INVALID_TEXT");
		assertThat(tooLong.path("message").asText()).isEqualTo("Write a story between 1 and 500 characters.");

		assertThat(awaitStory(createStory("š".repeat(500), "hr")).path("status").asText()).isEqualTo("READY");

		mvc.perform(post("/api/stories").contentType(MediaType.APPLICATION_JSON).content("{not json"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/stories").contentType(MediaType.TEXT_PLAIN).content("hello"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void refusesOversizedBodiesButAcceptsTheLongestPossibleStory() throws Exception {
		JsonNode tooLarge = postStory("a".repeat(RequestSizeFilter.MAX_BODY_BYTES), "en", null, 413);
		assertThat(tooLarge.path("code").asText()).isEqualTo("TOO_LARGE");
		// the body is never read, so the language comes from Accept-Language (absent here: Croatian)
		assertThat(tooLarge.path("message").asText()).isEqualTo("Ovaj zahtjev je prevelik.");

		// 500 emoji are 500 characters but 2000 bytes of UTF-8: the largest story a real client can send
		assertThat(awaitStory(createStory("🦊".repeat(500), "en")).path("status").asText()).isEqualTo("READY");
	}

	@Test
	void unsafeStoriesFailWithAFriendlyMessageAndStayPrivate() throws Exception {
		JsonNode story = createAndAwait("Vuk je ubio zeca u šumi.", "hr");

		assertThat(story.path("status").asText()).isEqualTo("FAILED");
		assertThat(story.path("errorCode").asText()).isEqualTo("UNSAFE_CONTENT");
		assertThat(story.path("error").asText()).contains("pozornicu");
		assertThat(story.has("plan")).isFalse();
		assertThat(story.path("characters")).isEmpty();
		assertThat(getJson("/api/stories?limit=48", 200))
			.noneMatch(item -> item.path("slug").asText().equals(story.path("slug").asText()));
	}

	@Test
	void limitsStoriesPerVisitorPerDay() throws Exception {
		String visitor = "203.0.113.9";
		List<String> slugs = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			slugs.add(postStory("Pas trči po parku. Pas skače. Pas maše.", "hr", visitor, 202).path("slug").asText());
		}

		JsonNode refused = postStory("Pas trči po parku.", "hr", visitor, 429);
		assertThat(refused.path("code").asText()).isEqualTo("RATE_LIMITED");
		assertThat(refused.path("message").asText()).contains("sutra");

		// another visitor is not affected
		slugs.add(postStory("Pas trči po parku. Pas skače. Pas maše.", "hr", "203.0.113.10", 202).path("slug").asText());
		for (String slug : slugs) {
			assertThat(awaitStory(slug).path("status").asText()).isEqualTo("READY");
		}
		// only a hash of the address is stored
		assertThat(jdbc.sql("SELECT count(*) FROM stories WHERE ip_hash LIKE '%203.0.113%'").query(Integer.class).single()).isZero();
	}

	@Test
	void unknownStoriesAreNotFound() throws Exception {
		JsonNode missing = getJson("/api/stories/zzzzzzzzz", 404);
		assertThat(missing.path("code").asText()).isEqualTo("NOT_FOUND");
		assertThat(missing.path("message").asText()).isNotBlank();
		assertThat(getJson("/api/stories/NOT_a-valid.slug", 404).path("code").asText()).isEqualTo("NOT_FOUND");
		assertThat(getJson("/api/nothing-here", 404).path("code").asText()).isEqualTo("NOT_FOUND");
	}

	@Test
	void storiesInterruptedByARestartAreMarkedFailed() throws Exception {
		jdbc.sql("INSERT INTO stories (id, slug, text, lang, status, ip_hash) VALUES (:id, 'krnjkrnjk', 'Zec.', 'hr', 'GENERATING_MODELS', 'x')")
			.param("id", UUID.randomUUID())
			.update();

		startupTasks.run(new DefaultApplicationArguments());

		JsonNode story = getJson("/api/stories/krnjkrnjk", 200);
		assertThat(story.path("status").asText()).isEqualTo("FAILED");
		assertThat(story.path("errorCode").asText()).isEqualTo("INTERRUPTED");
		assertThat(story.path("error").asText()).contains("prekinuta");
	}

	@Test
	void creditsAreOnlyVisibleLocallyOrWithTheAdminToken() throws Exception {
		JsonNode credits = getJson("/api/credits", 200);
		assertThat(credits.path("mode").asText()).isEqualTo("mock");
		assertThat(credits.path("known").asBoolean()).isTrue();
		assertThat(credits.path("costs").path("textToModel").asInt()).isEqualTo(20);

		mvc.perform(get("/api/credits").with(request -> {
			request.setRemoteAddr("203.0.113.9");
			return request;
		})).andExpect(status().isForbidden());
		// no admin token is configured, so no header value can open it
		mvc.perform(get("/api/credits").header("X-Admin-Token", "").with(request -> {
			request.setRemoteAddr("203.0.113.9");
			return request;
		})).andExpect(status().isForbidden());
	}

	@Test
	void corsAllowsTheFrontendToPostStories() throws Exception {
		mvc.perform(options("/api/stories").header("Origin", "http://localhost:5173")
				.header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
			.andExpect(status().isOk())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
		mvc.perform(options("/api/stories").header("Origin", "https://evil.example")
				.header("Access-Control-Request-Method", "POST"))
			.andExpect(status().isForbidden());
		// the player's thumbnail upload is a PUT with its own header
		mvc.perform(options("/api/stories/abc123xyz/thumbnail").header("Origin", "http://localhost:5173")
				.header("Access-Control-Request-Method", "PUT").header("Access-Control-Request-Headers", "content-type,x-upload-token"))
			.andExpect(status().isOk())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
	}

	@Test
	void severalFrontendOriginsCanBeConfigured() {
		assertThat(hr.fesb.diorama.config.CorsConfig.origins(" https://diorama.example/ , http://localhost:5173,"))
			.containsExactly("https://diorama.example", "http://localhost:5173");
	}

}
