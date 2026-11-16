package hr.fesb.diorama.tripo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.GlbInspector;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;

class MockTripoClientTest {

	private final DioramaProperties.Tripo props = TestProps.of("tripo.mock.balance", "200").tripo();
	private final MockTripoClient client = new MockTripoClient(props);

	private TripoTask await(String taskId) {
		return TaskPoller.await(client, taskId, props, percent -> { });
	}

	@Test
	void behavesLikeTheRealTaskFlowAndChargesTheMockWallet() {
		String modelTask = client.textToModel("cute toy robot", Kind.BIPED);
		assertThat(client.task(modelTask).status()).isEqualTo(TripoTask.Status.PENDING);
		assertThat(client.balance().balance()).isEqualTo(180);

		TripoTask model = await(modelTask);
		byte[] glb = client.download(model.modelUrl());
		assertThat(GlbInspector.isGlb(glb)).isTrue();

		TripoTask check = await(client.rigCheck(modelTask));
		assertThat(check.riggable()).isTrue();
		assertThat(check.rigType()).isEqualTo("biped");

		String rigTask = client.rig(modelTask, "biped", "v1.0-20240301");
		await(rigTask);
		TripoTask animated = await(client.retarget(rigTask, List.of("preset:biped:walk", "preset:biped:idle")));
		assertThat(GlbInspector.animationNames(client.download(animated.modelUrl()))).contains("Walking", "Idle");
		assertThat(client.balance().balance()).isEqualTo(200 - 20 - 25 - 20);
	}

	@Test
	void reportsProgressBeforeItFinishes() {
		DioramaProperties.Tripo slow = TestProps.of("tripo.mock.generation-time", "300ms").tripo();
		MockTripoClient slowClient = new MockTripoClient(slow);
		java.util.List<Integer> seen = new java.util.ArrayList<>();

		TaskPoller.await(slowClient, slowClient.textToModel("p", Kind.OBJECT), slow, seen::add);

		assertThat(seen).isNotEmpty().isSorted().allMatch(percent -> percent >= 0 && percent < 100);
	}

	@Test
	void staticKindsAreNotRiggable() {
		TripoTask check = await(client.rigCheck(client.textToModel("a mushroom", Kind.OBJECT)));

		assertThat(check.riggable()).isFalse();
		assertThat(check.rigType()).isNull();
	}

	@Test
	void failureKeywordsSimulateFailedTasksWithoutCharging() {
		String failing = client.textToModel("mock-fail robot", Kind.BIPED);

		assertThatThrownBy(() -> await(failing))
			.isInstanceOfSatisfying(TripoException.class, e -> assertThat(e.retryable()).isTrue());
		assertThat(client.balance().balance()).isEqualTo(200);

		assertThatThrownBy(() -> await(client.textToModel("mock-flaky robot", Kind.BIPED))).isInstanceOf(TripoException.class);
		assertThat(await(client.textToModel("mock-flaky robot", Kind.BIPED)).status()).isEqualTo(TripoTask.Status.SUCCESS);
	}

	@Test
	void anEmptyWalletRefusesNewTasks() {
		client.setBalance(19);

		assertThatThrownBy(() -> client.textToModel("p", Kind.BIPED))
			.isInstanceOfSatisfying(TripoException.class,
					e -> assertThat(e.reason()).isEqualTo(TripoException.Reason.INSUFFICIENT_CREDITS));
	}

	@Test
	void timesOutWhenATaskTakesTooLong() {
		DioramaProperties.Tripo impatient = TestProps.of("tripo.mock.generation-time", "5s", "tripo.task-timeout", "40ms").tripo();
		MockTripoClient slowClient = new MockTripoClient(impatient);

		assertThatThrownBy(() -> TaskPoller.await(slowClient, slowClient.textToModel("p", Kind.OBJECT), impatient, p -> { }))
			.isInstanceOfSatisfying(TripoException.class, e -> {
				assertThat(e.reason()).isEqualTo(TripoException.Reason.TIMEOUT);
				assertThat(e.retryable()).as("a timed-out task may still be charged").isFalse();
			});
	}

}
