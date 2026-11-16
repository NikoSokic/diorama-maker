package hr.fesb.diorama.story;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.model.CreditGuard;
import hr.fesb.diorama.model.CreditGuard.Grant;
import hr.fesb.diorama.model.CreditGuard.Need;
import hr.fesb.diorama.model.CreditGuard.Reservation;
import hr.fesb.diorama.model.ModelRecord;
import hr.fesb.diorama.model.ModelService;
import hr.fesb.diorama.plan.StoryPlan;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.plan.StoryPlan.StoryCharacter;
import hr.fesb.diorama.plan.StoryPlanner;
import hr.fesb.diorama.narration.NarrationClip;
import hr.fesb.diorama.narration.NarrationService;
import hr.fesb.diorama.story.StoryRepository.CharacterStatus;
import hr.fesb.diorama.tripo.TripoException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * The asynchronous part of story creation: moderate + plan, then one model per character in parallel.
 * A story only fails when it is rejected or something unexpected breaks; a character whose model cannot be
 * made becomes a placeholder and the story still reaches READY.
 */
@Component
public class StoryPipeline {

	private static final Logger log = LoggerFactory.getLogger(StoryPipeline.class);

	private final StoryPlanner planner;
	private final ModelService models;
	private final CreditGuard credits;
	private final StoryRepository stories;
	private final ObjectMapper json;
	private final ThreadPoolTaskExecutor modelExecutor;
	private final NarrationService narration;

	public StoryPipeline(StoryPlanner planner, ModelService models, CreditGuard credits, StoryRepository stories,
			ObjectMapper json, @Qualifier("modelExecutor") ThreadPoolTaskExecutor modelExecutor, NarrationService narration) {
		this.narration = narration;
		this.planner = planner;
		this.models = models;
		this.credits = credits;
		this.stories = stories;
		this.json = json;
		this.modelExecutor = modelExecutor;
	}

	public void run(UUID storyId, String slug, String text, String lang) {
		run(storyId, slug, text, lang, true);
	}

	/** @param listable whether a moderated plan may appear in the public gallery (variants never do) */
	public void run(UUID storyId, String slug, String text, String lang, boolean listable) {
		produce(storyId, slug, lang, () -> planner.plan(text, lang), listable);
	}

	/** A tweak: the plan is already made (an edited copy of a finished story's plan), so no language model runs. */
	public void runWithPlan(UUID storyId, String slug, String lang, StoryPlan plan) {
		produce(storyId, slug, lang, () -> StoryPlanner.Outcome.ok(plan), false);
	}

	private void produce(UUID storyId, String slug, String lang, java.util.function.Supplier<StoryPlanner.Outcome> planning,
			boolean listable) {
		long started = System.nanoTime();
		try {
			StoryPlanner.Outcome outcome = planning.get();
			if (outcome.rejected()) {
				stories.markFailed(storyId, ApiError.UNSAFE_CONTENT.name(), ApiError.UNSAFE_CONTENT.message(lang));
				log.info("story {} rejected as unsafe", slug);
				return;
			}
			StoryPlan plan = outcome.plan();
			List<String> keys = plan.characters().stream().map(StoryCharacter::key).toList();
			// a plan made without the LLM was not moderated by it: playable by link, but not in the gallery
			stories.startGeneration(storyId, json.writeValueAsString(plan), keys, listable && !outcome.fallback());
			// the voice is made while the models are; both are done before the story is READY
			CompletableFuture<List<NarrationClip>> voice = narration.start(plan);
			generateModels(storyId, plan);
			List<NarrationClip> clips = voice.join();
			if (!clips.isEmpty()) {
				stories.setNarration(storyId, json.writeValueAsString(clips));
			}
			stories.markReady(storyId);
			log.info("story {} ready in {} ms ({} characters, planner: {})", slug, (System.nanoTime() - started) / 1_000_000,
					keys.size(), plan.source());
		}
		catch (Exception | Error e) {
			log.error("story {} failed", slug, e);
			try {
				stories.markFailed(storyId, ApiError.INTERNAL.name(), ApiError.INTERNAL.message(lang));
			}
			catch (RuntimeException secondary) {
				log.error("could not mark story {} as failed", slug, secondary);
			}
			if (e instanceof Error error) {
				throw error;
			}
		}
	}

	private void generateModels(UUID storyId, StoryPlan plan) {
		// reserve credits once per distinct model that is not cached yet
		Map<String, Kind> missing = new LinkedHashMap<>();
		for (StoryCharacter character : plan.characters()) {
			if (models.cached(character.tripoPrompt(), character.kind(), character.displayName()).isEmpty()) {
				missing.putIfAbsent(models.cacheKey(character.tripoPrompt(), character.kind(), character.displayName()), character.kind());
			}
		}
		List<Need> needs = missing.entrySet().stream().map(entry -> new Need(entry.getKey(), entry.getValue())).toList();
		Reservation reservation = credits.reserve(needs);
		try {
			List<CompletableFuture<Void>> running = new ArrayList<>();
			for (StoryCharacter character : plan.characters()) {
				Grant grant = reservation.grantFor(models.cacheKey(character.tripoPrompt(), character.kind(), character.displayName()));
				Runnable job = () -> generateCharacter(storyId, character, grant);
				try {
					running.add(CompletableFuture.runAsync(job, modelExecutor));
				}
				catch (RejectedExecutionException e) {
					// pool and queue are full: do the work on this story's own thread instead of dropping it
					job.run();
				}
			}
			CompletableFuture.allOf(running.toArray(CompletableFuture[]::new)).join();
		}
		finally {
			credits.release(reservation);
		}
	}

	private void generateCharacter(UUID storyId, StoryCharacter character, Grant grant) {
		String key = character.key();
		int[] lastPercent = { -1 };
		CharacterStatus[] lastStatus = { null };
		ModelService.Progress progress = (stage, percent) -> {
			CharacterStatus status = stage == ModelService.Stage.RIGGING ? CharacterStatus.RIGGING : CharacterStatus.GENERATING;
			// never move the bar backwards (a retry starts again from zero)
			int shown = Math.max(percent, lastPercent[0]);
			if (shown == lastPercent[0] && status == lastStatus[0]) {
				return;
			}
			lastPercent[0] = shown;
			lastStatus[0] = status;
			try {
				stories.updateCharacter(storyId, key, status, Math.min(shown, 99), null, null);
			}
			catch (RuntimeException e) {
				// progress is cosmetic; a database hiccup must not abort a model that is being paid for
				log.debug("could not store progress for '{}': {}", key, e.getMessage());
			}
		};
		try {
			ModelRecord model = models.obtain(character.tripoPrompt(), character.kind(), character.displayName(), grant, progress);
			stories.updateCharacter(storyId, key, CharacterStatus.READY, 100, model.id(), null);
		}
		catch (TripoException e) {
			log.warn("character '{}' becomes a placeholder ({}): {}", key, e.reason(), e.getMessage());
			String code = switch (e.reason()) {
				case INSUFFICIENT_CREDITS -> "NO_CREDITS";
				case CONTENT_POLICY -> "CONTENT_POLICY";
				case TIMEOUT -> "TIMEOUT";
				default -> "GENERATION_FAILED";
			};
			stories.updateCharacter(storyId, key, CharacterStatus.PLACEHOLDER, 100, null, code);
		}
		catch (RuntimeException e) {
			log.error("character '{}' becomes a placeholder after an unexpected error", key, e);
			stories.updateCharacter(storyId, key, CharacterStatus.PLACEHOLDER, 100, null, "GENERATION_FAILED");
		}
	}

}
