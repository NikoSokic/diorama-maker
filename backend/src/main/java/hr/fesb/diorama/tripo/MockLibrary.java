package hr.fesb.diorama.tripo;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The mock-mode character library: low-poly CC0 models that already carry their animation clips, listed in
 * {@code mock-models/library/manifest.json} (built by {@code frontend/scripts/build-mock-library.mjs}).
 *
 * <p>{@link #match} picks the model that fits a character best: English keywords against the subject of the Tripo
 * prompt (English by schema) first, then English keywords and Croatian stems against the display name, which is in
 * the story language. Croatian stems never run against the English prompt, where they would hit words like "pastel".
 */
public final class MockLibrary {

	private static final Logger log = LoggerFactory.getLogger(MockLibrary.class);
	static final String ROOT = "/mock-models/library/";

	/** Words that end the head of a noun phrase: "girl <with> a red hat". */
	private static final Set<String> BOUNDARIES = Set.of("with", "in", "holding", "wearing", "carrying", "on", "riding",
			"inside", "under", "near", "next", "made", "that", "who", "from", "of");
	private static final Pattern TOY_SUBJECT = Pattern.compile("\\btoy\\s+([^,]+)");

	public record Entry(String id, String file, Kind kind, List<String> clips, List<String> en, List<String> hr) {
	}

	/** {@code compatible}: both or neither are objects; an animal should not stand in for a planned object. */
	private record Hit(boolean compatible, boolean beforeHead, int position, boolean kindMatches, int length) implements Comparable<Hit> {
		@Override
		public int compareTo(Hit o) {
			if (compatible != o.compatible) {
				return Boolean.compare(compatible, o.compatible);
			}
			if (beforeHead != o.beforeHead) {
				return Boolean.compare(beforeHead, o.beforeHead);
			}
			// the head noun of an English noun phrase is its last word: "light blue bird" is a bird
			if (beforeHead && position != o.position) {
				return Integer.compare(position, o.position);
			}
			if (kindMatches != o.kindMatches) {
				return Boolean.compare(kindMatches, o.kindMatches);
			}
			return Integer.compare(length, o.length);
		}
	}

	private final List<Entry> entries;
	private final String fingerprint;

	MockLibrary(List<Entry> entries, String fingerprint) {
		this.entries = List.copyOf(entries);
		this.fingerprint = fingerprint;
	}

	/** Reads the manifest from the classpath; an empty library (old kind-based samples only) when it is missing. */
	public static MockLibrary load() {
		try (InputStream in = MockLibrary.class.getResourceAsStream(ROOT + "manifest.json")) {
			if (in == null) {
				log.warn("mock model library is missing from the classpath; mock mode uses the four basic samples");
				return new MockLibrary(List.of(), "");
			}
			byte[] bytes = in.readAllBytes();
			JsonNode root = new ObjectMapper().readTree(bytes);
			List<Entry> entries = new ArrayList<>();
			for (JsonNode m : root.path("models")) {
				entries.add(new Entry(m.path("id").asText(), m.path("file").asText(), Kind.valueOf(m.path("kind").asText().toUpperCase(Locale.ROOT)),
						strings(m.path("clips")), strings(m.path("en")), strings(m.path("hr"))));
			}
			String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).substring(0, 12);
			return new MockLibrary(entries, hash);
		}
		catch (IOException | NoSuchAlgorithmException e) {
			throw new IllegalStateException("could not read the mock model library manifest", e);
		}
	}

	public List<Entry> entries() {
		return entries;
	}

	/** Changes whenever the manifest changes (models, keywords or clips). */
	public String fingerprint() {
		return fingerprint;
	}

	public Optional<Entry> byId(String id) {
		return entries.stream().filter(e -> e.id().equals(id)).findFirst();
	}

	/** The best-fitting model, or empty when no keyword matches (the caller falls back by kind). */
	public Optional<Entry> match(String prompt, Kind kind, String displayName) {
		Optional<Entry> byPrompt = best(words(subject(prompt == null ? "" : prompt)), kind, false);
		return byPrompt.isPresent() ? byPrompt : best(words(displayName == null ? "" : displayName), kind, true);
	}

	private static List<String> words(String text) {
		return Arrays.stream(fold(text).split(" "))
			.filter(w -> !w.isEmpty())
			.toList();
	}

	private Optional<Entry> best(List<String> words, Kind kind, boolean croatian) {
		int head = words.size();
		for (int i = 0; i < words.size(); i++) {
			if (BOUNDARIES.contains(words.get(i))) {
				head = i;
				break;
			}
		}
		Entry best = null;
		Hit bestHit = null;
		for (Entry entry : entries) {
			Hit hit = null;
			for (String keyword : entry.en()) {
				hit = better(hit, find(words, fold(keyword), false), head, entry.kind(), kind, keyword.length());
			}
			for (String stem : croatian ? entry.hr() : List.<String>of()) {
				hit = better(hit, find(words, fold(stem.replace("$", "")), !stem.endsWith("$")), head, entry.kind(), kind,
						stem.length());
			}
			if (hit != null && (bestHit == null || hit.compareTo(bestHit) > 0)) {
				best = entry;
				bestHit = hit;
			}
		}
		return Optional.ofNullable(best);
	}

	private static Hit better(Hit current, int position, int head, Kind entryKind, Kind planned, int length) {
		if (position < 0) {
			return current;
		}
		boolean compatible = planned == null || (planned == Kind.OBJECT) == (entryKind == Kind.OBJECT);
		Hit hit = new Hit(compatible, position < head, position, entryKind == planned, length);
		return current == null || hit.compareTo(current) > 0 ? hit : current;
	}

	/**
	 * Index of the (last) word where the keyword matches, -1 if it does not. Multi-word keywords match as a phrase
	 * and report their last word. {@code prefix}: Croatian stem, any word starting with it matches; otherwise the
	 * whole word, allowing an English plural.
	 */
	static int find(List<String> words, String keyword, boolean prefix) {
		String[] parts = keyword.split(" ");
		int found = -1;
		for (int i = 0; i + parts.length <= words.size(); i++) {
			boolean all = true;
			for (int p = 0; p < parts.length && all; p++) {
				String w = words.get(i + p);
				String k = parts[p];
				boolean last = p == parts.length - 1;
				all = prefix && last ? w.startsWith(k) : w.equals(k) || (last && !prefix && plural(w, k));
			}
			if (all) {
				found = i + parts.length - 1;
			}
		}
		return found;
	}

	private static boolean plural(String word, String keyword) {
		return word.equals(keyword + "s") || word.equals(keyword + "es")
				|| (keyword.endsWith("y") && word.equals(keyword.substring(0, keyword.length() - 1) + "ies"));
	}

	/** The {subject} of the Tripo prompt pattern, or the whole prompt when it does not follow the pattern. */
	static String subject(String prompt) {
		Matcher m = TOY_SUBJECT.matcher(prompt);
		return m.find() ? m.group(1) : prompt;
	}

	/** Lower case ASCII, Croatian letters folded (č, ć -> c, đ -> d, š -> s, ž -> z), everything else a space. */
	static String fold(String text) {
		String lower = text.toLowerCase(Locale.ROOT).replace('đ', 'd');
		String ascii = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
		return ascii.replaceAll("[^a-z0-9]+", " ").trim();
	}

	private static List<String> strings(JsonNode array) {
		List<String> out = new ArrayList<>();
		array.forEach(n -> out.add(n.asText()));
		return out;
	}

}
