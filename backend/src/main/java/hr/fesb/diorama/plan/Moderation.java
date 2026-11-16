package hr.fesb.diorama.plan;

import java.util.Locale;
import java.util.Set;

/**
 * Cheap keyword screen (HR + EN) that runs before any LLM call and is the only moderation when the offline
 * planner is used. It is deliberately small: Gemini's safety settings and its {@code safeForKids} verdict are
 * the real filter; this catches the obvious cases without spending quota.
 */
public final class Moderation {

	/** Matched against the start of a word (ASCII-folded, lower case). */
	private static final Set<String> PREFIXES = Set.of(
			// English
			"murder", "kill", "bloodb", "bloody", "porn", "sexual", "nude", "naked", "rape", "rapist",
			"cocaine", "heroin", "suicid", "terroris", "nazi", "genocid", "behead", "tortur", "molest", "pedoph",
			"shotgun", "pistol", "grenade", "massacre", "stabb", "strangl", "fuck", "shit", "bitch",
			// Croatian
			"ubij", "ubio", "ubila", "ubili", "ubit", "ubojic", "ubojstv", "krvav", "krvolo", "pornog", "pornic",
			"seks", "silova", "kokain", "samoubo", "nacist", "mucen", "pistolj", "pusk", "masakr",
			"zadavi", "jeb", "kurv", "sranj", "drog", "pedofil", "bombas");

	/** Short words that only count as a whole word. */
	private static final Set<String> WORDS = Set.of(
			"sex", "gun", "guns", "drugs", "bomb", "bombs", "bomba", "bombu", "bombe", "rifle",
			"stab", "kys", "meth", "porno", "hitler", "isis");

	private Moderation() {
	}

	public static boolean unsafe(String text) {
		if (text == null) {
			return false;
		}
		String folded = PlanValidator.ascii(text).toLowerCase(Locale.ROOT);
		for (String word : folded.split("[^a-z0-9]+")) {
			if (word.isEmpty()) {
				continue;
			}
			if (WORDS.contains(word)) {
				return true;
			}
			for (String prefix : PREFIXES) {
				if (word.startsWith(prefix)) {
					return true;
				}
			}
		}
		return false;
	}

}
