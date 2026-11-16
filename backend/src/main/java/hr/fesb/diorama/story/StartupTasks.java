package hr.fesb.diorama.story;

import java.util.List;

import hr.fesb.diorama.model.CreditGuard;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Runs once after start-up. Pipelines live in memory, so stories that were still in progress when the
 * previous process stopped can never finish: they are marked failed instead of leaving clients polling forever.
 * (Assumes one backend instance per database, which is how this project is deployed.)
 */
@Component
public class StartupTasks implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(StartupTasks.class);

	private final StoryRepository stories;
	private final CreditGuard credits;

	public StartupTasks(StoryRepository stories, CreditGuard credits) {
		this.stories = stories;
		this.credits = credits;
	}

	@Override
	public void run(ApplicationArguments args) {
		List<String> interrupted = stories.failUnfinished(ApiError.INTERRUPTED.name());
		if (!interrupted.isEmpty()) {
			log.warn("marked {} unfinished story/stories from a previous run as failed", interrupted.size());
		}
		// so the first POST already knows the balance
		credits.refreshInBackground();
	}

}
