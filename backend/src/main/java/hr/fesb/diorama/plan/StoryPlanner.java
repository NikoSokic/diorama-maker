package hr.fesb.diorama.plan;

/** Moderates a story and turns it into a {@link StoryPlan}. Implementations never throw for bad story text. */
public interface StoryPlanner {

	Outcome plan(String storyText, String lang);

	/**
	 * @param plan     null only when the story was rejected
	 * @param rejected the story is not suitable for children
	 * @param fallback the LLM was unreachable and the offline planner stood in; such stories were not
	 *                 moderated by the LLM and must stay out of the public gallery
	 */
	record Outcome(StoryPlan plan, boolean rejected, boolean fallback) {

		public static Outcome ok(StoryPlan plan) {
			return new Outcome(plan, false, false);
		}

		public static Outcome reject() {
			return new Outcome(null, true, false);
		}

		public static Outcome fallback(StoryPlan plan) {
			return new Outcome(plan, false, true);
		}
	}

}
