package hr.fesb.diorama.plan;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The validated story script the player performs. Built only by {@link PlanValidator}, so every instance
 * is complete and inside its limits. Stored as jsonb and returned to the frontend as-is.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record StoryPlan(
		String title,
		String language,
		Mood mood,
		List<String> palette,
		List<StoryCharacter> characters,
		List<Scene> scenes,
		/** How the plan was made: {@code gemini} or {@code offline}. */
		String source) {

	public record StoryCharacter(String key, String displayName, Kind kind, double relativeSize, String tripoPrompt) {
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record Scene(
			Environment environment,
			TimeOfDay timeOfDay,
			Weather weather,
			String narration,
			double durationSec,
			Camera camera,
			List<Action> actions,
			List<Prop> props) {
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record Camera(CameraType type, String targetKey) {
	}

	/** Stage position on the grid, x and z in [-5, 5]. */
	public record Point(double x, double z) {
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record Action(
			String characterKey,
			ActionType type,
			Point to,
			String targetKey,
			double startAt,
			double duration,
			Emotion emotion) {
	}

	public record Prop(PropType type, double x, double z, double scale) {
	}

	/** Lower-case JSON names for all plan enums, in both directions. */
	public interface JsonEnum {
		default String json() {
			return ((Enum<?>) this).name().toLowerCase(Locale.ROOT);
		}
	}

	/** Lenient lookup: case-insensitive, spaces and dashes count as underscores. */
	public static <E extends Enum<E>> Optional<E> parseEnum(Class<E> type, String raw) {
		if (raw == null) {
			return Optional.empty();
		}
		String wanted = raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
		for (E value : type.getEnumConstants()) {
			if (value.name().equals(wanted)) {
				return Optional.of(value);
			}
		}
		return Optional.empty();
	}

	public enum Mood implements JsonEnum {
		COZY, ADVENTUROUS, FUNNY, MYSTERIOUS, MAGICAL;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static Mood of(String raw) {
			return parseEnum(Mood.class, raw).orElse(COZY);
		}
	}

	public enum Kind implements JsonEnum {
		BIPED, QUADRUPED, CREATURE, OBJECT;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static Kind of(String raw) {
			return parseEnum(Kind.class, raw).orElse(CREATURE);
		}
	}

	public enum Environment implements JsonEnum {
		MEADOW, FOREST, BEACH, SEA, CASTLE, VILLAGE, SNOWY_MOUNTAIN, SPACE, UNDERWATER, CAVE, DESERT, CITY_PARK;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static Environment of(String raw) {
			return parseEnum(Environment.class, raw).orElse(MEADOW);
		}
	}

	public enum TimeOfDay implements JsonEnum {
		MORNING, DAY, SUNSET, NIGHT;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static TimeOfDay of(String raw) {
			return parseEnum(TimeOfDay.class, raw).orElse(DAY);
		}
	}

	public enum Weather implements JsonEnum {
		CLEAR, RAIN, SNOW, FOG, STARS, FIREFLIES;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static Weather of(String raw) {
			return parseEnum(Weather.class, raw).orElse(CLEAR);
		}
	}

	public enum CameraType implements JsonEnum {
		WIDE, CLOSEUP, ORBIT, FOLLOW, DOLLY_IN, OVER_SHOULDER;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static CameraType of(String raw) {
			return parseEnum(CameraType.class, raw).orElse(WIDE);
		}

		public boolean needsTarget() {
			return this != WIDE;
		}
	}

	public enum ActionType implements JsonEnum {
		ENTER(2.5, true), EXIT(2.5, true), WALK_TO(2.5, true), RUN_TO(1.6, true), JUMP(1.0, false), SPIN(1.0, false),
		WAVE(1.5, false), DANCE(3.0, false), IDLE(2.0, false), LOOK_AT(0.8, false), GROW(1.2, false),
		SHRINK(1.2, false), HIDE(0.6, false), APPEAR(0.6, false), CELEBRATE(2.5, false);

		private final double defaultDuration;
		private final boolean moves;

		ActionType(double defaultDuration, boolean moves) {
			this.defaultDuration = defaultDuration;
			this.moves = moves;
		}

		public double defaultDuration() {
			return defaultDuration;
		}

		/** Movement actions always carry a {@code to} point. */
		public boolean moves() {
			return moves;
		}

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static ActionType of(String raw) {
			return parseEnum(ActionType.class, raw).orElse(IDLE);
		}
	}

	public enum Emotion implements JsonEnum {
		NEUTRAL, HAPPY, SAD, SCARED, SURPRISED, ANGRY, EXCITED, SLEEPY;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static Emotion of(String raw) {
			return parseEnum(Emotion.class, raw).orElse(NEUTRAL);
		}
	}

	/** The prop library the player can place in a scene (built in Phase 3). */
	public enum PropType implements JsonEnum {
		TREE, PINE, BUSH, ROCK, FLOWER, MUSHROOM, HOUSE, TENT, CAMPFIRE, BENCH, FENCE, LANTERN, BALL, BALLOON,
		GIFT, CAKE, TREASURE_CHEST, BOAT, BRIDGE, SIGNPOST, STAR, CRYSTAL, SNOWMAN, CACTUS, SHELL, ROCKET;

		@JsonValue
		@Override
		public String json() {
			return JsonEnum.super.json();
		}

		@JsonCreator
		static PropType of(String raw) {
			return parseEnum(PropType.class, raw).orElse(ROCK);
		}
	}

}
