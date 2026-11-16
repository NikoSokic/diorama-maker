package hr.fesb.diorama.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;

import hr.fesb.diorama.testsupport.StubServer;
import hr.fesb.diorama.testsupport.StubServer.Reply;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ModelStorageTest {

	private static final String KEY = "sb_secret_test-do-not-leak";

	@Test
	void localStorageWritesFilesAndServesThemUnderApiFiles(@TempDir Path dir) throws Exception {
		LocalModelStorage storage = new LocalModelStorage(dir.toString());

		String url = storage.put("abc123/base.glb", new byte[] { 1, 2, 3 }, ModelStorage.GLB);

		assertThat(url).isEqualTo("/api/files/abc123/base.glb");
		assertThat(Files.readAllBytes(dir.resolve("abc123/base.glb"))).containsExactly(1, 2, 3);
		assertThat(storage.serves(url)).isTrue();
		assertThat(storage.serves("/api/files/abc123/missing.glb")).isFalse();
		assertThat(storage.serves("https://example.supabase.co/storage/v1/object/public/models/abc123/base.glb")).isFalse();
		// replacing is allowed (cache refresh)
		storage.put("abc123/base.glb", new byte[] { 9 }, ModelStorage.GLB);
		assertThat(Files.readAllBytes(dir.resolve("abc123/base.glb"))).containsExactly(9);
	}

	@Test
	void localStorageRejectsPathsThatEscapeItsFolder(@TempDir Path dir) {
		LocalModelStorage storage = new LocalModelStorage(dir.toString());

		for (String path : new String[] { "../evil.glb", "a/../../evil.glb", "/etc/passwd", "a\\b.glb", "", "a//b.glb" }) {
			assertThatThrownBy(() -> storage.put(path, new byte[1], ModelStorage.GLB)).as(path)
				.isInstanceOf(IllegalArgumentException.class);
		}
		assertThat(storage.serves("/api/files/../secret.txt")).isFalse();
	}

	@Test
	void supabaseUploadsWithUpsertAndReturnsThePublicUrl() {
		try (StubServer server = new StubServer()) {
			server.on("POST", "/storage/v1/object/models/abc/base.glb", Reply.json(200, "{\"Key\":\"models/abc/base.glb\"}"));
			SupabaseModelStorage storage = new SupabaseModelStorage(
					TestProps.of("supabase.url", server.url() + "/", "supabase.service-key", KEY).supabase());

			String url = storage.put("abc/base.glb", new byte[] { 1, 2, 3 }, ModelStorage.GLB);

			assertThat(url).isEqualTo(server.url() + "/storage/v1/object/public/models/abc/base.glb");
			assertThat(storage.serves(url)).isTrue();
			assertThat(storage.serves("/api/files/abc/base.glb")).isFalse();
			StubServer.Request request = server.requests().get(0);
			assertThat(request.headers()).containsEntry("apikey", KEY).containsEntry("authorization", "Bearer " + KEY)
				.containsEntry("x-upsert", "true").containsEntry("content-type", ModelStorage.GLB);
			assertThat(request.body()).hasSize(3);
		}
	}

	@Test
	void supabaseFallsBackToTheApikeyOnlyHeaderShape() {
		try (StubServer server = new StubServer()) {
			server.on("POST", "/storage/v1/object/models/abc/base.glb",
					Reply.json(400, "{\"message\":\"Invalid Compact JWS\"}"), Reply.json(200, "{}"));
			SupabaseModelStorage storage = new SupabaseModelStorage(
					TestProps.of("supabase.url", server.url(), "supabase.service-key", KEY).supabase());

			storage.put("abc/base.glb", new byte[1], ModelStorage.GLB);

			assertThat(server.requests()).hasSize(2);
			assertThat(server.requests().get(1).headers()).containsEntry("apikey", KEY).doesNotContainKey("authorization");
		}
	}

	@Test
	void supabaseFailuresDoNotLeakTheKey() {
		try (StubServer server = new StubServer()) {
			server.on("POST", "/storage/v1/object/models/abc/base.glb", Reply.json(404, "{\"message\":\"Bucket not found\"}"));
			SupabaseModelStorage storage = new SupabaseModelStorage(
					TestProps.of("supabase.url", server.url(), "supabase.service-key", KEY).supabase());

			assertThatThrownBy(() -> storage.put("abc/base.glb", new byte[1], ModelStorage.GLB))
				.isInstanceOf(ModelStorage.StorageException.class)
				.hasMessageContaining("404")
				.hasMessageNotContaining(KEY);
		}
	}

}
