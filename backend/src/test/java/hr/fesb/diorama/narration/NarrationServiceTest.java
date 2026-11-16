package hr.fesb.diorama.narration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.narration.SpeechClient.SpeechException;
import hr.fesb.diorama.plan.StoryPlan;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

class NarrationServiceTest {

	/** A PCM WAV of silence, {@code seconds} long, 24 kHz mono 16-bit like Gemini's output. */
	static byte[] wav(double seconds) {
		int rate = 24000;
		int data = (int) (seconds * rate) * 2;
		ByteBuffer b = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN);
		b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + data).put("WAVE".getBytes(StandardCharsets.US_ASCII));
		b.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1).putInt(rate)
			.putInt(rate * 2).putShort((short) 2).putShort((short) 16);
		b.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(data);
		return b.array();
	}

	/** Speaks at a natural 13 characters per second unless told otherwise. */
	static class FakeSpeech implements SpeechClient {
		final List<String> spoken = new ArrayList<>();
		Function<String, byte[]> answer = text -> wav(text.length() / 13.0);

		@Override
		public String model() {
			return "fake-tts";
		}

		@Override
		public String voice() {
			return "Fake";
		}

		@Override
		public byte[] speak(String text, String lang) {
			spoken.add(text);
			return answer.apply(text);
		}
	}

	static class MemoryStorage implements ModelStorage {
		final Map<String, byte[]> files = new HashMap<>();

		@Override
		public String put(String path, byte[] bytes, String contentType) {
			files.put("/api/files/" + path, bytes);
			return "/api/files/" + path;
		}

		@Override
		public boolean serves(String url) {
			return files.containsKey(url);
		}
	}

	/** The clip cache without a database. */
	static class MemoryClips extends NarrationClipRepository {
		final Map<String, NarrationClip> rows = new HashMap<>();

		MemoryClips() {
			super((JdbcClient) null);
		}

		@Override
		public Optional<NarrationClip> find(String hash) {
			return Optional.ofNullable(rows.get(hash));
		}

		@Override
		public void save(String hash, NarrationClip clip) {
			rows.put(hash, clip);
		}
	}

	private final FakeSpeech speech = new FakeSpeech();
	private final MemoryStorage storage = new MemoryStorage();
	private final MemoryClips clips = new MemoryClips();
	private final MutableClock clock = new MutableClock();

	private NarrationService service(int dailyLimit) {
		return new NarrationService(speech, storage, clips, Runnable::run, Duration.ofSeconds(60), dailyLimit, clock);
	}

	private static StoryPlan plan(String... narrations) {
		List<StoryPlan.Scene> scenes = new ArrayList<>();
		for (String n : narrations) {
			scenes.add(new StoryPlan.Scene(null, null, null, n, 6, null, List.of(), List.of()));
		}
		return new StoryPlan("T", "hr", null, List.of(), List.of(), scenes, "test");
	}

	@Test
	void speaksEveryScene_storesTheClipsAndKnowsHowLongTheyPlay() {
		List<NarrationClip> out = service(10).narrate(plan("Lisica je skočila visoko.", "Djevojčica je zaplesala."));

		assertThat(out).hasSize(2);
		assertThat(out).allSatisfy(c -> assertThat(c.url()).startsWith("/api/files/narration/").endsWith(".wav"));
		assertThat(out.get(0).durationSec()).isCloseTo("Lisica je skočila visoko.".length() / 13.0, org.assertj.core.data.Offset.offset(0.01));
		assertThat(storage.files).hasSize(2);
	}

	@Test
	void aSceneSpokenBeforeIsTakenFromTheCache() {
		service(10).narrate(plan("Zmaj je mahnuo."));
		service(10).narrate(plan("Zmaj je mahnuo.", "Kraj."));

		assertThat(speech.spoken).containsExactly("Zmaj je mahnuo.", "Kraj.");
	}

	@Test
	void allOrNothing_oneFailedSceneMeansTheBrowserVoiceReadsTheWholeStory() {
		speech.answer = text -> {
			if (text.startsWith("Drugi")) {
				throw new SpeechException(false, "boom");
			}
			return wav(text.length() / 13.0);
		};

		assertThat(service(10).narrate(plan("Prvi prizor.", "Drugi prizor.", "Treći prizor."))).isEmpty();
		assertThat(speech.spoken).hasSize(2); // stops at the first failure
	}

	@Test
	void aQuotaAnswerPausesNarrationButOnlyForAWhile() {
		NarrationService service = service(10);
		speech.answer = text -> {
			throw new SpeechException(true, "quota");
		};
		assertThat(service.narrate(plan("Prvi."))).isEmpty();

		speech.answer = text -> wav(text.length() / 13.0);
		assertThat(service.narrate(plan("Drugi."))).isEmpty();
		assertThat(speech.spoken).containsExactly("Prvi.");

		clock.advance(NarrationService.QUOTA_PAUSE.plusSeconds(1));
		assertThat(service.narrate(plan("Drugi."))).hasSize(1);
	}

	@Test
	void clipsThatCannotBeTheTextAreRejected() {
		speech.answer = text -> wav(0.2); // far too fast for the text: the model dropped words
		assertThat(service(10).narrate(plan("Ovo je prilično duga rečenica koju nitko ne može izgovoriti u djeliću sekunde."))).isEmpty();

		speech.answer = text -> "not audio".getBytes(StandardCharsets.UTF_8);
		assertThat(service(10).narrate(plan("Kratko."))).isEmpty();
		assertThat(storage.files).isEmpty();
	}

	@Test
	void theDailyCapStopsNewRequestsUntilTomorrow() {
		NarrationService service = service(2);
		assertThat(service.narrate(plan("Jedan.", "Dva."))).hasSize(2);
		assertThat(service.narrate(plan("Tri."))).isEmpty();

		clock.advance(Duration.ofDays(1));
		assertThat(service.narrate(plan("Tri."))).hasSize(1);
	}

	@Test
	void withoutASpeechClientTheStoryUsesTheBrowserVoice() {
		NarrationService off = new NarrationService(null, storage, clips, Runnable::run, Duration.ofSeconds(60), 10, clock);
		assertThat(off.start(plan("Prvi.")).join()).isEmpty();
	}

	@Test
	void readsTheAudioPartOfAGeminiAnswer() throws Exception {
		GeminiSpeech gemini = new GeminiSpeech(TestProps.of().gemini(), new ObjectMapper());
		String data = Base64.getEncoder().encodeToString(wav(1));
		byte[] body = ("{\"steps\":[{\"type\":\"thought\"},{\"type\":\"model_output\",\"content\":[{\"type\":\"audio\",\"mime_type\":\"audio/wav\",\"data\":\""
				+ data + "\"}]}]}").getBytes(StandardCharsets.UTF_8);

		assertThat(Wav.inspect(gemini.audio(body))).hasValueSatisfying(info -> assertThat(info.durationSec()).isEqualTo(1.0));
		assertThat(GeminiSpeech.style("hr")).contains("Croatian");
		assertThat(GeminiSpeech.style("en")).contains("English").doesNotContain("Croatian");
	}

	@Test
	void wavInspectionWalksTheChunksAndCountsOnlyRealData() {
		byte[] good = wav(2);
		assertThat(Wav.inspect(good)).hasValueSatisfying(info -> {
			assertThat(info.sampleRate()).isEqualTo(24000);
			assertThat(info.durationSec()).isEqualTo(2.0);
		});
		// a streaming writer's "unknown" data size must not make the clip look hours long
		ByteBuffer.wrap(good).order(ByteOrder.LITTLE_ENDIAN).putInt(40, -1);
		assertThat(Wav.inspect(good)).hasValueSatisfying(info -> assertThat(info.durationSec()).isEqualTo(2.0));
		assertThat(Wav.inspect("RIFF....WAVEjunk".getBytes(StandardCharsets.US_ASCII))).isEmpty();
	}

	static class MutableClock extends Clock {
		private Instant now = Instant.parse("2026-11-16T10:00:00Z");

		void advance(Duration d) {
			now = now.plus(d);
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

}
