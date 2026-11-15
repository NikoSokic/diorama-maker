package hr.fesb.diorama.plan;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import hr.fesb.diorama.plan.StoryPlan.Action;
import hr.fesb.diorama.plan.StoryPlan.ActionType;
import hr.fesb.diorama.plan.StoryPlan.Camera;
import hr.fesb.diorama.plan.StoryPlan.CameraType;
import hr.fesb.diorama.plan.StoryPlan.Emotion;
import hr.fesb.diorama.plan.StoryPlan.Environment;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.plan.StoryPlan.Mood;
import hr.fesb.diorama.plan.StoryPlan.Point;
import hr.fesb.diorama.plan.StoryPlan.Prop;
import hr.fesb.diorama.plan.StoryPlan.PropType;
import hr.fesb.diorama.plan.StoryPlan.Scene;
import hr.fesb.diorama.plan.StoryPlan.StoryCharacter;
import hr.fesb.diorama.plan.StoryPlan.TimeOfDay;
import hr.fesb.diorama.plan.StoryPlan.Weather;
import org.springframework.stereotype.Component;

/**
 * Turns whatever the LLM answered into a complete, in-range {@link StoryPlan}. It never throws on bad input:
 * small problems are clamped or defaulted ({@code fixes}), structural ones are also reported as {@code errors}
 * so the caller can ask the LLM once more before accepting the repaired plan.
 */
@Component
public class PlanValidator {

	public static final int MAX_TEXT = 500;
	public static final int MAX_CHARACTERS = 3;
	public static final int MIN_SCENES = 3;
	public static final int MAX_SCENES = 6;
	public static final int MAX_NARRATION = 160;
	public static final int MAX_ACTIONS = 12;
	public static final int MAX_PROPS = 6;
	public static final double GRID = 5.0;
	public static final double MIN_DURATION = 5.0;
	public static final double MAX_DURATION = 12.0;

	public static final String PROMPT_PREFIX = "cute stylized low-poly toy ";
	public static final String PROMPT_SUFFIX = ", full body, standing neutral pose, arms slightly away from body, "
			+ "single object, no base, no background, soft pastel colors";
	static final String DEFAULT_SUBJECT = "friendly round creature";

	private static final Pattern HEX = Pattern.compile("^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$");
	private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?…])\\s+");
	private static final Map<Mood, List<String>> PALETTES = Map.of(
			Mood.COZY, List.of("#F6C28B", "#F7E8D0", "#8FB996"),
			Mood.ADVENTUROUS, List.of("#F4A259", "#5B8E7D", "#BC4B51"),
			Mood.FUNNY, List.of("#FFD166", "#EF476F", "#06D6A0"),
			Mood.MYSTERIOUS, List.of("#6D597A", "#355070", "#B56576"),
			Mood.MAGICAL, List.of("#C8B6FF", "#FFC8DD", "#A2D2FF"));
	/** Default stage spots per character index. */
	private static final double[][] SPOTS = { { -2, 0.5 }, { 2, 0.5 }, { 0, -1.5 } };

	public record Result(StoryPlan plan, List<String> errors, List<String> fixes) {

		public boolean needsRetry() {
			return !errors.isEmpty();
		}
	}

	/** Collects problems while a plan is being repaired. */
	private static final class Report {

		final List<String> errors = new ArrayList<>();
		final List<String> fixes = new ArrayList<>();

		void error(String message) {
			errors.add(message);
		}

		void fix(String message) {
			if (fixes.size() < 40) {
				fixes.add(message);
			}
		}
	}

	public Result validate(JsonNode raw, String storyText, String requestLang, String source) {
		Report report = new Report();
		String lang = "en".equalsIgnoreCase(requestLang) ? "en" : "hr";
		JsonNode root = raw != null && raw.isObject() ? raw : null;
		if (root == null) {
			report.error("the answer must be one JSON object");
		}

		String language = text(root, "language");
		language = language != null && (language.equalsIgnoreCase("hr") || language.equalsIgnoreCase("en"))
				? language.toLowerCase(Locale.ROOT)
				: lang;

		String title = clean(text(root, "title"), 60);
		if (title == null) {
			title = defaultTitle(storyText, language);
			report.fix("title: missing, derived from the story");
		}

		Mood mood = enumField(root, "mood", Mood.class, Mood.COZY, "mood", report);
		List<String> palette = palette(root, mood, report);

		Map<String, String> keyAliases = new HashMap<>();
		List<StoryCharacter> characters = characters(root, language, keyAliases, report);
		List<Scene> scenes = scenes(root, characters, keyAliases, storyText, language, report);
		scenes = ensureEveryoneAppears(scenes, characters, report);

		StoryPlan plan = new StoryPlan(title, language, mood, palette, List.copyOf(characters), List.copyOf(scenes), source);
		return new Result(plan, List.copyOf(report.errors), List.copyOf(report.fixes));
	}

	/** The fixed generation style from the spec, wrapped around a sanitized subject. */
	public static String canonicalPrompt(String subject) {
		return PROMPT_PREFIX + subject + PROMPT_SUFFIX;
	}

	// ---- characters ----

	private List<StoryCharacter> characters(JsonNode root, String lang, Map<String, String> aliases, Report report) {
		List<StoryCharacter> out = new ArrayList<>();
		JsonNode array = root == null ? null : root.get("characters");
		if (array != null && array.isArray()) {
			Set<String> used = new HashSet<>();
			int index = 0;
			for (JsonNode node : array) {
				index++;
				if (!node.isObject()) {
					continue;
				}
				if (out.size() == MAX_CHARACTERS) {
					report.fix("characters: more than " + MAX_CHARACTERS + ", extra ones dropped");
					break;
				}
				String where = "characters[" + (index - 1) + "]";
				String rawKey = text(node, "key");
				String rawName = clean(text(node, "displayName"), 30);
				String key = slug(rawKey != null ? rawKey : rawName);
				if (key.isEmpty()) {
					key = "char" + index;
				}
				while (!used.add(key)) {
					key = key + index;
				}
				if (rawKey != null) {
					aliases.putIfAbsent(rawKey.trim().toLowerCase(Locale.ROOT), key);
				}
				aliases.putIfAbsent(key, key);
				String displayName = rawName != null ? rawName : capitalize(key.replace('_', ' '));
				if (rawName != null) {
					aliases.putIfAbsent(rawName.toLowerCase(Locale.ROOT), key);
				}
				Kind kind = enumField(node, "kind", Kind.class, Kind.CREATURE, where + ".kind", report);
				double size = number(node, "relativeSize", 1.0, 0.3, 3.0, where + ".relativeSize", report);
				String subject = subject(text(node, "tripoPrompt"));
				if (subject.isEmpty()) {
					subject = subject(displayName);
					report.error(where + ".tripoPrompt: missing; write an English prompt in the required style");
					if (subject.isEmpty()) {
						subject = DEFAULT_SUBJECT;
					}
				}
				out.add(new StoryCharacter(key, displayName, kind, size, canonicalPrompt(subject)));
			}
		}
		if (out.isEmpty()) {
			report.error("characters: need 1 to " + MAX_CHARACTERS + " characters");
			String name = "en".equals(lang) ? "Friend" : "Prijatelj";
			out.add(new StoryCharacter("friend", name, Kind.CREATURE, 1.0, canonicalPrompt(DEFAULT_SUBJECT)));
			aliases.put("friend", "friend");
		}
		return out;
	}

	/** Extracts the "{subject}" part of a Tripo prompt and reduces it to safe ASCII. */
	static String subject(String rawPrompt) {
		if (rawPrompt == null) {
			return "";
		}
		String s = ascii(rawPrompt).trim();
		String lower = s.toLowerCase(Locale.ROOT);
		if (lower.startsWith(PROMPT_PREFIX)) {
			s = s.substring(PROMPT_PREFIX.length());
			lower = s.toLowerCase(Locale.ROOT);
		}
		int tail = lower.indexOf(", full body");
		if (tail >= 0) {
			s = s.substring(0, tail);
		}
		s = s.replaceAll("[^A-Za-z0-9 ,'-]", " ").replaceAll("\\s+", " ").trim();
		s = s.replaceAll("^[,' -]+|[,' -]+$", "");
		if (s.length() > 80) {
			s = s.substring(0, 80).replaceAll("[,' -]+$", "");
		}
		return s.toLowerCase(Locale.ROOT);
	}

	// ---- scenes ----

	private List<Scene> scenes(JsonNode root, List<StoryCharacter> characters, Map<String, String> aliases,
			String storyText, String lang, Report report) {
		List<Scene> out = new ArrayList<>();
		JsonNode array = root == null ? null : root.get("scenes");
		List<JsonNode> rawScenes = new ArrayList<>();
		if (array != null && array.isArray()) {
			array.forEach(node -> {
				if (node.isObject()) {
					rawScenes.add(node);
				}
			});
		}
		if (rawScenes.size() > MAX_SCENES) {
			report.fix("scenes: more than " + MAX_SCENES + ", extra ones dropped");
		}
		int count = Math.min(rawScenes.size(), MAX_SCENES);
		List<String> chunks = storyChunks(storyText, Math.max(count, MIN_SCENES));
		Environment previous = Environment.MEADOW;
		for (int i = 0; i < count; i++) {
			Scene scene = scene(rawScenes.get(i), i, previous, characters, aliases, chunks, report);
			previous = scene.environment();
			out.add(scene);
		}
		if (out.size() < MIN_SCENES) {
			report.error("scenes: need " + MIN_SCENES + " to " + MAX_SCENES + " scenes, got " + out.size());
			boolean empty = out.isEmpty();
			for (int i = out.size(); i < MIN_SCENES; i++) {
				String narration = empty ? chunks.get(i) : closingLine(lang, i == MIN_SCENES - 1);
				out.add(defaultScene(i, previous, narration, characters));
			}
		}
		return out;
	}

	private Scene scene(JsonNode node, int index, Environment previous, List<StoryCharacter> characters,
			Map<String, String> aliases, List<String> chunks, Report report) {
		String where = "scenes[" + index + "]";
		Environment environment = enumField(node, "environment", Environment.class, previous, where + ".environment", report);
		TimeOfDay timeOfDay = enumField(node, "timeOfDay", TimeOfDay.class, TimeOfDay.DAY, where + ".timeOfDay", report);
		Weather weather = enumField(node, "weather", Weather.class, Weather.CLEAR, where + ".weather", report);

		String narration = clean(text(node, "narration"), Integer.MAX_VALUE);
		if (narration == null) {
			report.error(where + ".narration: missing");
			narration = chunks.get(Math.min(index, chunks.size() - 1));
		}
		else if (narration.length() > MAX_NARRATION) {
			report.fix(where + ".narration: longer than " + MAX_NARRATION + " characters, shortened");
			narration = shorten(narration, MAX_NARRATION);
		}

		double fallbackDuration = clamp(Math.round(narration.length() / 13.0) + 2, MIN_DURATION, MAX_DURATION);
		double duration = number(node, "durationSec", fallbackDuration, MIN_DURATION, MAX_DURATION, where + ".durationSec", report);

		List<Action> actions = actions(node.get("actions"), where, duration, index, characters, aliases, report);
		if (actions.isEmpty()) {
			report.fix(where + ".actions: empty, added an idle action");
			actions.add(new Action(characters.get(0).key(), ActionType.IDLE, null, null, 0, Math.min(3, duration), Emotion.NEUTRAL));
		}
		Camera camera = camera(node.get("camera"), where, actions, aliases, report);
		List<Prop> props = props(node.get("props"), where, report);
		return new Scene(environment, timeOfDay, weather, narration, duration, camera, List.copyOf(actions), props);
	}

	private List<Action> actions(JsonNode array, String where, double sceneDuration, int sceneIndex,
			List<StoryCharacter> characters, Map<String, String> aliases, Report report) {
		List<Action> out = new ArrayList<>();
		if (array == null || !array.isArray()) {
			return out;
		}
		int index = -1;
		for (JsonNode node : array) {
			index++;
			if (!node.isObject()) {
				continue;
			}
			if (out.size() == MAX_ACTIONS) {
				report.fix(where + ".actions: more than " + MAX_ACTIONS + ", extra ones dropped");
				break;
			}
			String at = where + ".actions[" + index + "]";
			String key = resolveKey(text(node, "characterKey"), aliases);
			if (key == null) {
				report.fix(at + ".characterKey: unknown character, action dropped");
				continue;
			}
			ActionType type = StoryPlan.parseEnum(ActionType.class, text(node, "type")).orElse(null);
			if (type == null) {
				report.fix(at + ".type: unknown action type, action dropped");
				continue;
			}
			int characterIndex = indexOf(characters, key);
			Point to = point(node);
			String targetKey = resolveKey(text(node, "targetKey"), aliases);
			if (key.equals(targetKey)) {
				targetKey = null;
			}
			if (type.moves() && to == null) {
				to = defaultSpot(type, characterIndex, sceneIndex);
				report.fix(at + ".to: missing for a movement action, default position used");
			}
			if (type == ActionType.LOOK_AT && to == null && targetKey == null) {
				targetKey = characters.size() > 1 ? characters.get(characterIndex == 0 ? 1 : 0).key() : null;
				to = targetKey == null ? new Point(0, GRID) : null;
			}
			double startAt = number(node, "startAt", Math.min(out.size() * 0.5, sceneDuration - 1), 0, sceneDuration - 0.5, at + ".startAt", report);
			double duration = number(node, "duration", type.defaultDuration(), 0.3, Math.max(0.5, sceneDuration - startAt), at + ".duration", report);
			Emotion emotion = enumField(node, "emotion", Emotion.class, Emotion.NEUTRAL, null, report);
			out.add(new Action(key, type, to, targetKey, startAt, duration, emotion));
		}
		return out;
	}

	private Camera camera(JsonNode node, String where, List<Action> actions, Map<String, String> aliases, Report report) {
		CameraType type = CameraType.WIDE;
		String targetKey = null;
		if (node != null && node.isObject()) {
			type = enumField(node, "type", CameraType.class, CameraType.WIDE, where + ".camera.type", report);
			targetKey = resolveKey(text(node, "targetKey"), aliases);
		}
		else if (node != null && node.isTextual()) {
			type = StoryPlan.parseEnum(CameraType.class, node.asText()).orElse(CameraType.WIDE);
		}
		if (targetKey == null && type.needsTarget()) {
			targetKey = actions.get(0).characterKey();
		}
		return new Camera(type, targetKey);
	}

	private List<Prop> props(JsonNode array, String where, Report report) {
		List<Prop> out = new ArrayList<>();
		if (array == null || !array.isArray()) {
			return out;
		}
		for (JsonNode node : array) {
			if (out.size() == MAX_PROPS) {
				break;
			}
			PropType type = node.isObject() ? StoryPlan.parseEnum(PropType.class, text(node, "type")).orElse(null) : null;
			if (type == null || !node.path("x").isNumber() || !node.path("z").isNumber()) {
				report.fix(where + ".props: unknown or incomplete prop dropped");
				continue;
			}
			out.add(new Prop(type, clamp(node.get("x").asDouble(), -GRID, GRID), clamp(node.get("z").asDouble(), -GRID, GRID),
					number(node, "scale", 1.0, 0.5, 2.0, null, report)));
		}
		return List.copyOf(out);
	}

	private Scene defaultScene(int index, Environment environment, String narration, List<StoryCharacter> characters) {
		double duration = clamp(Math.round(narration.length() / 13.0) + 2, MIN_DURATION, MAX_DURATION);
		List<Action> actions = new ArrayList<>();
		for (int c = 0; c < characters.size(); c++) {
			ActionType type = index == 0 ? ActionType.ENTER : index == MIN_SCENES - 1 ? ActionType.CELEBRATE : ActionType.WALK_TO;
			Point to = type.moves() ? defaultSpot(type, c, index) : null;
			actions.add(new Action(characters.get(c).key(), type, to, null, c * 0.5, Math.min(type.defaultDuration(), duration - 1),
					index == 0 ? Emotion.NEUTRAL : Emotion.HAPPY));
		}
		return new Scene(environment, TimeOfDay.DAY, Weather.CLEAR, narration, duration,
				new Camera(index == 0 ? CameraType.WIDE : CameraType.ORBIT, index == 0 ? null : characters.get(0).key()),
				List.copyOf(actions), List.of());
	}

	/** A character the LLM forgot to use still walks on in the first scene, so every model is seen. */
	private List<Scene> ensureEveryoneAppears(List<Scene> scenes, List<StoryCharacter> characters, Report report) {
		Set<String> seen = new HashSet<>();
		scenes.forEach(scene -> scene.actions().forEach(action -> seen.add(action.characterKey())));
		List<Action> extra = new ArrayList<>();
		for (int c = 0; c < characters.size(); c++) {
			String key = characters.get(c).key();
			if (!seen.contains(key)) {
				report.fix("character '" + key + "' had no actions, added an entrance");
				extra.add(new Action(key, ActionType.ENTER, defaultSpot(ActionType.ENTER, c, 0), null, 0.5 * c, 2.5, Emotion.HAPPY));
			}
		}
		if (extra.isEmpty()) {
			return scenes;
		}
		Scene first = scenes.get(0);
		List<Action> merged = new ArrayList<>(first.actions());
		merged.addAll(extra);
		List<Scene> out = new ArrayList<>(scenes);
		out.set(0, new Scene(first.environment(), first.timeOfDay(), first.weather(), first.narration(), first.durationSec(),
				first.camera(), List.copyOf(merged), first.props()));
		return out;
	}

	// ---- small helpers ----

	private List<String> palette(JsonNode root, Mood mood, Report report) {
		List<String> out = new ArrayList<>();
		JsonNode array = root == null ? null : root.get("palette");
		if (array != null && array.isArray()) {
			for (JsonNode node : array) {
				String hex = normalizeHex(node.asText(""));
				if (hex != null && out.size() < 3) {
					out.add(hex);
				}
			}
		}
		if (out.size() < 3) {
			report.fix("palette: needs 3 hex colors, filled from the mood palette");
			List<String> defaults = PALETTES.get(mood);
			for (int i = out.size(); i < 3; i++) {
				out.add(defaults.get(i));
			}
		}
		return List.copyOf(out);
	}

	static String normalizeHex(String raw) {
		String value = raw == null ? "" : raw.trim();
		if (!HEX.matcher(value).matches()) {
			return null;
		}
		String digits = value.startsWith("#") ? value.substring(1) : value;
		if (digits.length() == 3) {
			digits = "" + digits.charAt(0) + digits.charAt(0) + digits.charAt(1) + digits.charAt(1) + digits.charAt(2) + digits.charAt(2);
		}
		return "#" + digits.toUpperCase(Locale.ROOT);
	}

	private static Point defaultSpot(ActionType type, int characterIndex, int sceneIndex) {
		double[] spot = SPOTS[characterIndex % SPOTS.length];
		if (type == ActionType.EXIT) {
			return new Point(spot[0] < 0 ? -GRID : GRID, spot[1]);
		}
		double shift = (sceneIndex % 2 == 0 ? 0 : 1) * (characterIndex % 2 == 0 ? 1 : -1);
		return new Point(spot[0] + shift, spot[1]);
	}

	/** Reads {@code to: {x, z}} (also accepts flat {@code toX}/{@code toZ}); null when absent. */
	private static Point point(JsonNode action) {
		JsonNode to = action.get("to");
		JsonNode x = to != null && to.isObject() ? to.get("x") : action.get("toX");
		JsonNode z = to != null && to.isObject() ? to.get("z") : action.get("toZ");
		if (x == null || z == null || !x.isNumber() || !z.isNumber()) {
			return null;
		}
		return new Point(clamp(x.asDouble(), -GRID, GRID), clamp(z.asDouble(), -GRID, GRID));
	}

	private static String resolveKey(String raw, Map<String, String> aliases) {
		if (raw == null) {
			return null;
		}
		String direct = aliases.get(raw.trim().toLowerCase(Locale.ROOT));
		return direct != null ? direct : aliases.get(slug(raw));
	}

	private static int indexOf(List<StoryCharacter> characters, String key) {
		for (int i = 0; i < characters.size(); i++) {
			if (characters.get(i).key().equals(key)) {
				return i;
			}
		}
		return 0;
	}

	private static <E extends Enum<E>> E enumField(JsonNode node, String field, Class<E> type, E fallback, String where, Report report) {
		String raw = text(node, field);
		E value = StoryPlan.parseEnum(type, raw).orElse(null);
		if (value == null) {
			if (where != null) {
				report.fix(where + ": " + (raw == null ? "missing" : "unknown value '" + shorten(raw, 30) + "'") + ", using "
						+ fallback.name().toLowerCase(Locale.ROOT));
			}
			return fallback;
		}
		return value;
	}

	private static double number(JsonNode node, String field, double fallback, double min, double max, String where, Report report) {
		JsonNode value = node == null ? null : node.get(field);
		double number;
		if (value != null && value.isNumber() && Double.isFinite(value.asDouble())) {
			number = value.asDouble();
		}
		else if (value != null && value.isTextual() && value.asText().matches("-?\\d+(\\.\\d+)?")) {
			number = Double.parseDouble(value.asText());
		}
		else {
			return clamp(fallback, min, max);
		}
		double clamped = clamp(number, min, max);
		if (clamped != number && where != null) {
			report.fix(where + ": " + number + " is outside " + min + ".." + max + ", clamped");
		}
		return Math.round(clamped * 100.0) / 100.0;
	}

	static double clamp(double value, double min, double max) {
		return Math.max(min, Math.min(Math.max(min, max), value));
	}

	private static String text(JsonNode node, String field) {
		JsonNode value = node == null ? null : node.get(field);
		if (value == null || value.isNull() || value.isContainerNode()) {
			return null;
		}
		String text = value.asText().trim();
		return text.isEmpty() ? null : text;
	}

	/** Strips control characters and markup-like symbols, collapses whitespace; null when nothing is left. */
	static String clean(String raw, int maxLength) {
		if (raw == null) {
			return null;
		}
		String text = raw.replaceAll("[\\p{Cntrl}<>]", " ").replaceAll("\\s+", " ").trim();
		if (text.isEmpty()) {
			return null;
		}
		return text.length() > maxLength ? shorten(text, maxLength) : text;
	}

	/** Cuts at a word boundary and marks the cut with an ellipsis; the result never exceeds {@code max}. */
	static String shorten(String text, int max) {
		if (text.length() <= max) {
			return text;
		}
		String cut = text.substring(0, max - 1);
		int space = cut.lastIndexOf(' ');
		if (space > max / 2) {
			cut = cut.substring(0, space);
		}
		return cut.replaceAll("[\\s,;:–-]+$", "") + "…";
	}

	static String slug(String raw) {
		if (raw == null) {
			return "";
		}
		String slug = ascii(raw).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
		return slug.length() > 24 ? slug.substring(0, 24).replaceAll("_+$", "") : slug;
	}

	/** Transliterates Croatian letters and drops other diacritics. */
	public static String ascii(String raw) {
		String text = raw.replace("đ", "d").replace("Đ", "D");
		return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
	}

	private static String capitalize(String text) {
		return text.isEmpty() ? text : text.substring(0, 1).toUpperCase(Locale.ROOT) + text.substring(1);
	}

	private static String defaultTitle(String storyText, String lang) {
		String text = clean(storyText, Integer.MAX_VALUE);
		if (text == null) {
			return "en".equals(lang) ? "A little story" : "Mala priča";
		}
		String[] words = text.split(" ");
		String title = String.join(" ", List.of(words).subList(0, Math.min(6, words.length))).replaceAll("[.,;:!?]+$", "");
		return title.length() > 40 ? shorten(title, 40) : title;
	}

	private static String closingLine(String lang, boolean last) {
		if ("en".equals(lang)) {
			return last ? "And they all lived happily ever after. The end!" : "What an adventure it was!";
		}
		return last ? "I svi su živjeli sretno do kraja. Kraj!" : "Kakva je to bila pustolovina!";
	}

	/** Splits the story into exactly {@code n} narration-sized parts (sentences first, words as a fallback). */
	public static List<String> storyChunks(String storyText, int n) {
		String text = clean(storyText, Integer.MAX_VALUE);
		if (text == null) {
			text = "…";
		}
		List<String> units = new ArrayList<>(List.of(SENTENCE_END.split(text)));
		if (units.size() < n) {
			units = new ArrayList<>(List.of(text.split(" ")));
		}
		List<String> chunks = new ArrayList<>();
		int total = units.size();
		for (int i = 0; i < n; i++) {
			int from = (int) Math.floor((double) i * total / n);
			int to = (int) Math.floor((double) (i + 1) * total / n);
			String chunk = from < to ? String.join(" ", units.subList(from, to)) : "…";
			chunks.add(shorten(chunk, MAX_NARRATION));
		}
		return chunks;
	}

}
