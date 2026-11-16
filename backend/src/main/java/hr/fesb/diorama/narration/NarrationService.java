package hr.fesb.diorama.narration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

import hr.fesb.diorama.narration.SpeechClient.SpeechException;
import hr.fesb.diorama.plan.StoryPlan;
import hr.fesb.diorama.storage.ModelStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Speaks a story's narration with the generated voice, scene by scene. All or nothing: a story either has a clip
 * for every scene or none (then the player reads it with the browser's voice), because switching voices halfway
 * sounds worse than either. Quota trouble only pauses narration; it never blocks the story itself.
 */
public class NarrationService {

	private static final Logger log = LoggerFactory.getLogger(NarrationService.class);
	/** Clips above this are not a single scene's narration. */
	static final int MAX_BYTES = 3 * 1024 * 1024;
	/** Plausible speaking speed in characters per second; outside it the model added or dropped words. */
	static final double MIN_CPS = 4;
	static final double MAX_CPS = 30;
	static final Duration QUOTA_PAUSE = Duration.ofMinutes(30);

	/** Null when the generated voice is off. */
	private final SpeechClient speech;
	private final ModelStorage storage;
	private final NarrationClipRepository clips;
	private final Executor executor;
	private final Duration budget;
	private final int dailyLimit;
	private final Clock clock;

	private Instant pausedUntil = Instant.MIN;
	private LocalDate day = LocalDate.MIN;
	private int usedToday;

	public NarrationService(SpeechClient speech, ModelStorage storage, NarrationClipRepository clips, Executor executor,
			Duration budget, int dailyLimit, Clock clock) {
		this.speech = speech;
		this.storage = storage;
		this.clips = clips;
		this.executor = executor;
		this.budget = budget;
		this.dailyLimit = dailyLimit;
		this.clock = clock;
	}

	/** Starts narrating in the background; completes with one clip per scene, or an empty list. */
	public CompletableFuture<List<NarrationClip>> start(StoryPlan plan) {
		if (speech == null) {
			return CompletableFuture.completedFuture(List.of());
		}
		return CompletableFuture.supplyAsync(() -> narrate(plan), executor).exceptionally(e -> {
			log.warn("narration failed, the browser voice will read this story: {}", e.getMessage());
			return List.of();
		});
	}

	public List<NarrationClip> narrate(StoryPlan plan) {
		Instant deadline = clock.instant().plus(budget);
		List<NarrationClip> out = new ArrayList<>();
		for (StoryPlan.Scene scene : plan.scenes()) {
			String text = scene.narration() == null ? "" : scene.narration().trim();
			if (text.isEmpty()) {
				return List.of();
			}
			Optional<NarrationClip> clip = clip(text, plan.language(), deadline);
			if (clip.isEmpty()) {
				return List.of();
			}
			out.add(clip.get());
		}
		return out;
	}

	private Optional<NarrationClip> clip(String text, String lang, Instant deadline) {
		String hash = hash(speech.model(), speech.voice(), GeminiSpeech.style(lang), text);
		Optional<NarrationClip> cached = clips.find(hash).filter(c -> storage.serves(c.url()));
		if (cached.isPresent()) {
			return cached;
		}
		if (!allowed(deadline)) {
			return Optional.empty();
		}
		byte[] wav;
		try {
			wav = speech.speak(text, lang);
		}
		catch (SpeechException e) {
			if (e.quota()) {
				pause();
			}
			log.warn("no narration clip: {}", e.getMessage());
			return Optional.empty();
		}
		Optional<Wav.Info> info = Wav.inspect(wav);
		if (info.isEmpty() || wav.length > MAX_BYTES) {
			log.warn("narration clip rejected: not a WAV file or too large ({} bytes)", wav == null ? 0 : wav.length);
			return Optional.empty();
		}
		double cps = text.length() / Math.max(info.get().durationSec(), 0.01);
		if (cps < MIN_CPS || cps > MAX_CPS) {
			log.warn("narration clip rejected: {} characters in {} s does not sound like the text", text.length(),
					String.format("%.1f", info.get().durationSec()));
			return Optional.empty();
		}
		NarrationClip clip = new NarrationClip(storage.put("narration/" + hash + ".wav", wav, "audio/wav"), info.get().durationSec());
		clips.save(hash, clip);
		return Optional.of(clip);
	}

	/** Not paused after a quota answer, under today's cap, and still inside this story's time budget. */
	private synchronized boolean allowed(Instant deadline) {
		Instant now = clock.instant();
		if (now.isBefore(pausedUntil) || now.isAfter(deadline)) {
			return false;
		}
		LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
		if (!today.equals(day)) {
			day = today;
			usedToday = 0;
		}
		if (usedToday >= dailyLimit) {
			return false;
		}
		usedToday++;
		return true;
	}

	private synchronized void pause() {
		pausedUntil = clock.instant().plus(QUOTA_PAUSE);
		log.warn("speech quota exhausted: narration paused for {} minutes", QUOTA_PAUSE.toMinutes());
	}

	static String hash(String... parts) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
				.digest(String.join("|", parts).getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
