package hr.fesb.diorama.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.testsupport.StubServer;
import hr.fesb.diorama.testsupport.StubServer.Reply;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Talks to a local stub, never to Google. Response shapes are the ones recorded in docs/API_NOTES.md §2. */
class GeminiClientTest {

	private static final String KEY = "test-gemini-key-do-not-leak";
	private static final String INTERACTIONS = "/v1beta/interactions";
	private static final String LEGACY = "/v1beta/models/gemini-test:generateContent";
	private static final String INTERACTION_ANSWER = """
			{"status":"completed","model":"gemini-test","steps":[
			  {"type":"thought","content":[{"type":"thought","text":"thinking..."}]},
			  {"type":"model_output","content":[{"type":"text","text":"{\\"title\\":"},{"type":"text","text":"\\"Zec\\"}"}]}]}
			""";
	private static final String LEGACY_ANSWER = """
			{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\\"title\\":\\"Legacy\\"}"}]}}]}
			""";

	private final ObjectMapper json = new ObjectMapper();
	private final StubServer server = new StubServer();
	private final GeminiClient client = new GeminiClient(TestProps.of(
			"gemini.api-key", KEY, "gemini.model", "gemini-test", "gemini.base-url", server.url() + "/v1beta",
			"gemini.timeout", "2s").gemini(), json);

	@AfterEach
	void stop() {
		server.close();
	}

	private String generate() {
		return client.generate("SYSTEM RULES", "the story", PlanSchema.schema());
	}

	@Test
	void readsTheModelOutputOfTheInteractionsApi() throws Exception {
		server.on("POST", INTERACTIONS, Reply.json(200, INTERACTION_ANSWER));

		assertThat(generate()).isEqualTo("{\"title\":\"Zec\"}");

		StubServer.Request request = server.requests().get(0);
		assertThat(request.headers()).containsEntry("x-goog-api-key", KEY).containsKey("api-revision");
		JsonNode body = json.readTree(request.body());
		assertThat(body.path("model").asText()).isEqualTo("gemini-test");
		assertThat(body.path("system_instruction").asText()).isEqualTo("SYSTEM RULES");
		assertThat(body.path("input").asText()).isEqualTo("the story");
		assertThat(body.path("store").asBoolean(true)).isFalse();
		assertThat(body.path("response_format").path("mime_type").asText()).isEqualTo("application/json");
		assertThat(body.path("response_format").path("schema").path("properties").has("scenes")).isTrue();
		assertThat(body.path("safety_settings")).hasSize(5)
			.allSatisfy(setting -> assertThat(setting.path("threshold").asText()).isEqualTo("block_low_and_above"));
		assertThat(body.has("temperature")).isFalse();
	}

	@Test
	void fallsBackToGenerateContentWhenInteractionsFails() throws Exception {
		server.on("POST", INTERACTIONS, Reply.json(500, "{\"error\":{\"message\":\"boom\"}}"));
		server.on("POST", LEGACY, Reply.json(200, LEGACY_ANSWER));

		assertThat(generate()).isEqualTo("{\"title\":\"Legacy\"}");

		JsonNode body = json.readTree(server.requests("POST", LEGACY).get(0).body());
		assertThat(body.path("systemInstruction").path("parts").path(0).path("text").asText()).isEqualTo("SYSTEM RULES");
		assertThat(body.path("contents").path(0).path("parts").path(0).path("text").asText()).isEqualTo("the story");
		assertThat(body.path("generationConfig").path("responseMimeType").asText()).isEqualTo("application/json");
		assertThat(body.path("generationConfig").path("responseSchema").path("type").asText()).isEqualTo("object");
		assertThat(body.path("safetySettings")).hasSize(4);
	}

	@Test
	void aBlockedInputIsReportedAsBlocked() {
		server.on("POST", INTERACTIONS,
				Reply.json(400, "{\"error\":{\"code\":\"safety\",\"message\":\"Input blocked: unsafe content\"}}"));

		assertThatThrownBy(this::generate).isInstanceOf(GeminiClient.BlockedException.class);
		assertThat(server.requests("POST", LEGACY)).isEmpty();
	}

	@Test
	void aBlockedLegacyAnswerIsReportedAsBlocked() {
		server.on("POST", INTERACTIONS, Reply.json(404, "{}"));
		server.on("POST", LEGACY, Reply.json(200, "{\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}"));

		assertThatThrownBy(this::generate).isInstanceOf(GeminiClient.BlockedException.class);
	}

	@Test
	void quotaErrorsAreRetriedOnceThenReportedWithoutTheKey() {
		server.on("POST", INTERACTIONS, Reply.json(429, "{\"error\":{\"message\":\"quota\"}}"));

		assertThatThrownBy(this::generate)
			.isInstanceOf(GeminiClient.UnavailableException.class)
			.hasMessageContaining("429")
			.hasMessageNotContaining(KEY);
		assertThat(server.requests("POST", INTERACTIONS)).hasSize(2);
		assertThat(server.requests("POST", LEGACY)).isEmpty();
	}

	@Test
	void anOutageOnBothEndpointsIsUnavailable() {
		server.on("POST", INTERACTIONS, Reply.json(503, "{}"));
		server.on("POST", LEGACY, Reply.json(503, "{}"));

		assertThatThrownBy(this::generate)
			.isInstanceOf(GeminiClient.UnavailableException.class)
			.hasMessageNotContaining(KEY);
	}

	@Test
	void anUnreachableServerIsUnavailable() {
		server.close();

		assertThatThrownBy(this::generate).isInstanceOf(GeminiClient.UnavailableException.class);
	}

}
