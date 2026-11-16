package hr.fesb.diorama.tripo;

import java.util.List;

import hr.fesb.diorama.plan.StoryPlan.Kind;

/**
 * The part of the Tripo v3 API this project uses (API_NOTES §1). Every generating call returns a task id that
 * is then polled with {@link #task(String)}. Implementations: {@link LiveTripoClient} (real credits) and
 * {@link MockTripoClient} (bundled samples).
 */
public interface TripoClient {

	/** Spendable credits ({@code balance} is already net of {@code frozen}). */
	record Balance(double balance, double frozen) {
	}

	Balance balance();

	/** @param kindHint only used by the mock to pick a matching sample model */
	String textToModel(String prompt, Kind kindHint);

	/** @param nameHint the character's display name in the story language; only the mock uses it */
	default String textToModel(String prompt, Kind kindHint, String nameHint) {
		return textToModel(prompt, kindHint);
	}

	/** Free check whether a generated model can be rigged, and as what. */
	String rigCheck(String modelTaskId);

	String rig(String modelTaskId, String rigType, String rigModel);

	/** @param presets 1 to 5 exact preset ids, e.g. {@code preset:biped:walk} */
	String retarget(String rigTaskId, List<String> presets);

	TripoTask task(String taskId);

	/** Downloads a task output. Output URLs expire after a few minutes, so call this right after success. */
	byte[] download(String url);

	/** {@code mock} or {@code live}; part of the model cache key so samples never pose as real models. */
	String source();

	/**
	 * Extra cache key material for clients whose output depends on more than the prompt (the mock library match).
	 * Empty for the live API, so live cache keys never change.
	 */
	default String cacheSalt(String prompt, Kind kindHint, String nameHint) {
		return "";
	}

	/** True when the model at this output URL already carries our named clips (mock library), so no rig is needed. */
	default boolean preAnimated(String modelUrl) {
		return false;
	}

}
