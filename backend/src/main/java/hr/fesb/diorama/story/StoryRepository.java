package hr.fesb.diorama.story;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class StoryRepository {

	public enum StoryStatus { ANALYZING, GENERATING_MODELS, READY, FAILED }

	public enum CharacterStatus { PENDING, GENERATING, RIGGING, READY, PLACEHOLDER }

	public record StoryRow(UUID id, String slug, String text, String lang, String planJson, StoryStatus status,
			String error, String errorCode, boolean isPublic, Instant createdAt) {
	}

	public record CharacterRow(String key, UUID modelId, CharacterStatus status, int progress, String error) {
	}

	public record GalleryRow(String slug, String planJson, String thumbnailUrl, Instant createdAt) {
	}

	private final JdbcClient jdbc;

	public StoryRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Creates the story unless this visitor already made {@code maxPerDay} stories in the last 24 hours. The
	 * check and the insert are one statement, so parallel requests cannot slip past the limit one by one.
	 *
	 * @param maxPerDay 0 or less disables the limit
	 * @return false when the limit was hit
	 */
	public boolean insertIfUnderLimit(UUID id, String slug, String text, String lang, String ipHash, int maxPerDay) {
		return jdbc.sql("""
				INSERT INTO stories (id, slug, text, lang, status, ip_hash)
				SELECT :id, :slug, :text, :lang, 'ANALYZING', :ipHash
				WHERE :max <= 0 OR (SELECT count(*) FROM stories
				                    WHERE ip_hash = :ipHash AND created_at > now() - interval '24 hours') < :max
				""")
			.param("id", id)
			.param("slug", slug)
			.param("text", text)
			.param("lang", lang)
			.param("ipHash", ipHash)
			.param("max", maxPerDay)
			.update() == 1;
	}

	public Optional<StoryRow> findBySlug(String slug) {
		return jdbc.sql("""
				SELECT id, slug, text, lang, plan::text AS plan, status, error, error_code, is_public, created_at
				FROM stories WHERE slug = :slug
				""")
			.param("slug", slug)
			.query(StoryRepository::story)
			.optional();
	}

	public List<CharacterRow> findCharacters(UUID storyId) {
		return jdbc.sql("SELECT char_key, model_id, status, progress, error FROM story_characters WHERE story_id = :id")
			.param("id", storyId)
			.query((rs, row) -> new CharacterRow(rs.getString("char_key"), rs.getObject("model_id", UUID.class),
					CharacterStatus.valueOf(rs.getString("status")), rs.getInt("progress"), rs.getString("error")))
			.list();
	}

	/** Stores the plan, creates one pending row per character and moves the story to GENERATING_MODELS. */
	public void startGeneration(UUID storyId, String planJson, List<String> characterKeys, boolean isPublic) {
		jdbc.sql("""
				UPDATE stories SET plan = CAST(:plan AS jsonb), status = 'GENERATING_MODELS', is_public = :public,
				                   updated_at = now()
				WHERE id = :id
				""")
			.param("plan", planJson)
			.param("public", isPublic)
			.param("id", storyId)
			.update();
		for (String key : characterKeys) {
			jdbc.sql("""
					INSERT INTO story_characters (id, story_id, char_key, status, progress)
					VALUES (:id, :storyId, :key, 'PENDING', 0)
					ON CONFLICT (story_id, char_key) DO NOTHING
					""")
				.param("id", UUID.randomUUID())
				.param("storyId", storyId)
				.param("key", key)
				.update();
		}
	}

	public void updateCharacter(UUID storyId, String key, CharacterStatus status, int progress, UUID modelId, String error) {
		jdbc.sql("""
				UPDATE story_characters
				SET status = :status, progress = :progress, model_id = CAST(:modelId AS uuid), error = :error, updated_at = now()
				WHERE story_id = :storyId AND char_key = :key
				""")
			.param("status", status.name())
			.param("progress", progress)
			.param("modelId", modelId == null ? null : modelId.toString())
			.param("error", error)
			.param("storyId", storyId)
			.param("key", key)
			.update();
	}

	public void markReady(UUID storyId) {
		jdbc.sql("UPDATE stories SET status = 'READY', error = NULL, error_code = NULL, updated_at = now() WHERE id = :id")
			.param("id", storyId)
			.update();
	}

	public void markFailed(UUID storyId, String errorCode, String message) {
		jdbc.sql("""
				UPDATE stories SET status = 'FAILED', error_code = :code, error = :message, is_public = false, updated_at = now()
				WHERE id = :id
				""")
			.param("code", errorCode)
			.param("message", message)
			.param("id", storyId)
			.update();
	}

	/** After a restart nothing is working on unfinished stories any more; mark them so clients stop waiting. */
	public List<String> failUnfinished(String errorCode) {
		return jdbc.sql("""
				UPDATE stories SET status = 'FAILED', error_code = :code, is_public = false, updated_at = now()
				WHERE status IN ('ANALYZING', 'GENERATING_MODELS')
				RETURNING slug
				""")
			.param("code", errorCode)
			.query(String.class)
			.list();
	}

	public List<GalleryRow> recentPublic(int limit) {
		return jdbc.sql("""
				SELECT s.slug, s.plan::text AS plan, s.created_at,
				       (SELECT m.thumbnail_url FROM story_characters c JOIN models m ON m.id = c.model_id
				        WHERE c.story_id = s.id AND m.thumbnail_url IS NOT NULL
				        ORDER BY c.char_key LIMIT 1) AS thumbnail_url
				FROM stories s
				WHERE s.is_public AND s.status = 'READY'
				ORDER BY s.created_at DESC
				LIMIT :limit
				""")
			.param("limit", limit)
			.query((rs, row) -> new GalleryRow(rs.getString("slug"), rs.getString("plan"), rs.getString("thumbnail_url"),
					instant(rs, "created_at")))
			.list();
	}

	private static StoryRow story(ResultSet rs, int row) throws SQLException {
		return new StoryRow(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("text"), rs.getString("lang"),
				rs.getString("plan"), StoryStatus.valueOf(rs.getString("status")), rs.getString("error"),
				rs.getString("error_code"), rs.getBoolean("is_public"), instant(rs, "created_at"));
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		return rs.getObject(column, OffsetDateTime.class).toInstant();
	}

}
