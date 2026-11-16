package hr.fesb.diorama.model;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.IntConsumer;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.CreditGuard.Grant;
import hr.fesb.diorama.model.ModelRecord.AnimationClip;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.tripo.TaskPoller;
import hr.fesb.diorama.tripo.TripoClient;
import hr.fesb.diorama.tripo.TripoException;
import hr.fesb.diorama.tripo.TripoException.Reason;
import hr.fesb.diorama.tripo.TripoTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns a Tripo prompt into a stored model: cache lookup, text-to-model, download and re-host, then (when the
 * credit grant allows it) rig check, rig and animation retarget. Rigging problems never lose the model: the
 * static GLB is kept and the player animates it procedurally.
 */
@Service
public class ModelService {

	private static final Logger log = LoggerFactory.getLogger(ModelService.class);

	public enum Stage { GENERATING, RIGGING }

	/** Receives overall progress (0-100) for one model. */
	public interface Progress {

		void report(Stage stage, int percent);
	}

	private record Rigging(boolean rigged, String rigType, String rigTaskId, String riggedGlbUrl, List<AnimationClip> animations) {

		static final Rigging NONE = new Rigging(false, null, null, null, List.of());
	}

	private final TripoClient tripo;
	private final ModelStorage storage;
	private final ModelRepository models;
	private final DioramaProperties.Tripo props;
	/** Models being generated right now, so the same prompt is never paid for twice at the same time. */
	private final Map<String, CompletableFuture<ModelRecord>> inFlight = new ConcurrentHashMap<>();

	public ModelService(TripoClient tripo, ModelStorage storage, ModelRepository models, DioramaProperties props) {
		this.tripo = tripo;
		this.storage = storage;
		this.models = models;
		this.props = props.tripo();
	}

	/**
	 * Cache key: the same prompt generated with the same settings by the same source is the same model.
	 * Mock samples and live models never share a key.
	 */
	public String cacheKey(String prompt) {
		String normalized = prompt.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
		String material = String.join("|", tripo.source(), props.modelVersion(), String.valueOf(props.faceLimit()),
				props.textureQuality(), normalized);
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** A cached model whose files are still served; costs no credits. */
	public Optional<ModelRecord> cached(String prompt) {
		return models.findByHash(cacheKey(prompt)).filter(this::usable);
	}

	/**
	 * Returns the model for this prompt, generating it if needed.
	 *
	 * @throws TripoException when no model could be produced (the caller shows a placeholder character)
	 */
	public ModelRecord obtain(String prompt, Kind kind, Grant grant, Progress progress) {
		String hash = cacheKey(prompt);
		Optional<ModelRecord> hit = models.findByHash(hash).filter(this::usable);
		if (hit.isPresent()) {
			return hit.get();
		}
		CompletableFuture<ModelRecord> mine = new CompletableFuture<>();
		CompletableFuture<ModelRecord> running = inFlight.putIfAbsent(hash, mine);
		if (running != null) {
			return join(running);
		}
		try {
			// another thread may have finished this very model between the lookup above and taking the slot;
			// looking again here is what keeps the same prompt from being paid for twice
			Optional<ModelRecord> late = models.findByHash(hash).filter(this::usable);
			ModelRecord model = late.isPresent() ? late.get() : generate(hash, prompt, kind, grant, progress);
			mine.complete(model);
			return model;
		}
		catch (RuntimeException e) {
			mine.completeExceptionally(e);
			throw e;
		}
		finally {
			inFlight.remove(hash, mine);
		}
	}

	private ModelRecord generate(String hash, String prompt, Kind kind, Grant grant, Progress progress) {
		if (!grant.generate()) {
			throw new TripoException(Reason.INSUFFICIENT_CREDITS, "not enough Tripo credits for this model");
		}
		try {
			return generateOnce(hash, prompt, kind, grant, progress);
		}
		catch (TripoException e) {
			if (!e.retryable()) {
				throw e;
			}
			log.warn("model generation failed ({}), retrying once", e.getMessage());
			return generateOnce(hash, prompt, kind, grant, progress);
		}
	}

	private ModelRecord generateOnce(String hash, String prompt, Kind kind, Grant grant, Progress progress) {
		boolean rigPlanned = grant.maxClips() > 0;
		progress.report(Stage.GENERATING, 1);
		String taskId = tripo.textToModel(prompt, kind);
		TripoTask task = TaskPoller.await(tripo, taskId, props, scaled(progress, Stage.GENERATING, 2, rigPlanned ? 58 : 93));

		String glbUrl = storage.put(hash + "/base.glb", downloadGlb(task.modelUrl()), ModelStorage.GLB);
		String thumbnailUrl = thumbnail(hash, task.renderedImageUrl());
		progress.report(Stage.GENERATING, rigPlanned ? 62 : 97);

		Rigging rigging = Rigging.NONE;
		if (rigPlanned) {
			try {
				rigging = rig(hash, taskId, grant.maxClips(), progress);
			}
			catch (RuntimeException e) {
				log.warn("rigging failed, keeping the static model: {}", e.getMessage());
			}
		}
		ModelRecord saved = models.save(new ModelRecord(UUID.randomUUID(), hash, prompt, tripo.source(), taskId, glbUrl,
				thumbnailUrl, rigging.rigged(), rigging.rigType(), rigging.rigTaskId(), rigging.riggedGlbUrl(), rigging.animations()));
		progress.report(rigPlanned ? Stage.RIGGING : Stage.GENERATING, 100);
		return saved;
	}

	/** Rig check, rig, retarget. Follows the rig type Tripo reports, not the planner's guess. */
	private Rigging rig(String hash, String modelTaskId, int maxClips, Progress progress) {
		progress.report(Stage.RIGGING, 63);
		TripoTask check = TaskPoller.await(tripo, tripo.rigCheck(modelTaskId), props, percent -> { });
		if (!Boolean.TRUE.equals(check.riggable())) {
			log.info("model is not riggable, it will be animated procedurally");
			return Rigging.NONE;
		}
		Optional<RigPlan> planned = RigPlan.forRigType(check.rigType(), props).map(plan -> plan.limit(maxClips));
		if (planned.isEmpty() || planned.get().clips().isEmpty()) {
			log.info("no preset animations for rig type '{}', skipping the rig", check.rigType());
			return Rigging.NONE;
		}
		RigPlan plan = planned.get();
		progress.report(Stage.RIGGING, 65);
		String rigTaskId = tripo.rig(modelTaskId, plan.rigType(), plan.rigModel());
		TripoTask rigged = TaskPoller.await(tripo, rigTaskId, props, scaled(progress, Stage.RIGGING, 65, 82));
		String riggedUrl = storage.put(hash + "/rigged.glb", downloadGlb(rigged.modelUrl()), ModelStorage.GLB);
		progress.report(Stage.RIGGING, 84);

		List<AnimationClip> animations = List.of();
		try {
			String retargetId = tripo.retarget(rigTaskId, plan.presets());
			TripoTask animated = TaskPoller.await(tripo, retargetId, props, scaled(progress, Stage.RIGGING, 84, 96));
			byte[] glb = downloadGlb(animated.modelUrl());
			String url = storage.put(hash + "/anim.glb", glb, ModelStorage.GLB);
			animations = plan.resolve(GlbInspector.animationNames(glb), url);
			if (animations.size() < plan.clips().size()) {
				log.warn("only {} of {} requested clips were found in the retargeted model", animations.size(), plan.clips().size());
			}
		}
		catch (RuntimeException e) {
			log.warn("animation retarget failed, the rigged model has no clips: {}", e.getMessage());
		}
		return new Rigging(true, plan.rigType(), rigTaskId, riggedUrl, animations);
	}

	private byte[] downloadGlb(String url) {
		if (url == null) {
			throw new TripoException(Reason.BAD_OUTPUT, "Tripo task succeeded without a model URL");
		}
		byte[] bytes = tripo.download(url);
		if (!GlbInspector.isGlb(bytes)) {
			throw new TripoException(Reason.BAD_OUTPUT, "Tripo output is not a GLB file");
		}
		return bytes;
	}

	/** The preview render is a nice-to-have; a story never fails because of it. */
	private String thumbnail(String hash, String url) {
		if (url == null) {
			return null;
		}
		try {
			byte[] bytes = tripo.download(url);
			boolean png = bytes.length > 4 && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P';
			boolean jpeg = bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8;
			boolean webp = bytes.length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[8] == 'W' && bytes[9] == 'E';
			if (!png && !jpeg && !webp) {
				return null;
			}
			return storage.put(hash + (png ? "/thumb.png" : jpeg ? "/thumb.jpg" : "/thumb.webp"), bytes,
					png ? "image/png" : jpeg ? "image/jpeg" : "image/webp");
		}
		catch (RuntimeException e) {
			log.warn("could not store the model thumbnail: {}", e.getMessage());
			return null;
		}
	}

	private boolean usable(ModelRecord model) {
		if (!storage.serves(model.glbUrl())) {
			return false;
		}
		return model.animations().stream().allMatch(clip -> storage.serves(clip.url()));
	}

	/** Maps a task's own 0-100 progress into a slice of the model's overall progress. */
	private static IntConsumer scaled(Progress progress, Stage stage, int from, int to) {
		return percent -> progress.report(stage, from + (to - from) * percent / 100);
	}

	private static ModelRecord join(CompletableFuture<ModelRecord> running) {
		try {
			return running.join();
		}
		catch (CompletionException e) {
			if (e.getCause() instanceof RuntimeException cause) {
				throw cause;
			}
			throw e;
		}
	}

}
