package hr.fesb.diorama.model;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.model.ModelRecord.AnimationClip;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ModelRepository {

	private static final String COLUMNS = "id, prompt_hash, prompt, source, tripo_task_id, glb_url, thumbnail_url, rigged, "
			+ "rig_type, rig_task_id, rigged_glb_url, animations::text AS animations";
	private static final TypeReference<List<AnimationClip>> CLIPS = new TypeReference<>() {
	};

	private final JdbcClient jdbc;
	private final ObjectMapper json;

	public ModelRepository(JdbcClient jdbc, ObjectMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	public Optional<ModelRecord> findByHash(String promptHash) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM models WHERE prompt_hash = :hash")
			.param("hash", promptHash)
			.query(this::map)
			.optional();
	}

	public Map<UUID, ModelRecord> findByIds(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql("SELECT " + COLUMNS + " FROM models WHERE id IN (:ids)")
			.param("ids", ids)
			.query(this::map)
			.list()
			.stream()
			.collect(Collectors.toMap(ModelRecord::id, Function.identity()));
	}

	/**
	 * Inserts the model, or refreshes the row that already has this prompt hash. The existing id is kept so
	 * stories that reference it stay valid.
	 *
	 * @return the stored record (with the id that is actually in the table)
	 */
	public ModelRecord save(ModelRecord model) {
		UUID id = jdbc.sql("""
				INSERT INTO models (id, prompt_hash, prompt, source, tripo_task_id, glb_url, thumbnail_url, rigged,
				                    rig_type, rig_task_id, rigged_glb_url, animations)
				VALUES (:id, :hash, :prompt, :source, :taskId, :glbUrl, :thumbnailUrl, :rigged,
				        :rigType, :rigTaskId, :riggedGlbUrl, CAST(:animations AS jsonb))
				ON CONFLICT (prompt_hash) DO UPDATE SET
				    prompt = EXCLUDED.prompt, source = EXCLUDED.source, tripo_task_id = EXCLUDED.tripo_task_id,
				    glb_url = EXCLUDED.glb_url, thumbnail_url = EXCLUDED.thumbnail_url, rigged = EXCLUDED.rigged,
				    rig_type = EXCLUDED.rig_type, rig_task_id = EXCLUDED.rig_task_id,
				    rigged_glb_url = EXCLUDED.rigged_glb_url, animations = EXCLUDED.animations
				RETURNING id
				""")
			.param("id", model.id())
			.param("hash", model.promptHash())
			.param("prompt", model.prompt())
			.param("source", model.source())
			.param("taskId", model.tripoTaskId())
			.param("glbUrl", model.glbUrl())
			.param("thumbnailUrl", model.thumbnailUrl())
			.param("rigged", model.rigged())
			.param("rigType", model.rigType())
			.param("rigTaskId", model.rigTaskId())
			.param("riggedGlbUrl", model.riggedGlbUrl())
			.param("animations", write(model.animations()))
			.query(UUID.class)
			.single();
		return new ModelRecord(id, model.promptHash(), model.prompt(), model.source(), model.tripoTaskId(), model.glbUrl(),
				model.thumbnailUrl(), model.rigged(), model.rigType(), model.rigTaskId(), model.riggedGlbUrl(), model.animations());
	}

	private ModelRecord map(ResultSet rs, int row) throws SQLException {
		return new ModelRecord(
				rs.getObject("id", UUID.class),
				rs.getString("prompt_hash"),
				rs.getString("prompt"),
				rs.getString("source"),
				rs.getString("tripo_task_id"),
				rs.getString("glb_url"),
				rs.getString("thumbnail_url"),
				rs.getBoolean("rigged"),
				rs.getString("rig_type"),
				rs.getString("rig_task_id"),
				rs.getString("rigged_glb_url"),
				read(rs.getString("animations")));
	}

	private String write(List<AnimationClip> clips) {
		try {
			return json.writeValueAsString(clips == null ? List.of() : clips);
		}
		catch (JsonProcessingException e) {
			throw new IllegalStateException("could not serialize animations", e);
		}
	}

	private List<AnimationClip> read(String raw) {
		if (raw == null || raw.isBlank()) {
			return List.of();
		}
		try {
			return json.readValue(raw, CLIPS);
		}
		catch (JsonProcessingException e) {
			return List.of();
		}
	}

}
