package hr.fesb.diorama.model;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.ModelRecord.AnimationClip;
import hr.fesb.diorama.plan.StoryPlan.Kind;

/**
 * Which rig model and which preset animations to buy for a rig type (API_NOTES §1.6, "Rigging plan").
 * Clips are listed most valuable first, so a tight budget keeps walk and idle before jump and celebrate.
 */
public record RigPlan(String rigType, String rigModel, List<Clip> clips) {

	public record Clip(String name, String preset) {
	}

	private static final List<Clip> BIPED_V1 = List.of(
			new Clip("walk", "preset:biped:walk"),
			new Clip("idle", "preset:biped:idle"),
			new Clip("run", "preset:biped:run"),
			new Clip("jump", "preset:biped:jump"),
			new Clip("celebrate", "preset:biped:victory_celebration"));
	private static final List<Clip> BIPED_V3 = List.of(
			new Clip("walk", "preset:walk"),
			new Clip("idle", "preset:idle"),
			new Clip("run", "preset:run"),
			new Clip("jump", "preset:jump"));
	/** Non-biped rigs have exactly one preset each; avian has none. */
	private static final Map<String, Clip> SINGLE = Map.of(
			"quadruped", new Clip("walk", "preset:quadruped:walk"),
			"hexapod", new Clip("walk", "preset:hexapod:walk"),
			"octopod", new Clip("walk", "preset:octopod:walk"),
			"serpentine", new Clip("walk", "preset:serpentine:march"),
			"aquatic", new Clip("walk", "preset:aquatic:march"));
	/** Words that identify a clip inside a GLB when it is not named exactly like ours. */
	private static final Map<String, List<String>> SYNONYMS = Map.of(
			"walk", List.of("walk", "march"),
			"idle", List.of("idle", "stand", "wait"),
			"run", List.of("run"),
			"jump", List.of("jump"),
			"celebrate", List.of("victory", "celebrat", "cheer", "dance"));

	/** The plan for what the rig check reported; empty when that rig type has no presets worth buying. */
	public static Optional<RigPlan> forRigType(String rigType, DioramaProperties.Tripo props) {
		String type = rigType == null ? "" : rigType.trim().toLowerCase(Locale.ROOT);
		if (type.equals("biped")) {
			boolean v1 = props.bipedRigModel().startsWith("v1.");
			return Optional.of(new RigPlan(type, props.bipedRigModel(), v1 ? BIPED_V1 : BIPED_V3));
		}
		Clip single = SINGLE.get(type);
		return single == null ? Optional.empty() : Optional.of(new RigPlan(type, props.creatureRigModel(), List.of(single)));
	}

	/** The most clips a character of this kind can get; used to estimate cost before the rig check. */
	public static int maxClips(Kind kind, DioramaProperties.Tripo props) {
		return switch (kind) {
			case BIPED -> props.bipedRigModel().startsWith("v1.") ? BIPED_V1.size() : BIPED_V3.size();
			case QUADRUPED -> 1;
			default -> 0;
		};
	}

	public RigPlan limit(int maxClips) {
		return new RigPlan(rigType, rigModel, clips.subList(0, Math.max(0, Math.min(maxClips, clips.size()))));
	}

	public List<String> presets() {
		return clips.stream().map(Clip::preset).toList();
	}

	/**
	 * Matches the requested clips to the clip names found in the retargeted GLB: by name, then by position when
	 * the GLB has exactly as many clips as were requested. Clips that cannot be identified are left out and the
	 * player animates those actions procedurally.
	 */
	public List<AnimationClip> resolve(List<String> glbClipNames, String url) {
		String[] matched = new String[clips.size()];
		Set<Integer> taken = new HashSet<>();
		for (int c = 0; c < clips.size(); c++) {
			int index = find(clips.get(c).name(), glbClipNames, taken);
			if (index >= 0) {
				taken.add(index);
				matched[c] = glbClipNames.get(index);
			}
		}
		if (glbClipNames.size() == clips.size()) {
			// same count: the clips we could not name are taken in file order
			int next = 0;
			for (int c = 0; c < clips.size(); c++) {
				if (matched[c] == null) {
					while (taken.contains(next)) {
						next++;
					}
					taken.add(next);
					matched[c] = glbClipNames.get(next);
				}
			}
		}
		List<AnimationClip> out = new ArrayList<>();
		for (int c = 0; c < clips.size(); c++) {
			if (matched[c] != null) {
				out.add(new AnimationClip(clips.get(c).name(), clips.get(c).preset(), matched[c], url));
			}
		}
		return out;
	}

	private static int find(String name, List<String> glbClipNames, Set<Integer> taken) {
		for (String word : SYNONYMS.getOrDefault(name, List.of(name))) {
			for (int i = 0; i < glbClipNames.size(); i++) {
				if (!taken.contains(i) && glbClipNames.get(i).toLowerCase(Locale.ROOT).contains(word)) {
					return i;
				}
			}
		}
		return -1;
	}

}
