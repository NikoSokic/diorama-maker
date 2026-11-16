package hr.fesb.diorama.plan;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Plans a story without any LLM: keyword spotting for characters and settings plus a scripted staging.
 * Used when {@code GEMINI_MODE=mock} (development, tests) and as the stand-in when Gemini is unreachable,
 * so a story always plays. Its draft goes through {@link PlanValidator} like an LLM answer would.
 *
 * <p>Keyword patterns are ASCII-folded lower-case word starts; a trailing {@code $} means "whole word only"
 * (needed for short words such as {@code sea$}, which would otherwise match "season").
 */
public class OfflineStoryPlanner implements StoryPlanner {

	private static final JsonNodeFactory F = JsonNodeFactory.instance;
	private static final double[][] SPOTS = { { -2, 0.5 }, { 2, 0.5 }, { 0, -1.5 } };

	/** A character the planner can recognise. */
	private record Known(String key, String hr, String en, String kind, double size, String subject, List<String> patterns) {
	}

	private static Known known(String key, String hr, String en, String kind, double size, String subject, String patterns) {
		return new Known(key, hr, en, kind, size, subject, List.of(patterns.split(",")));
	}

	private static final List<Known> KNOWN = List.of(
			known("rabbit", "Zec", "Rabbit", "quadruped", 0.7, "white rabbit with long ears", "zec,zeko,zeka$,rabbit,bunn,hare$"),
			known("fox", "Lisica", "Fox", "quadruped", 0.9, "orange fox with fluffy tail", "lisic,lisac,fox$,foxes$"),
			known("bear", "Medvjed", "Bear", "biped", 1.6, "brown teddy bear", "medvjed,medo$,bear$,bears$"),
			known("wolf", "Vuk", "Wolf", "quadruped", 1.2, "grey wolf", "vuk,wolf,wolv"),
			known("dog", "Pas", "Dog", "quadruped", 0.9, "brown puppy dog", "psic,pesek,pas$,psa$,psu$,psi$,psom$,dog$,dogs$,doggy$,puppy$,puppies$"),
			known("cat", "Mačka", "Cat", "quadruped", 0.7, "orange kitten cat", "mack,macak,macic,kitten,kitty$,cat$,cats$,maca$,mace$,macu$"),
			known("mouse", "Miš", "Mouse", "quadruped", 0.35, "tiny grey mouse", "misic,mouse,mis$,misa$,misu$,mice$"),
			known("dragon", "Zmaj", "Dragon", "biped", 2.4, "friendly green dragon with small wings", "zmaj,dragon"),
			known("princess", "Princeza", "Princess", "biped", 1.0, "princess in a pink dress with a crown", "princez,princess,kraljevn"),
			known("prince", "Princ", "Prince", "biped", 1.0, "prince with a small crown", "kraljevic,princ$,princa$,princu$,prince$"),
			known("knight", "Vitez", "Knight", "biped", 1.1, "knight in shiny armor", "vitez,knight"),
			known("king", "Kralj", "King", "biped", 1.1, "king with a golden crown and red cape", "kralj$,kralja$,kralju$,kraljem$,king$,kings$"),
			known("queen", "Kraljica", "Queen", "biped", 1.1, "queen with a golden crown", "kraljic,queen"),
			known("robot", "Robot", "Robot", "biped", 1.1, "friendly round robot", "robot"),
			known("girl", "Djevojčica", "Girl", "biped", 1.0, "little girl with pigtails", "djevojcic,curic,girl$,girls$"),
			known("boy", "Dječak", "Boy", "biped", 1.0, "little boy with a cap", "djecak,djecac,boy$,boys$"),
			known("grandma", "Baka", "Grandma", "biped", 1.1, "grandmother with glasses and a scarf", "grandm,granny,baka$,bake$,baki$,baku$"),
			known("grandpa", "Djed", "Grandpa", "biped", 1.1, "grandfather with a hat and moustache", "grandp,grandf,djed$,djeda$,djedu$,dida$"),
			known("wizard", "Čarobnjak", "Wizard", "biped", 1.2, "wizard with a starry blue hat", "carobnja,wizard"),
			known("fairy", "Vila", "Fairy", "biped", 0.6, "tiny fairy with sparkly wings", "fairy,fairies,vila$,vile$,vili$,vilu$"),
			known("witch", "Vještica", "Witch", "biped", 1.1, "friendly witch with a purple hat", "vjestic,witch"),
			known("pirate", "Gusar", "Pirate", "biped", 1.1, "pirate with an eye patch and hat", "gusar,pirat"),
			known("astronaut", "Astronaut", "Astronaut", "biped", 1.0, "astronaut in a white space suit", "astronaut"),
			known("snowman", "Snjegović", "Snowman", "biped", 1.2, "snowman with a carrot nose and scarf", "snjegovi,snowm"),
			known("bird", "Ptica", "Bird", "creature", 0.4, "small blue bird", "ptic,bird"),
			known("owl", "Sova", "Owl", "creature", 0.6, "wise brown owl", "owl,sova$,sove$,sovi$,sovu$"),
			known("fish", "Riba", "Fish", "creature", 0.5, "orange fish with big eyes", "ribic,fish,riba$,ribe$,ribi$,ribu$"),
			known("frog", "Žaba", "Frog", "creature", 0.4, "green frog", "zabic,frog,zaba$,zabe$,zabi$,zabu$"),
			known("turtle", "Kornjača", "Turtle", "quadruped", 0.6, "green turtle", "kornjac,turtle,tortoise"),
			known("horse", "Konj", "Horse", "quadruped", 1.8, "brown pony horse", "konj,horse,pony$,ponies$"),
			known("unicorn", "Jednorog", "Unicorn", "quadruped", 1.6, "white unicorn with rainbow mane", "jednorog,unicorn"),
			known("dinosaur", "Dinosaur", "Dinosaur", "biped", 2.2, "friendly green dinosaur", "dinosaur,dino$"),
			known("lion", "Lav", "Lion", "quadruped", 1.4, "lion with a fluffy mane", "lion,lav$,lava$,lavu$,lavic"),
			known("elephant", "Slon", "Elephant", "quadruped", 2.2, "grey elephant", "slon,elephant"),
			known("squirrel", "Vjeverica", "Squirrel", "quadruped", 0.4, "red squirrel with bushy tail", "vjeveric,squirrel"),
			known("hedgehog", "Jež", "Hedgehog", "quadruped", 0.4, "hedgehog", "hedgehog,jez$,jeza$,jezu$,jezic"),
			known("penguin", "Pingvin", "Penguin", "biped", 0.7, "penguin", "pingvin,penguin"),
			known("duck", "Patka", "Duck", "creature", 0.5, "yellow duck", "patk,pacic,duck"),
			known("bee", "Pčela", "Bee", "creature", 0.3, "striped bee", "pcel,bee$,bees$"),
			known("butterfly", "Leptir", "Butterfly", "creature", 0.3, "colorful butterfly", "leptir,butterfl"),
			known("snail", "Puž", "Snail", "creature", 0.3, "snail with a spiral shell", "snail,puz$,puza$,puzu$,puzic"),
			known("star", "Zvijezda", "Star", "object", 0.6, "smiling yellow star", "zvjezdic,zvijezda$,zvijezdu$,zvijezdi$,star$"),
			known("ball", "Lopta", "Ball", "object", 0.5, "striped beach ball", "lopt,ball$"),
			known("rocket", "Raketa", "Rocket", "object", 1.4, "red and white rocket", "raket,rocket"),
			known("boat", "Brod", "Boat", "object", 1.6, "small wooden sailboat", "brod,camac,boat,ship$,ships$"));

	/** Settings in priority order: the first table row with a match wins. */
	private static final Map<String, List<String>> ENVIRONMENTS = ordered(
			"underwater", "podmor,underwater,koralj,coral",
			"space", "svemir,planet,space$,spacesh,galax,raket,rocket,astronaut",
			"snowy_mountain", "snijeg,snjez,snow,planin,mountain,led$,leda$,ice$,icy$",
			"castle", "dvorac,dvorc,castle,kula$,kule$,kuli$,kulu$,tower,palace",
			"cave", "spilj,pecin,cave$,caves$",
			"desert", "pustinj,desert$,deserts$,kaktus,cactus",
			"beach", "plaz,beach,obal,shore,pijes,sand$,sandy$",
			"sea", "moru$,morem$,morsk,sea$,seas$,ocean,brod,boat,ship$,ships$,valov,jedri,sail",
			"forest", "suma$,sume$,sumi$,sumu$,sumom$,sumic,sumsk,forest,woods$,drvec,stabl,tree$,trees$",
			"village", "selo$,sela$,selu$,village,kuca$,kuce$,kuci$,kucu$,kucic,house,farm",
			"city_park", "park,igralist,playground",
			"meadow", "livad,meadow,polje$,polja$,polju$,field,cvijet,cvjet,flower,trava$,trave$,travi$,travu$,grass");
	private static final Map<String, List<String>> TIMES = ordered(
			"night", "noc,night,ponoc,midnight,mjesec,moon,zvijezd,stars$,starry$",
			"sunset", "zalaz,sunset,vecer,evening,sumrak,dusk",
			"morning", "jutr,morning,zora$,zoru$,zore$,dawn,svanu",
			"day", "dan$,dana$,day$,days$,podne,noon,sunc,sun$,sunny$");
	private static final Map<String, List<String>> WEATHERS = ordered(
			"rain", "kisa$,kise$,kisi$,kisu$,kisn,kisob,rain$,rains$,rainy$,raining$,rained$,oluj,storm",
			"snow", "snijeg,snjez,snow,pahulj",
			"fog", "magl,fog$,foggy$,mist$,misty$",
			"fireflies", "krijesnic,firefl",
			"stars", "zvijezd,stars$,starry$");
	private static final Map<String, List<String>> MOODS = ordered(
			"funny", "smij,funny,laugh,sala$,sale$,salu$,saljiv,joke,silly,sasav",
			"magical", "carob,magic,vila$,vile$,fairy,cudes,wonder,zvjezd",
			"mysterious", "tajn,myster,secret,sjen,shadow,cudn,strange",
			"adventurous", "avantur,pustolov,adventur,blago$,blaga$,blagom$,treasure,putovan,journey,istraz,explor");
	private static final Map<String, List<String>> VERBS = ordered(
			"jump", "skoc,skak,jump,hop$,hops$,hopped$,hopping$",
			"run_to", "trc,potrc,juri,ran$,run$,runs$,running$,rush,bjez,pobjeg",
			"dance", "ples,zaples,danc",
			"wave", "mahn,mahat,pozdrav,wave$,waves$,waved$,waving$,greet",
			"hide", "sakri,skriv,hid$,hide$,hides$,hiding$,hidden$",
			"spin", "vrti,zavrt,okre,spin,twirl",
			"celebrate", "slavi,proslav,veseli,celebrat,cheer,pobjed,won$,win$,wins$");

	private final PlanValidator validator;

	public OfflineStoryPlanner(PlanValidator validator) {
		this.validator = validator;
	}

	@Override
	public Outcome plan(String storyText, String lang) {
		if (Moderation.unsafe(storyText)) {
			return Outcome.reject();
		}
		return Outcome.ok(draft(storyText, lang));
	}

	/** Builds the plan without the moderation check (callers that already moderated use this). */
	public StoryPlan draft(String storyText, String lang) {
		boolean english = "en".equalsIgnoreCase(lang);
		String text = storyText == null ? "" : storyText.trim();
		String folded = fold(text);
		List<Known> cast = cast(folded);

		ObjectNode root = F.objectNode();
		root.put("language", english ? "en" : "hr");
		root.put("mood", firstMatch(MOODS, folded, "cozy"));
		ArrayNode characters = root.putArray("characters");
		if (cast.isEmpty()) {
			characters.addObject().put("key", "friend").put("displayName", english ? "Friend" : "Prijatelj")
				.put("kind", "creature").put("relativeSize", 1.0).put("tripoPrompt", PlanValidator.DEFAULT_SUBJECT);
		}
		for (Known known : cast) {
			characters.addObject().put("key", known.key()).put("displayName", english ? known.en() : known.hr())
				.put("kind", known.kind()).put("relativeSize", known.size()).put("tripoPrompt", known.subject());
		}
		List<String> keys = new ArrayList<>();
		characters.forEach(node -> keys.add(node.get("key").asText()));

		int sentences = text.isEmpty() ? 1 : text.split("(?<=[.!?…])\\s+").length;
		int sceneCount = Math.max(PlanValidator.MIN_SCENES, Math.min(PlanValidator.MAX_SCENES, sentences));
		List<String> chunks = PlanValidator.storyChunks(text, sceneCount);

		// the stage starts in the first place the story mentions; time and weather change when the text says so
		String environment = "meadow";
		for (int i = sceneCount - 1; i >= 0; i--) {
			environment = firstMatch(ENVIRONMENTS, fold(chunks.get(i)), environment);
		}
		String timeOfDay = "day";
		String weather = "clear";
		ArrayNode scenes = root.putArray("scenes");
		String[] cameras = { "follow", "closeup", "dolly_in", "over_shoulder" };
		for (int i = 0; i < sceneCount; i++) {
			String chunk = fold(chunks.get(i));
			environment = firstMatch(ENVIRONMENTS, chunk, environment);
			timeOfDay = firstMatch(TIMES, chunk, timeOfDay);
			weather = firstMatch(WEATHERS, chunk, weather);
			boolean first = i == 0;
			boolean last = i == sceneCount - 1;
			String lead = leadIn(chunk, cast, keys, i);

			ObjectNode scene = scenes.addObject();
			scene.put("environment", environment).put("timeOfDay", timeOfDay).put("weather", skyFor(timeOfDay, weather));
			scene.put("narration", chunks.get(i));
			ObjectNode camera = scene.putObject("camera");
			camera.put("type", first ? "wide" : last ? "orbit" : cameras[(i - 1) % cameras.length]);
			camera.put("targetKey", lead);
			ArrayNode actions = scene.putArray("actions");
			if (first) {
				enter(actions, keys);
			}
			else if (last) {
				finale(actions, keys);
			}
			else {
				middle(actions, keys, lead, firstMatch(VERBS, chunk, null), i);
			}
		}
		return validator.validate(root, text, lang, "offline").plan();
	}

	/** Stars and fireflies only make sense in the dark; a clear night gets stars. */
	private static String skyFor(String timeOfDay, String weather) {
		boolean dark = timeOfDay.equals("night") || timeOfDay.equals("sunset");
		if (!dark && (weather.equals("stars") || weather.equals("fireflies"))) {
			return "clear";
		}
		return timeOfDay.equals("night") && weather.equals("clear") ? "stars" : weather;
	}

	private static void enter(ArrayNode actions, List<String> keys) {
		for (int c = 0; c < keys.size(); c++) {
			double[] spot = spot(c, 0);
			action(actions, keys.get(c), "enter", c * 0.8, 2.4, "happy").put("toX", spot[0]).put("toZ", spot[1]);
		}
		action(actions, keys.get(0), "wave", keys.size() * 0.8 + 1.8, 1.5, "happy");
	}

	private static void middle(ArrayNode actions, List<String> keys, String lead, String verb, int sceneIndex) {
		int leadIndex = Math.max(0, keys.indexOf(lead));
		double[] spot = spot(leadIndex, sceneIndex);
		String type = verb != null ? verb : sceneIndex % 2 == 1 ? "walk_to" : "jump";
		boolean moves = type.equals("run_to") || type.equals("walk_to");
		ObjectNode main = action(actions, lead, type, 0.3, moves ? 2.2 : 1.4, verb == null ? "neutral" : "excited");
		if (moves) {
			main.put("toX", spot[0]).put("toZ", spot[1]);
		}
		if (type.equals("hide")) {
			action(actions, lead, "appear", 2.6, 0.6, "happy");
		}
		double at = 1.2;
		for (String key : keys) {
			if (!key.equals(lead)) {
				action(actions, key, "look_at", at, 0.8, "surprised").put("targetKey", lead);
				action(actions, key, sceneIndex % 2 == 1 ? "jump" : "spin", at + 1.2, 1.0, "happy");
				at += 0.6;
			}
		}
		if (keys.size() == 1) {
			action(actions, lead, sceneIndex % 2 == 1 ? "spin" : "wave", 3.4, 1.2, "happy");
		}
	}

	private static void finale(ArrayNode actions, List<String> keys) {
		for (int c = 0; c < keys.size(); c++) {
			action(actions, keys.get(c), "walk_to", c * 0.4, 1.6, "happy").put("toX", SPOTS[c % SPOTS.length][0] * 0.6).put("toZ", 1.0);
			action(actions, keys.get(c), c % 2 == 0 ? "celebrate" : "dance", 2.2 + c * 0.3, 2.5, "excited");
		}
	}

	private static ObjectNode action(ArrayNode actions, String key, String type, double startAt, double duration, String emotion) {
		return actions.addObject().put("characterKey", key).put("type", type).put("startAt", startAt)
			.put("duration", duration).put("emotion", emotion);
	}

	private static double[] spot(int characterIndex, int sceneIndex) {
		double[] base = SPOTS[characterIndex % SPOTS.length];
		double shift = sceneIndex % 2 == 0 ? 0 : (characterIndex % 2 == 0 ? 1.2 : -1.2);
		return new double[] { base[0] + shift, base[1] + (sceneIndex % 3 == 2 ? 1.0 : 0) };
	}

	/** The character a scene is about: the first one its text mentions, otherwise they take turns. */
	private static String leadIn(String chunk, List<Known> cast, List<String> keys, int sceneIndex) {
		int best = Integer.MAX_VALUE;
		String lead = null;
		for (Known known : cast) {
			int at = firstMention(chunk, known.patterns());
			if (at >= 0 && at < best) {
				best = at;
				lead = known.key();
			}
		}
		return lead != null ? lead : keys.get(sceneIndex % keys.size());
	}

	/** Recognised characters in order of first appearance, at most three. */
	private static List<Known> cast(String folded) {
		Map<Integer, Known> byPosition = new TreeMap<>();
		for (Known known : KNOWN) {
			int at = firstMention(folded, known.patterns());
			if (at >= 0) {
				byPosition.putIfAbsent(at, known);
			}
		}
		return byPosition.values().stream().limit(PlanValidator.MAX_CHARACTERS).toList();
	}

	/** Character offset of the first word matching any pattern, or -1. */
	private static int firstMention(String folded, List<String> patterns) {
		int position = 0;
		for (String word : folded.split(" ")) {
			if (matches(word, patterns)) {
				return position;
			}
			position += word.length() + 1;
		}
		return -1;
	}

	private static String firstMatch(Map<String, List<String>> table, String folded, String fallback) {
		for (Map.Entry<String, List<String>> entry : table.entrySet()) {
			if (firstMention(folded, entry.getValue()) >= 0) {
				return entry.getKey();
			}
		}
		return fallback;
	}

	private static boolean matches(String word, List<String> patterns) {
		if (word.isEmpty()) {
			return false;
		}
		for (String pattern : patterns) {
			boolean whole = pattern.endsWith("$");
			if (whole ? word.length() == pattern.length() - 1 && pattern.startsWith(word) : word.startsWith(pattern)) {
				return true;
			}
		}
		return false;
	}

	/** Lower-case ASCII words separated by single spaces. */
	private static String fold(String text) {
		return PlanValidator.ascii(text == null ? "" : text).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
	}

	private static Map<String, List<String>> ordered(String... keysAndCsv) {
		Map<String, List<String>> map = new LinkedHashMap<>();
		for (int i = 0; i < keysAndCsv.length; i += 2) {
			map.put(keysAndCsv[i], List.of(keysAndCsv[i + 1].split(",")));
		}
		return map;
	}

}
