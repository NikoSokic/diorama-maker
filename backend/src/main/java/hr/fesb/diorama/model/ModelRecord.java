package hr.fesb.diorama.model;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A generated 3D model as stored in the {@code models} table (the cache, keyed by {@code promptHash}). */
public record ModelRecord(
		UUID id,
		String promptHash,
		String prompt,
		String source,
		String tripoTaskId,
		String glbUrl,
		String thumbnailUrl,
		boolean rigged,
		String rigType,
		String rigTaskId,
		String riggedGlbUrl,
		List<AnimationClip> animations) {

	/**
	 * One skeletal animation the player can use.
	 *
	 * @param name   our name: idle, walk, run, jump, celebrate
	 * @param preset the Tripo preset it came from
	 * @param clip   the clip's name inside the GLB at {@code url}
	 * @param url    GLB that contains the mesh, the skeleton and this clip
	 */
	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record AnimationClip(String name, String preset, String clip, String url) {
	}

}
