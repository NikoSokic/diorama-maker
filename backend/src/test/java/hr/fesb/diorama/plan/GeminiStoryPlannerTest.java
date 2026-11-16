package hr.fesb.diorama.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.testsupport.Fixtures;
import org.junit.jupiter.api.Test;

class GeminiStoryPlannerTest {

	private static final String STORY = "Zec je skakutao šumom. Sreo je lisicu. Zajedno su plesali do večeri.";

	private final GeminiClient gemini = mock(GeminiClient.class);
	private final PlanValidator validator = new PlanValidator();
	private final GeminiStoryPlanner planner = new GeminiStoryPlanner(gemini, validator, new OfflineStoryPlanner(validator),
			new ObjectMapper());

	@Test
	void usesAGoodAnswerAsIs() {
		when(gemini.generate(anyString(), anyString(), any())).thenReturn(Fixtures.geminiPlan());

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.rejected()).isFalse();
		assertThat(outcome.fallback()).isFalse();
		assertThat(outcome.plan().source()).isEqualTo("gemini");
		assertThat(outcome.plan().title()).isEqualTo("Zec i lisica");
		assertThat(outcome.plan().characters()).hasSize(2);
		assertThat(outcome.plan().scenes()).hasSize(3);
		assertThat(outcome.plan().scenes().get(0).props()).hasSize(1);
		verify(gemini, times(1)).generate(anyString(), contains(STORY), any());
	}

	@Test
	void asksOnceMoreWithTheValidationErrors() {
		when(gemini.generate(anyString(), anyString(), any()))
			.thenReturn("```json\n{\"safeForKids\":true,\"title\":\"Pola plana\",\"characters\":[],\"scenes\":[]}\n```")
			.thenReturn(Fixtures.geminiPlan());

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.plan().title()).isEqualTo("Zec i lisica");
		verify(gemini, times(2)).generate(anyString(), anyString(), any());
		verify(gemini).generate(anyString(), contains("previous answer had these problems"), any());
		verify(gemini).generate(anyString(), contains("scenes: need 3 to 6"), any());
	}

	@Test
	void fallsBackToDefaultsWhenTheAnswerStaysUnusable() {
		when(gemini.generate(anyString(), anyString(), any())).thenReturn("I cannot do that").thenReturn("{}");

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.rejected()).isFalse();
		assertThat(outcome.plan().scenes()).hasSize(3);
		assertThat(outcome.plan().scenes().get(0).narration()).isEqualTo("Zec je skakutao šumom.");
		verify(gemini, times(2)).generate(anyString(), anyString(), any());
	}

	@Test
	void keepsTheRepairedFirstPlanWhenTheRetryCallFails() {
		when(gemini.generate(anyString(), anyString(), any()))
			.thenReturn("{\"safeForKids\":true,\"title\":\"Samo naslov\"}")
			.thenThrow(new GeminiClient.UnavailableException("quota"));

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.fallback()).isFalse();
		assertThat(outcome.plan().title()).isEqualTo("Samo naslov");
		assertThat(outcome.plan().scenes()).hasSize(3);
	}

	@Test
	void rejectsWhenTheModelSaysNotSafeForKids() {
		when(gemini.generate(anyString(), anyString(), any()))
			.thenReturn(Fixtures.geminiPlan().replace("\"safeForKids\": true", "\"safeForKids\": false"));

		assertThat(planner.plan(STORY, "hr").rejected()).isTrue();
	}

	@Test
	void rejectsWhenTheSafetyFilterBlocksTheStory() {
		when(gemini.generate(anyString(), anyString(), any())).thenThrow(new GeminiClient.BlockedException("blocked"));

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.rejected()).isTrue();
		assertThat(outcome.plan()).isNull();
	}

	@Test
	void obviouslyUnsafeTextNeverReachesGemini() {
		assertThat(planner.plan("Vitez je ubio zmaja.", "hr").rejected()).isTrue();

		verifyNoInteractions(gemini);
	}

	@Test
	void usesTheOfflinePlannerWhenGeminiIsDown() {
		when(gemini.generate(anyString(), anyString(), any())).thenThrow(new GeminiClient.UnavailableException("HTTP 503"));

		StoryPlanner.Outcome outcome = planner.plan(STORY, "hr");

		assertThat(outcome.rejected()).isFalse();
		assertThat(outcome.fallback()).isTrue();
		assertThat(outcome.plan().source()).isEqualTo("offline");
		assertThat(outcome.plan().characters()).isNotEmpty();
	}

}
