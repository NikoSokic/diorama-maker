package hr.fesb.diorama.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import hr.fesb.diorama.model.CreditGuard.Grant;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.testsupport.TestProps;
import hr.fesb.diorama.tripo.TripoClient;
import org.junit.jupiter.api.Test;

class ModelServiceCacheRaceTest {

	@Test
	void aModelFinishedByAnotherStoryJustAfterTheCacheMissIsReusedNotPaidForAgain() {
		TripoClient tripo = mock(TripoClient.class);
		when(tripo.source()).thenReturn("live");
		ModelStorage storage = mock(ModelStorage.class);
		when(storage.serves(anyString())).thenReturn(true);
		ModelRepository models = mock(ModelRepository.class);
		ModelService service = new ModelService(tripo, storage, models, TestProps.of());

		String prompt = "cute stylized low-poly toy fox";
		ModelRecord finishedElsewhere = new ModelRecord(UUID.randomUUID(), service.cacheKey(prompt), prompt, "live", "task-1",
				"https://files.example/base.glb", null, false, null, null, null, List.of());
		// first lookup: not cached yet; second lookup (after taking the in-flight slot): the other story saved it
		when(models.findByHash(service.cacheKey(prompt))).thenReturn(Optional.empty(), Optional.of(finishedElsewhere));

		ModelRecord model = service.obtain(prompt, Kind.QUADRUPED, new Grant(true, 1), (stage, percent) -> { });

		assertThat(model).isSameAs(finishedElsewhere);
		verify(tripo, never()).textToModel(anyString(), any());
		verify(models, never()).save(any());
	}

}
