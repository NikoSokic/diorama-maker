package hr.fesb.diorama.narration;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The {@code narration_clips} cache: a scene text spoken once is never paid for (in quota) again. */
@Repository
public class NarrationClipRepository {

	private final JdbcClient jdbc;

	public NarrationClipRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<NarrationClip> find(String hash) {
		return jdbc.sql("SELECT url, duration_sec FROM narration_clips WHERE hash = :hash")
			.param("hash", hash)
			.query((rs, row) -> new NarrationClip(rs.getString("url"), rs.getDouble("duration_sec")))
			.optional();
	}

	public void save(String hash, NarrationClip clip) {
		jdbc.sql("""
				INSERT INTO narration_clips (hash, url, duration_sec) VALUES (:hash, :url, :duration)
				ON CONFLICT (hash) DO UPDATE SET url = EXCLUDED.url, duration_sec = EXCLUDED.duration_sec
				""")
			.param("hash", hash)
			.param("url", clip.url())
			.param("duration", clip.durationSec())
			.update();
	}

}
