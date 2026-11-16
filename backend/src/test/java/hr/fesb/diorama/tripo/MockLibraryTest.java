package hr.fesb.diorama.tripo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.GlbInspector;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MockLibraryTest {

	private static final MockLibrary LIBRARY = MockLibrary.load();

	private static String toy(String subject) {
		return "cute stylized low-poly toy " + subject
				+ ", full body, standing neutral pose, arms slightly away from body, single object, no base, no background, soft pastel colors";
	}

	private static String match(String subject, String kind, String name) {
		return LIBRARY.match(toy(subject), kind.isEmpty() ? null : Kind.valueOf(kind.toUpperCase(java.util.Locale.ROOT)), name).map(MockLibrary.Entry::id).orElse("-");
	}

	@ParameterizedTest(name = "{0} ({1}, \"{2}\") -> {3}")
	@CsvSource(nullValues = "null", value = {
			// English subjects from the Gemini prompt pattern
			"orange fox with fluffy tail, quadruped, Fox, fox",
			"little girl with pigtails, biped, Girl, girl",
			"friendly green dragon with small wings, biped, Dragon, dragon",
			"brown puppy dog, quadruped, Dog, dog",
			"orange kitten cat, quadruped, Cat, cat",
			"white rabbit with long ears, quadruped, Rabbit, bunny",
			"brown teddy bear, biped, Bear, bear",
			"grey wolf, quadruped, Wolf, wolf",
			"white unicorn with rainbow mane, quadruped, Unicorn, unicorn",
			"brown pony horse, quadruped, Horse, horse",
			"princess in a pink dress with a crown, biped, Princess, girl",
			"king with a golden crown and red cape, biped, King, king",
			"wizard with a starry blue hat, biped, Wizard, wizard",
			"friendly witch with a purple hat, biped, Witch, wizard",
			"pirate with an eye patch and hat, biped, Pirate, pirate",
			"astronaut in a white space suit, biped, Astronaut, astronaut",
			"knight in shiny armor, biped, Knight, adventurer",
			"grandmother with glasses and a scarf, biped, Grandma, woman",
			"grandfather with a hat and moustache, biped, Grandpa, farmer",
			"little boy with a cap, biped, Boy, boy",
			"small blue bird, creature, Bird, bird",
			"light blue bird, creature, Bird, bird",
			"wise brown owl, creature, Owl, bird",
			"orange fish with big eyes, creature, Fish, fish",
			"green frog, creature, Frog, frog",
			"friendly green dinosaur, biped, Dino, dino",
			"striped bee, creature, Bee, bee",
			"smiling yellow star, object, Star, star",
			"small wooden sailboat, object, Boat, boat",
			"red toy car, object, Car, car",
			"golden treasure chest, object, Chest, chest",
			"big grey shark, creature, Shark, shark",
			"spotted cow, quadruped, Cow, cow",
			"fluffy white sheep, quadruped, Sheep, sheep",
			"pink piglet, quadruped, Pig, pig",
			"spooky little ghost, creature, Ghost, ghost",
			// no keyword in the prompt: the Croatian display name decides
			"friendly round creature, creature, Lisica Mira, fox",
			"friendly round creature, biped, Djevojčica, girl",
			"friendly round creature, creature, Zmaj, dragon",
			"friendly round creature, quadruped, Medo, bear",
			"friendly round creature, creature, Morski pas, shark",
			"friendly round creature, quadruped, Psić Rex, dog",
			// Croatian stems never run against the English prompt ("pas" in "pastel", "lav" in "lavender")
			"pastel lavender blob, creature, Mrlja, slime",
			// nothing fits: the caller falls back to the kind's basic sample
			"friendly round robot, biped, Robo, -",
			"friendly round creature, creature, Mira, -",
	})
	void picksTheClosestModel(String subject, String kind, String name, String expected) {
		assertThat(match(subject, kind, name)).isEqualTo(expected);
	}

	@Test
	void aPlannedObjectPrefersAnObjectModel() {
		// "crown" is an object, "king" a character: for a planned object the crown wins although it is not the head noun
		assertThat(match("crown fit for a king", "object", "Crown")).isEqualTo("crown");
		assertThat(match("crown fit for a king", "biped", "King")).isEqualTo("king");
	}

	@Test
	void everyModelLoadsAndCarriesTheClipsItsManifestPromises() {
		MockTripoClient client = new MockTripoClient(TestProps.of().tripo(), LIBRARY);
		assertThat(LIBRARY.entries()).hasSizeGreaterThanOrEqualTo(30);
		for (MockLibrary.Entry entry : LIBRARY.entries()) {
			byte[] glb = client.download(MockTripoClient.URL_PREFIX + MockTripoClient.LIBRARY + entry.id() + ".glb");
			assertThat(GlbInspector.isGlb(glb)).as(entry.id()).isTrue();
			assertThat(GlbInspector.animationNames(glb)).as(entry.id()).containsExactlyInAnyOrderElementsOf(entry.clips());
		}
	}

	@Test
	void theMockServesALibraryModelThatNeedsNoRig() {
		DioramaProperties.Tripo props = TestProps.of("tripo.mock.balance", "200").tripo();
		MockTripoClient client = new MockTripoClient(props, LIBRARY);
		TripoTask task = TaskPoller.await(client, client.textToModel(toy("orange fox"), Kind.QUADRUPED, "Lisica"), props, p -> { });

		assertThat(task.modelUrl()).isEqualTo("mock://library/fox.glb");
		assertThat(client.preAnimated(task.modelUrl())).isTrue();
		assertThat(GlbInspector.animationNames(client.download(task.modelUrl()))).contains("idle", "walk");
		assertThat(client.preAnimated("mock://biped.glb")).isFalse();
	}

	@Test
	void theCacheSaltFollowsTheMatch() {
		MockTripoClient client = new MockTripoClient(TestProps.of().tripo(), LIBRARY);
		String fox = client.cacheSalt(toy("orange fox"), Kind.QUADRUPED, "Fox");
		assertThat(fox).endsWith("library/fox").contains(LIBRARY.fingerprint());
		assertThat(client.cacheSalt(toy("round thing"), Kind.QUADRUPED, "Mira")).endsWith("-quadruped");
		assertThat(client.cacheSalt(toy("round thing"), Kind.QUADRUPED, "Lisica")).isNotEqualTo(client.cacheSalt(toy("round thing"), Kind.QUADRUPED, "Mira"));
		assertThat(List.of(fox)).doesNotContainNull();
	}

}
