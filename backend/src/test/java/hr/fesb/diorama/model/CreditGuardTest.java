package hr.fesb.diorama.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.CreditGuard.Grant;
import hr.fesb.diorama.model.CreditGuard.Need;
import hr.fesb.diorama.model.CreditGuard.Reservation;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.testsupport.TestProps;
import hr.fesb.diorama.tripo.MockTripoClient;
import hr.fesb.diorama.tripo.TripoClient;
import hr.fesb.diorama.tripo.TripoException;
import org.junit.jupiter.api.Test;

/** Prices: model 20, rig 25, 10 per clip. Biped = up to 5 clips (95 total), quadruped = 1 clip (55 total). */
class CreditGuardTest {

	private static final Need BIPED = new Need("biped", Kind.BIPED);
	private static final Need BIPED_2 = new Need("biped2", Kind.BIPED);
	private static final Need BIPED_3 = new Need("biped3", Kind.BIPED);
	private static final Need QUADRUPED = new Need("quadruped", Kind.QUADRUPED);
	private static final Need CREATURE = new Need("creature", Kind.CREATURE);

	private static CreditGuard guard(int balance, String... overrides) {
		DioramaProperties props = TestProps.of(overrides);
		MockTripoClient tripo = new MockTripoClient(props.tripo());
		tripo.setBalance(balance);
		return new CreditGuard(tripo, props);
	}

	@Test
	void withEnoughCreditsEveryoneGetsTheFullTreatment() {
		Reservation reservation = guard(1000).reserve(List.of(BIPED, QUADRUPED, CREATURE));

		assertThat(reservation.grantFor("biped")).isEqualTo(new Grant(true, 5));
		assertThat(reservation.grantFor("quadruped")).isEqualTo(new Grant(true, 1));
		assertThat(reservation.grantFor("creature")).isEqualTo(new Grant(true, 0));
		assertThat(reservation.credits()).isEqualTo(95 + 55 + 20);
	}

	@Test
	void modelsComeBeforeRigging() {
		Reservation reservation = guard(60).reserve(List.of(BIPED, BIPED_2, BIPED_3));

		assertThat(reservation.grants().values()).containsOnly(new Grant(true, 0));
		assertThat(reservation.credits()).isEqualTo(60);
	}

	@Test
	void aTightBudgetBuysFewerClips() {
		// 80 - 20 (model) = 60 left: rig 25 + 3 clips 30 = 55 fits, 4 clips (65) does not
		Reservation reservation = guard(80).reserve(List.of(BIPED));

		assertThat(reservation.grantFor("biped")).isEqualTo(new Grant(true, 3));
		assertThat(reservation.credits()).isEqualTo(75);
	}

	@Test
	void whenCreditsRunOutLaterModelsAreNotGenerated() {
		Reservation reservation = guard(30).reserve(List.of(CREATURE, BIPED));

		assertThat(reservation.grantFor("creature")).isEqualTo(new Grant(true, 0));
		assertThat(reservation.grantFor("biped")).isEqualTo(Grant.NOTHING);
		assertThat(reservation.grantFor("never-asked")).isEqualTo(Grant.NOTHING);
		assertThat(reservation.credits()).isEqualTo(20);
	}

	@Test
	void riggingCanBeSwitchedOff() {
		Reservation reservation = guard(1000, "tripo.enable-rigging", "false").reserve(List.of(BIPED, QUADRUPED));

		assertThat(reservation.grants().values()).containsOnly(new Grant(true, 0));
		assertThat(reservation.credits()).isEqualTo(40);
	}

	@Test
	void theFallbackRigModelHasFourClips() {
		Reservation reservation = guard(1000, "tripo.biped-rig-model", "v3.0-20260909").reserve(List.of(BIPED));

		assertThat(reservation.grantFor("biped")).isEqualTo(new Grant(true, 4));
	}

	@Test
	void concurrentStoriesCannotSpendTheSameCredits() {
		CreditGuard guard = guard(100);

		Reservation first = guard.reserve(List.of(BIPED));
		Reservation second = guard.reserve(List.of(BIPED_2));

		assertThat(first.credits()).isEqualTo(95);
		assertThat(second.grantFor("biped2")).isEqualTo(Grant.NOTHING);
		assertThat(guard.status().reserved()).isEqualTo(95);
		assertThat(guard.status().available()).isEqualTo(5);

		guard.release(first);
		guard.release(second);
		assertThat(guard.status().reserved()).isZero();
		assertThat(guard.reserve(List.of(BIPED_2)).grantFor("biped2")).isEqualTo(new Grant(true, 5));
	}

	@Test
	void refusesNewStoriesOnlyWhenCreditsAreKnownToBeGone() {
		CreditGuard empty = guard(19);
		assertThat(empty.canStartStory()).as("balance not read yet").isTrue();
		assertThat(empty.status().known()).isTrue();
		assertThat(empty.canStartStory()).isFalse();

		CreditGuard enough = guard(20);
		enough.status();
		assertThat(enough.canStartStory()).isTrue();
	}

	@Test
	void anUnreadableBalanceGrantsNothingButStillAcceptsStories() {
		TripoClient broken = new MockTripoClient(TestProps.of().tripo()) {
			@Override
			public synchronized Balance balance() {
				throw new TripoException(TripoException.Reason.TRANSPORT, "Tripo is down");
			}
		};
		CreditGuard guard = new CreditGuard(broken, TestProps.of());

		assertThat(guard.status().known()).isFalse();
		assertThat(guard.canStartStory()).isTrue();
		assertThat(guard.reserve(List.of(BIPED)).grantFor("biped")).isEqualTo(Grant.NOTHING);
	}

}
