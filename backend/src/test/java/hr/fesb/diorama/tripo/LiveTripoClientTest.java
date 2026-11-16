package hr.fesb.diorama.tripo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.testsupport.Fixtures;
import hr.fesb.diorama.testsupport.StubServer;
import hr.fesb.diorama.testsupport.StubServer.Reply;
import hr.fesb.diorama.testsupport.TestProps;
import hr.fesb.diorama.tripo.TripoException.Reason;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The live client against a local stub that answers like Tripo v3 (docs/API_NOTES.md §1). No real calls. */
class LiveTripoClientTest {

	private static final String KEY = "tsk_test-key-do-not-leak";
	private static final String TASK_CREATED = "{\"code\":0,\"data\":{\"task_id\":\"task-123\"}}";

	private final ObjectMapper json = new ObjectMapper();
	private final StubServer server = new StubServer();
	private final LiveTripoClient client = new LiveTripoClient(TestProps.of(
			"tripo.api-key", KEY, "tripo.base-url", server.url() + "/v3/", "tripo.mode", "live",
			"tripo.request-timeout", "2s").tripo(), json);

	@AfterEach
	void stop() {
		server.close();
	}

	@Test
	void textToModelSendsThePlannedRequest() throws Exception {
		server.on("POST", "/v3/generation/text-to-model", Reply.json(200, TASK_CREATED));

		assertThat(client.textToModel("cute stylized low-poly toy fox", Kind.QUADRUPED)).isEqualTo("task-123");

		StubServer.Request request = server.requests().get(0);
		assertThat(request.headers()).containsEntry("authorization", "Bearer " + KEY);
		JsonNode body = json.readTree(request.body());
		assertThat(body.path("prompt").asText()).isEqualTo("cute stylized low-poly toy fox");
		assertThat(body.path("model").asText()).isEqualTo("v3.1-20260211");
		assertThat(body.path("face_limit").asInt()).isEqualTo(10000);
		assertThat(body.path("texture").asBoolean()).isTrue();
		assertThat(body.path("pbr").asBoolean(true)).isFalse();
		assertThat(body.path("texture_quality").asText()).isEqualTo("standard");
		assertThat(body.has("quad")).as("quad would force FBX output").isFalse();
		assertThat(body.has("type")).as("v3 has no type field").isFalse();
	}

	@Test
	void riggingCallsUseTheDocumentedBodies() throws Exception {
		server.on("POST", "/v3/animations/rig-check", Reply.json(200, TASK_CREATED));
		server.on("POST", "/v3/animations/rig", Reply.json(200, TASK_CREATED));
		server.on("POST", "/v3/animations/retarget", Reply.json(200, TASK_CREATED));

		client.rigCheck("model-task");
		client.rig("model-task", "biped", "v1.0-20240301");
		client.retarget("rig-task", List.of("preset:biped:walk", "preset:biped:idle"));
		client.retarget("rig-task", List.of("preset:quadruped:walk"));

		assertThat(json.readTree(server.requests().get(0).body()).path("input").asText()).isEqualTo("model-task");
		JsonNode rig = json.readTree(server.requests().get(1).body());
		assertThat(rig.path("model").asText()).isEqualTo("v1.0-20240301");
		assertThat(rig.path("rig_type").asText()).isEqualTo("biped");
		assertThat(rig.path("out_format").asText()).isEqualTo("glb");
		JsonNode many = json.readTree(server.requests().get(2).body());
		assertThat(many.path("input").asText()).isEqualTo("rig-task");
		assertThat(many.path("animations")).hasSize(2);
		assertThat(many.has("animation")).isFalse();
		assertThat(many.path("animate_in_place").asBoolean()).isTrue();
		JsonNode one = json.readTree(server.requests().get(3).body());
		assertThat(one.path("animation").asText()).isEqualTo("preset:quadruped:walk");
		assertThat(one.has("animations")).isFalse();
	}

	@Test
	void readsTaskStatesAndOutputs() {
		server.on("GET", "/v3/tasks/task-123",
				Reply.json(200, "{\"code\":0,\"data\":{\"task_id\":\"task-123\",\"type\":\"text_to_model\",\"status\":\"running\",\"progress\":42}}"),
				Reply.json(200, "{\"code\":0,\"data\":{\"task_id\":\"task-123\",\"status\":\"some_new_status\",\"progress\":50}}"),
				Reply.json(200, "{\"code\":0,\"data\":{\"task_id\":\"task-123\",\"type\":\"text_to_model\",\"status\":\"success\",\"progress\":100,"
						+ "\"credits_consumed\":20,\"output\":{\"model_url\":\"https://cdn.example/m.glb\",\"rendered_image_url\":\"https://cdn.example/m.png\"}}}"));
		server.on("GET", "/v3/tasks/check-1",
				Reply.json(200, "{\"code\":0,\"data\":{\"status\":\"success\",\"output\":{\"riggable\":true,\"rig_type\":\"quadruped\"}}}"));
		server.on("GET", "/v3/tasks/bad-1",
				Reply.json(200, "{\"code\":0,\"data\":{\"status\":\"failed\",\"error_code\":1,\"error_message\":\"generation failed\"}}"));

		TripoTask running = client.task("task-123");
		assertThat(running.status()).isEqualTo(TripoTask.Status.PENDING);
		assertThat(running.progress()).isEqualTo(42);
		assertThat(client.task("task-123").status()).as("unknown statuses keep polling").isEqualTo(TripoTask.Status.PENDING);
		TripoTask done = client.task("task-123");
		assertThat(done.status()).isEqualTo(TripoTask.Status.SUCCESS);
		assertThat(done.modelUrl()).isEqualTo("https://cdn.example/m.glb");
		assertThat(done.renderedImageUrl()).isEqualTo("https://cdn.example/m.png");
		assertThat(done.creditsConsumed()).isEqualTo(20.0);

		TripoTask check = client.task("check-1");
		assertThat(check.riggable()).isTrue();
		assertThat(check.rigType()).isEqualTo("quadruped");

		TripoTask failed = client.task("bad-1");
		assertThat(failed.status()).isEqualTo(TripoTask.Status.FAILED);
		assertThat(failed.errorMessage()).isEqualTo("generation failed");
	}

	@Test
	void readsTheBalance() {
		server.on("GET", "/v3/account/balance", Reply.json(200, "{\"code\":0,\"data\":{\"balance\":285.5,\"frozen\":20}}"));

		assertThat(client.balance()).isEqualTo(new TripoClient.Balance(285.5, 20));
	}

	@Test
	void mapsErrorCodesAndDoesNotRetryThem() {
		server.on("POST", "/v3/generation/text-to-model",
				Reply.json(403, "{\"code\":2010,\"status\":\"error\",\"message\":\"insufficient credits\"}"),
				Reply.json(400, "{\"code\":2008,\"status\":\"error\",\"message\":\"content policy\"}"),
				Reply.json(401, "{\"code\":1002,\"message\":\"bad key\"}"),
				Reply.json(500, "{\"code\":1000,\"message\":\"server error\"}"));

		assertThat(reasonOf(() -> client.textToModel("p", Kind.BIPED))).isEqualTo(Reason.INSUFFICIENT_CREDITS);
		assertThat(reasonOf(() -> client.textToModel("p", Kind.BIPED))).isEqualTo(Reason.CONTENT_POLICY);
		assertThat(reasonOf(() -> client.textToModel("p", Kind.BIPED))).isEqualTo(Reason.AUTH);
		// a 5xx on a creating call might still have started a task: never resubmit
		assertThat(reasonOf(() -> client.textToModel("p", Kind.BIPED))).isEqualTo(Reason.SERVER);
		assertThat(server.requests()).hasSize(4);
	}

	@Test
	void errorMessagesNeverContainTheKey() {
		server.on("GET", "/v3/account/balance", Reply.json(401, "{\"code\":1002,\"message\":\"invalid api key\"}"));

		assertThatThrownBy(client::balance).isInstanceOf(TripoException.class).hasMessageNotContaining(KEY);
	}

	@Test
	void rateLimitedCreatesAreRetried() {
		server.on("POST", "/v3/generation/text-to-model",
				Reply.json(429, "{\"code\":2000,\"message\":\"concurrency limit\"}").header("Retry-After", "0"),
				Reply.json(200, TASK_CREATED));

		assertThat(client.textToModel("p", Kind.BIPED)).isEqualTo("task-123");
		assertThat(server.requests()).hasSize(2);
	}

	@Test
	void readsAreRetriedOnServerErrors() {
		server.on("GET", "/v3/tasks/task-123",
				Reply.json(502, "<html>bad gateway</html>"),
				Reply.json(200, "{\"code\":0,\"data\":{\"status\":\"queued\",\"progress\":0}}"));

		assertThat(client.task("task-123").status()).isEqualTo(TripoTask.Status.PENDING);
		assertThat(server.requests()).hasSize(2);
	}

	@Test
	void rejectsOddTaskIdsBeforeCallingTheApi() {
		assertThat(reasonOf(() -> client.task("../account/balance"))).isEqualTo(Reason.NOT_FOUND);
		assertThat(server.requests()).isEmpty();
	}

	@Test
	void downloadsOutputsWithoutSendingTheKey() {
		byte[] glb = Fixtures.mockGlb("object");
		server.on("GET", "/cdn/model.glb", Reply.bytes(glb));

		assertThat(client.download(server.url() + "/cdn/model.glb")).isEqualTo(glb);
		assertThat(server.requests().get(0).headers()).doesNotContainKey("authorization");
	}

	@Test
	void aMissingDownloadIsReportedAsBadOutput() {
		assertThat(reasonOf(() -> client.download(server.url() + "/cdn/gone.glb"))).isEqualTo(Reason.BAD_OUTPUT);
		assertThat(reasonOf(() -> client.download("ftp://example.com/x.glb"))).isEqualTo(Reason.BAD_OUTPUT);
	}

	private static Reason reasonOf(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
		return catchThrowableOfType(TripoException.class, call).reason();
	}

}
