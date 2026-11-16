package hr.fesb.diorama.config;

import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.config.DioramaProperties.Mode;
import hr.fesb.diorama.narration.GeminiSpeech;
import hr.fesb.diorama.narration.NarrationClipRepository;
import hr.fesb.diorama.narration.NarrationService;
import hr.fesb.diorama.narration.SpeechClient;
import hr.fesb.diorama.plan.GeminiClient;
import hr.fesb.diorama.plan.GeminiStoryPlanner;
import hr.fesb.diorama.plan.OfflineStoryPlanner;
import hr.fesb.diorama.plan.PlanValidator;
import hr.fesb.diorama.plan.StoryPlanner;
import hr.fesb.diorama.storage.LocalModelStorage;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.storage.SupabaseModelStorage;
import hr.fesb.diorama.tripo.LiveTripoClient;
import hr.fesb.diorama.tripo.MockTripoClient;
import hr.fesb.diorama.tripo.TripoClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Chooses mock or live implementations from the settings and owns the pipeline thread pools. */
@Configuration
@EnableConfigurationProperties(DioramaProperties.class)
public class AppConfig {

	private static final Logger log = LoggerFactory.getLogger(AppConfig.class);

	@Bean
	TripoClient tripoClient(DioramaProperties props, ObjectMapper json) {
		DioramaProperties.Tripo tripo = props.tripo();
		if (tripo.resolvedMode() == Mode.LIVE) {
			if (tripo.apiKey().isBlank()) {
				throw new IllegalStateException("TRIPO_MODE=live needs TRIPO_API_KEY; set it or switch back to TRIPO_MODE=mock");
			}
			log.warn("Tripo is LIVE: generating models spends real credits");
			return new LiveTripoClient(tripo, json);
		}
		log.info("Tripo is in mock mode (bundled sample models, no credits spent)");
		return new MockTripoClient(tripo);
	}

	@Bean
	NarrationService narrationService(DioramaProperties props, ModelStorage storage, NarrationClipRepository clips, ObjectMapper json) {
		DioramaProperties.Gemini gemini = props.gemini();
		SpeechClient speech = gemini.ttsEnabled() ? new GeminiSpeech(gemini, json) : null;
		log.info(speech == null ? "narration: browser voice (generated voice off)" : "narration: generated voice ({})", gemini.ttsModel());
		// one request at a time: the free tier's per-minute limit is small and unknown
		ExecutorService executor = Executors.newSingleThreadExecutor(Thread.ofPlatform().name("narration").daemon().factory());
		return new NarrationService(speech, storage, clips, executor, gemini.ttsBudget(), gemini.ttsDailyLimit(), Clock.systemUTC());
	}

	@Bean
	StoryPlanner storyPlanner(DioramaProperties props, PlanValidator validator, ObjectMapper json) {
		OfflineStoryPlanner offline = new OfflineStoryPlanner(validator);
		if (props.gemini().resolvedMode() == Mode.LIVE) {
			log.info("Story planner: Gemini ({})", props.gemini().model());
			return new GeminiStoryPlanner(new GeminiClient(props.gemini(), json), validator, offline, json);
		}
		log.info("Story planner: offline (no Gemini key or GEMINI_MODE=mock)");
		return offline;
	}

	@Bean
	ModelStorage modelStorage(DioramaProperties props) {
		String mode = props.storage().mode().trim().toLowerCase();
		boolean supabase = switch (mode) {
			case "supabase" -> true;
			case "local" -> false;
			default -> props.tripo().resolvedMode() == Mode.LIVE && props.supabase().configured();
		};
		if (supabase) {
			if (!props.supabase().configured()) {
				throw new IllegalStateException("STORAGE_MODE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY");
			}
			log.info("Model storage: Supabase bucket '{}'", props.supabase().bucket());
			return new SupabaseModelStorage(props.supabase());
		}
		log.info("Model storage: local files under '{}' served at /api/files", props.storage().localDir());
		return new LocalModelStorage(props.storage().localDir());
	}

	/** Runs one story pipeline per thread; each waits for its characters. */
	@Bean
	ThreadPoolTaskExecutor storyExecutor() {
		return executor("story-", 4, 40);
	}

	/** Runs one character (generate, rig, upload) per thread. Tripo allows 10 concurrent generations. */
	@Bean
	ThreadPoolTaskExecutor modelExecutor() {
		return executor("model-", 8, 120);
	}

	private static ThreadPoolTaskExecutor executor(String prefix, int threads, int queue) {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setThreadNamePrefix(prefix);
		executor.setCorePoolSize(threads);
		executor.setMaxPoolSize(threads);
		executor.setQueueCapacity(queue);
		executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
		executor.setWaitForTasksToCompleteOnShutdown(false);
		return executor;
	}

}
