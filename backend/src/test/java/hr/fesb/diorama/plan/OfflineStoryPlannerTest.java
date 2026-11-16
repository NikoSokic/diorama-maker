package hr.fesb.diorama.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.plan.StoryPlan.ActionType;
import hr.fesb.diorama.plan.StoryPlan.Environment;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.plan.StoryPlan.Scene;
import hr.fesb.diorama.plan.StoryPlan.StoryCharacter;
import hr.fesb.diorama.plan.StoryPlan.TimeOfDay;
import hr.fesb.diorama.plan.StoryPlan.Weather;
import org.junit.jupiter.api.Test;

class OfflineStoryPlannerTest {

	private final PlanValidator validator = new PlanValidator();
	private final OfflineStoryPlanner planner = new OfflineStoryPlanner(validator);

	@Test
	void findsCharactersAndSettingsInACroatianStory() {
		StoryPlan plan = planner.plan("Zec i lisica su se igrali u šumi. Počela je padati kiša. "
				+ "Sakrili su se u špilju. Kad je pala noć, veselo su plesali.", "hr").plan();

		assertThat(plan.source()).isEqualTo("offline");
		assertThat(plan.language()).isEqualTo("hr");
		assertThat(plan.characters()).extracting(StoryCharacter::key).containsExactly("rabbit", "fox");
		assertThat(plan.characters()).extracting(StoryCharacter::displayName).containsExactly("Zec", "Lisica");
		assertThat(plan.characters().get(0).tripoPrompt())
			.isEqualTo(PlanValidator.canonicalPrompt("white rabbit with long ears"));
		assertThat(plan.scenes()).hasSize(4);
		assertThat(plan.scenes()).extracting(Scene::environment)
			.containsExactly(Environment.FOREST, Environment.FOREST, Environment.CAVE, Environment.CAVE);
		assertThat(plan.scenes()).extracting(Scene::weather)
			.containsExactly(Weather.CLEAR, Weather.RAIN, Weather.RAIN, Weather.RAIN);
		assertThat(plan.scenes().get(3).timeOfDay()).isEqualTo(TimeOfDay.NIGHT);
		assertThat(plan.scenes().get(0).narration()).isEqualTo("Zec i lisica su se igrali u šumi.");
		assertThat(plan.scenes().get(0).actions()).filteredOn(a -> a.type() == ActionType.ENTER).hasSize(2);
		assertThat(plan.scenes().get(3).actions())
			.anyMatch(a -> a.type() == ActionType.CELEBRATE || a.type() == ActionType.DANCE);
	}

	@Test
	void recognisesEnglishWordsWithoutFalsePositives() {
		StoryPlan plan = planner.plan("A brave knight met a dragon near the castle. In the season of rain they "
				+ "searched for more treasure. The dragon picked a star.", "en").plan();

		assertThat(plan.characters()).extracting(StoryCharacter::key).containsExactly("knight", "dragon", "star");
		assertThat(plan.characters()).extracting(StoryCharacter::kind).containsExactly(Kind.BIPED, Kind.BIPED, Kind.OBJECT);
		// "season" and "searched" must not read as "sea", "more" not as Croatian "more"
		assertThat(plan.scenes()).extracting(Scene::environment).containsOnly(Environment.CASTLE);
		assertThat(plan.language()).isEqualTo("en");
	}

	@Test
	void aStoryWithoutKnownCharactersStillGetsACast() {
		StoryPlan plan = planner.plan("Nešto se dogodilo.", "hr").plan();

		assertThat(plan.characters()).hasSize(1);
		assertThat(plan.characters().get(0).displayName()).isEqualTo("Prijatelj");
		assertThat(plan.scenes()).hasSize(PlanValidator.MIN_SCENES);
		assertThat(plan.title()).isNotBlank();
	}

	@Test
	void longStoriesAreCappedAtSixScenes() {
		StoryPlan plan = planner.plan("Pas trči. ".repeat(20).trim(), "hr").plan();

		assertThat(plan.scenes()).hasSize(PlanValidator.MAX_SCENES);
		assertThat(plan.characters()).extracting(StoryCharacter::key).containsExactly("dog");
	}

	@Test
	void rejectsUnsafeStories() {
		assertThat(planner.plan("Vuk je ubio zeca i bilo je krvavo.", "hr").rejected()).isTrue();
		assertThat(planner.plan("He took a gun and shot everyone.", "en").rejected()).isTrue();
		assertThat(planner.plan("Medo ljubi baku, a gore na brdu raste bombon.", "hr").rejected()).isFalse();
	}

	@Test
	void draftsNeedNoRepairWhenValidatedAgain() {
		ObjectMapper json = new ObjectMapper();
		List<String> stories = List.of(
				"Zmaj leti.",
				"Princeza, vitez i zmaj plešu u dvorcu. Pada snijeg! Svi se smiju?",
				"The robot hid behind a tree. The cat jumped. The bird sang. They ran home. It was night. They slept. Bye.",
				"   ",
				"x".repeat(500));
		for (String story : stories) {
			StoryPlan plan = planner.draft(story, "hr");

			PlanValidator.Result again = validator.validate(json.valueToTree(plan), story, "hr", "offline");
			assertThat(again.errors()).as(story).isEmpty();
			assertThat(again.plan()).isEqualTo(plan);
			assertThat(plan.scenes()).allSatisfy(scene -> {
				assertThat(scene.narration().length()).isLessThanOrEqualTo(PlanValidator.MAX_NARRATION);
				assertThat(scene.actions()).isNotEmpty();
			});
		}
	}

}
