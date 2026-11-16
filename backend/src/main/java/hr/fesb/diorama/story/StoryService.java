package hr.fesb.diorama.story;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.function.Function;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.CreditGuard;
import hr.fesb.diorama.model.ModelRecord;
import hr.fesb.diorama.model.ModelRepository;
import hr.fesb.diorama.plan.PlanValidator;
import hr.fesb.diorama.plan.StoryPlan;
import hr.fesb.diorama.story.ApiError.ApiException;
import hr.fesb.diorama.story.StoryRepository.CharacterRow;
import hr.fesb.diorama.story.StoryRepository.CharacterStatus;
import hr.fesb.diorama.story.StoryRepository.StoryRow;
import hr.fesb.diorama.story.StoryRepository.StoryStatus;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

/** Creating stories (validation, limits, hand-off to the pipeline) and reading them back for the frontend. */
@Service
public class StoryService {

	/** No vowels and no look-alike characters: slugs are easy to read aloud and never spell a word. */
	private static final String SLUG_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";
	private static final int SLUG_LENGTH = 9;
	public static final int MAX_GALLERY = 48;

	/** {@code uploadToken}: lets this browser (and only it) send the story's gallery thumbnail once. */
	public record Created(String slug, StoryStatus status, String uploadToken) {
	}

	public record StoryView(String slug, StoryStatus status, int progress, String lang, String text, String title,
			String errorCode, String error, Instant createdAt, JsonNode plan, List<CharacterView> characters,
			/** The gallery picture, once the creator's player has sent one. */
			String thumbnailUrl,
			/** One {@code {url, durationSec}} per scene, or null: then the browser's voice reads the story. */
			JsonNode narration) {
	}

	public record CharacterView(String key, String displayName, String kind, CharacterStatus status, int progress,
			String error, ModelView model) {
	}

	/** {@code animations} is empty for static models; the player then animates procedurally. */
	public record ModelView(String glbUrl, String riggedGlbUrl, String thumbnailUrl, boolean rigged, String rigType,
			List<ClipView> animations) {
	}

	public record ClipView(String name, String clip, String url) {
	}

	public record GalleryItem(String slug, String title, String mood, List<String> palette, String environment,
			List<String> characters, String thumbnailUrl, Instant createdAt) {
	}

	private final StoryRepository stories;
	private final ModelRepository models;
	private final StoryPipeline pipeline;
	private final CreditGuard credits;
	private final ClientIp clientIp;
	private final DioramaProperties props;
	private final ObjectMapper json;
	private final ThreadPoolTaskExecutor storyExecutor;
	private final SecureRandom random = new SecureRandom();

	public StoryService(StoryRepository stories, ModelRepository models, StoryPipeline pipeline, CreditGuard credits,
			ClientIp clientIp, DioramaProperties props, ObjectMapper json,
			@Qualifier("storyExecutor") ThreadPoolTaskExecutor storyExecutor) {
		this.stories = stories;
		this.models = models;
		this.pipeline = pipeline;
		this.credits = credits;
		this.clientIp = clientIp;
		this.props = props;
		this.json = json;
		this.storyExecutor = storyExecutor;
	}

	/**
	 * Validates and stores the story, then starts the pipeline in the background.
	 *
	 * @param address the caller's IP (only its salted hash is stored)
	 */
	public Created create(String rawText, String lang, String address) {
		String text = normalize(rawText);
		if (text.isEmpty() || text.codePointCount(0, text.length()) > PlanValidator.MAX_TEXT) {
			throw new ApiException(ApiError.INVALID_TEXT, lang);
		}
		if (!credits.canStartStory()) {
			throw new ApiException(ApiError.CREDITS_EXHAUSTED, lang);
		}
		boolean exempt = !props.rateLimitLoopback() && ClientIp.isLoopback(address);
		int limit = exempt ? 0 : props.maxStoriesPerIpPerDay();
		UUID id = UUID.randomUUID();
		String slug = insert(id, text, lang, clientIp.hash(address), limit);
		String uploadToken = newToken();
		stories.setUploadTokenHash(id, tokenHash(uploadToken));
		try {
			storyExecutor.execute(() -> pipeline.run(id, slug, text, lang));
		}
		catch (TaskRejectedException e) {
			stories.markFailed(id, ApiError.BUSY.name(), ApiError.BUSY.message(lang));
			throw new ApiException(ApiError.BUSY, lang);
		}
		return new Created(slug, StoryStatus.ANALYZING, uploadToken);
	}

	/** What to change in a finished story. {@code mode}: {@code tweak} (edit the plan) or {@code retry} (plan again). */
	public record VariantRequest(String mode, String environment, String timeOfDay, String weather) {
	}

	/**
	 * A new story made from a finished one. A tweak copies the plan with another place, time of day or weather:
	 * no language model, the same characters (cached models) and narration (cached clips), so it is counted apart
	 * from new stories. A retry plans the same text again and counts like a new story. Variants never appear in the
	 * public gallery (they would be near-copies), but play by link like any story.
	 */
	public Created variant(String parentSlug, VariantRequest request, String address, String requestLang) {
		StoryRow parent = stories.findBySlug(parentSlug == null ? "" : parentSlug)
			.orElseThrow(() -> new ApiException(ApiError.NOT_FOUND, requestLang));
		String lang = parent.lang();
		if (request == null || parent.status() != StoryStatus.READY || parent.planJson() == null) {
			throw new ApiException(ApiError.INVALID_REQUEST, lang);
		}
		boolean exempt = !props.rateLimitLoopback() && ClientIp.isLoopback(address);
		UUID id = UUID.randomUUID();
		String slug;
		Runnable job;
		if ("retry".equals(request.mode())) {
			if (!credits.canStartStory()) {
				throw new ApiException(ApiError.CREDITS_EXHAUSTED, lang);
			}
			slug = insert(id, parent.text(), lang, clientIp.hash(address), exempt ? 0 : props.maxStoriesPerIpPerDay(), parent.id(), "retry");
			String finalSlug = slug;
			job = () -> pipeline.run(id, finalSlug, parent.text(), lang, false);
		}
		else if ("tweak".equals(request.mode())) {
			StoryPlan plan = tweak(parent.planJson(), request, lang);
			slug = insert(id, parent.text(), lang, clientIp.hash(address), exempt ? 0 : props.maxTweaksPerIpPerDay(), parent.id(), "tweak");
			String finalSlug = slug;
			job = () -> pipeline.runWithPlan(id, finalSlug, lang, plan);
		}
		else {
			throw new ApiException(ApiError.INVALID_REQUEST, lang);
		}
		String uploadToken = newToken();
		stories.setUploadTokenHash(id, tokenHash(uploadToken));
		try {
			storyExecutor.execute(job);
		}
		catch (TaskRejectedException e) {
			stories.markFailed(id, ApiError.BUSY.name(), ApiError.BUSY.message(lang));
			throw new ApiException(ApiError.BUSY, lang);
		}
		return new Created(slug, StoryStatus.ANALYZING, uploadToken);
	}

	/** The parent's plan with the requested place / time / weather in every scene; refuses a request that changes nothing. */
	StoryPlan tweak(String planJson, VariantRequest request, String lang) {
		String environment = choice(request.environment(), StoryPlan.Environment.values(), lang);
		String timeOfDay = choice(request.timeOfDay(), StoryPlan.TimeOfDay.values(), lang);
		String weather = choice(request.weather(), StoryPlan.Weather.values(), lang);
		try {
			ObjectNode plan = (ObjectNode) json.readTree(planJson);
			boolean changed = false;
			for (JsonNode node : plan.path("scenes")) {
				ObjectNode scene = (ObjectNode) node;
				changed |= set(scene, "environment", environment) | set(scene, "timeOfDay", timeOfDay) | set(scene, "weather", weather);
				// stars and fireflies only shine at sunset or night (the planner's own rule)
				String w = scene.path("weather").asText();
				String t = scene.path("timeOfDay").asText();
				if ((w.equals("stars") || w.equals("fireflies")) && !(t.equals("night") || t.equals("sunset"))) {
					scene.put("weather", "clear");
				}
			}
			if (!changed) {
				throw new ApiException(ApiError.INVALID_REQUEST, lang);
			}
			return json.treeToValue(plan, StoryPlan.class);
		}
		catch (JsonProcessingException | ClassCastException e) {
			throw new ApiException(ApiError.INTERNAL, lang);
		}
	}

	private static boolean set(ObjectNode scene, String field, String value) {
		if (value == null || value.equals(scene.path(field).asText())) {
			return false;
		}
		scene.put(field, value);
		return true;
	}

	/** Null when not asked for; the lower-case enum name when valid; otherwise a bad request. */
	private static String choice(String raw, Enum<?>[] values, String lang) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		for (Enum<?> value : values) {
			if (value.name().toLowerCase(Locale.ROOT).equals(raw.trim())) {
				return raw.trim();
			}
		}
		throw new ApiException(ApiError.INVALID_REQUEST, lang);
	}
	private static final SecureRandom RANDOM = new SecureRandom();

	static String newToken() {
		byte[] bytes = new byte[18];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String tokenHash(String token) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private String insert(UUID id, String text, String lang, String ipHash, int limit) {
		return insert(id, text, lang, ipHash, limit, null, null);
	}

	private String insert(UUID id, String text, String lang, String ipHash, int limit, UUID parentId, String variant) {
		for (int attempt = 0; attempt < 5; attempt++) {
			String slug = randomSlug();
			try {
				if (!stories.insertIfUnderLimit(id, slug, text, lang, ipHash, limit, parentId, variant)) {
					throw new ApiException(ApiError.RATE_LIMITED, lang);
				}
				return slug;
			}
			catch (DuplicateKeyException e) {
				// slug collision (about 1 in 10^13): try another one
			}
		}
		throw new ApiException(ApiError.INTERNAL, lang);
	}

	public StoryView get(String slug, String requestLang) {
		if (slug == null || !slug.matches("[a-z0-9]{4,32}")) {
			throw new ApiException(ApiError.NOT_FOUND, requestLang);
		}
		StoryRow story = stories.findBySlug(slug).orElseThrow(() -> new ApiException(ApiError.NOT_FOUND, requestLang));
		JsonNode plan = parse(story.planJson());
		List<CharacterView> characters = characters(story, plan);
		String error = story.status() != StoryStatus.FAILED ? null
				: story.error() != null ? story.error() : errorMessage(story.errorCode(), story.lang());
		return new StoryView(story.slug(), story.status(), progress(story.status(), characters), story.lang(), story.text(),
				plan == null ? null : plan.path("title").asText(null), story.errorCode(), error, story.createdAt(), plan, characters,
				story.thumbnailUrl(),
				story.status() == StoryStatus.READY ? parse(story.narrationJson()) : null);
	}

	public List<GalleryItem> gallery(int limit) {
		List<GalleryItem> items = new ArrayList<>();
		for (StoryRepository.GalleryRow row : stories.recentPublic(Math.max(1, Math.min(MAX_GALLERY, limit)))) {
			JsonNode plan = parse(row.planJson());
			if (plan == null) {
				continue;
			}
			List<String> palette = new ArrayList<>();
			plan.path("palette").forEach(color -> palette.add(color.asText()));
			List<String> names = new ArrayList<>();
			plan.path("characters").forEach(character -> names.add(character.path("displayName").asText()));
			items.add(new GalleryItem(row.slug(), plan.path("title").asText(""), plan.path("mood").asText("cozy"), palette,
					plan.path("scenes").path(0).path("environment").asText("meadow"), names, row.thumbnailUrl(), row.createdAt()));
		}
		return items;
	}

	/** Characters in plan order, each with its generation state and (when ready) its model. */
	private List<CharacterView> characters(StoryRow story, JsonNode plan) {
		if (plan == null) {
			return List.of();
		}
		Map<String, CharacterRow> rows = stories.findCharacters(story.id()).stream()
			.collect(Collectors.toMap(CharacterRow::key, Function.identity(), (a, b) -> a));
		Map<UUID, ModelRecord> byId = models.findByIds(rows.values().stream().map(CharacterRow::modelId)
			.filter(Objects::nonNull).collect(Collectors.toSet()));
		List<CharacterView> out = new ArrayList<>();
		for (JsonNode character : plan.path("characters")) {
			String key = character.path("key").asText();
			CharacterRow row = rows.get(key);
			ModelRecord model = row == null || row.modelId() == null ? null : byId.get(row.modelId());
			out.add(new CharacterView(key, character.path("displayName").asText(key), character.path("kind").asText("creature"),
					row == null ? CharacterStatus.PENDING : row.status(), row == null ? 0 : row.progress(),
					row == null ? null : row.error(), model == null ? null : view(model)));
		}
		return out;
	}

	private static ModelView view(ModelRecord model) {
		return new ModelView(model.glbUrl(), model.riggedGlbUrl(), model.thumbnailUrl(), model.rigged(), model.rigType(),
				model.animations().stream().map(clip -> new ClipView(clip.name(), clip.clip(), clip.url())).toList());
	}

	/** One number for the progress screen: planning is the first 15 %, models are the rest. */
	private static int progress(StoryStatus status, List<CharacterView> characters) {
		return switch (status) {
			case ANALYZING -> 5;
			case GENERATING_MODELS -> {
				double average = characters.stream().mapToInt(CharacterView::progress).average().orElse(0);
				yield Math.min(99, 15 + (int) Math.round(average * 0.85));
			}
			case READY -> 100;
			case FAILED -> 0;
		};
	}

	private static String errorMessage(String code, String lang) {
		try {
			return ApiError.valueOf(code).message(lang);
		}
		catch (IllegalArgumentException | NullPointerException e) {
			return ApiError.INTERNAL.message(lang);
		}
	}

	/** Trims, turns line breaks and tabs into spaces and drops other control characters. */
	static String normalize(String raw) {
		if (raw == null) {
			return "";
		}
		return raw.replaceAll("[\\r\\n\\t]+", " ").replaceAll("\\p{Cntrl}", "").replaceAll(" {2,}", " ").strip();
	}

	private String randomSlug() {
		StringBuilder slug = new StringBuilder(SLUG_LENGTH);
		for (int i = 0; i < SLUG_LENGTH; i++) {
			slug.append(SLUG_ALPHABET.charAt(random.nextInt(SLUG_ALPHABET.length())));
		}
		return slug.toString();
	}

	private JsonNode parse(String planJson) {
		if (planJson == null) {
			return null;
		}
		try {
			return json.readTree(planJson);
		}
		catch (JsonProcessingException e) {
			return null;
		}
	}

}
