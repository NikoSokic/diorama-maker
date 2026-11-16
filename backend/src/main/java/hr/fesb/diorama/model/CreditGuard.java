package hr.fesb.diorama.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.tripo.TripoClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Keeps generation inside the Tripo balance. Before a story's models are made it reserves the estimated cost
 * and decides, per model, what can be afforded: the full set of animation clips, fewer clips, no rigging,
 * or no generation at all (the character then becomes a placeholder).
 *
 * <p>Reservations are held in memory until the story finishes, so concurrent stories cannot both count on the
 * same credits. This is deliberately conservative: once Tripo has charged a task, those credits are briefly
 * counted twice (in the lower balance and in the reservation).
 */
@Component
public class CreditGuard {

	private static final Logger log = LoggerFactory.getLogger(CreditGuard.class);

	/** One model that is not in the cache yet. */
	public record Need(String promptHash, Kind kind) {
	}

	/** What a model may spend. {@code maxClips == 0} means "do not rig". */
	public record Grant(boolean generate, int maxClips) {

		public static final Grant NOTHING = new Grant(false, 0);
	}

	public record Reservation(Map<String, Grant> grants, int credits) {

		public Grant grantFor(String promptHash) {
			return grants.getOrDefault(promptHash, Grant.NOTHING);
		}
	}

	/** @param known false when the balance could not be read (Tripo unreachable) and no earlier value exists */
	public record Status(boolean known, double balance, double frozen, int reserved, double available) {
	}

	private final TripoClient tripo;
	private final DioramaProperties.Tripo props;
	private final Object refreshLock = new Object();
	private final AtomicBoolean refreshing = new AtomicBoolean();
	private volatile TripoClient.Balance cached;
	private volatile long cachedAtNanos;
	private volatile boolean stale = true;
	/** Guarded by {@code this}. */
	private int reserved;

	public CreditGuard(TripoClient tripo, DioramaProperties props) {
		this.tripo = tripo;
		this.props = props.tripo();
	}

	/** Reads the balance (network call when the cached value is old). */
	public Status status() {
		TripoClient.Balance balance = balance();
		synchronized (this) {
			if (balance == null) {
				return new Status(false, 0, 0, reserved, 0);
			}
			return new Status(true, balance.balance(), balance.frozen(), reserved, Math.max(0, balance.balance() - reserved));
		}
	}

	/**
	 * Fast check for the request thread: decides from the last known balance and refreshes it in the background.
	 * New stories are refused only when we know the credits are gone; with an unknown balance the story is
	 * accepted, because it can still play from cached models and placeholders.
	 */
	public boolean canStartStory() {
		TripoClient.Balance known = cached;
		if (!fresh()) {
			refreshInBackground();
		}
		synchronized (this) {
			return known == null || known.balance() - reserved >= props.costs().textToModel();
		}
	}

	public void refreshInBackground() {
		if (refreshing.compareAndSet(false, true)) {
			CompletableFuture.runAsync(() -> {
				try {
					balance();
				}
				finally {
					refreshing.set(false);
				}
			});
		}
	}

	public Reservation reserve(List<Need> needs) {
		TripoClient.Balance balance = needs.isEmpty() ? cached : balance();
		synchronized (this) {
			double budget = balance == null ? 0 : Math.max(0, balance.balance() - reserved);
			DioramaProperties.Costs costs = props.costs();
			Map<String, Grant> grants = new LinkedHashMap<>();
			int total = 0;

			// 1. a base model for as many characters as possible
			for (Need need : needs) {
				boolean affordable = budget - total >= costs.textToModel();
				grants.put(need.promptHash(), new Grant(affordable, 0));
				if (affordable) {
					total += costs.textToModel();
				}
			}
			// 2. rigging with as many clips as the rest of the budget allows
			if (props.enableRigging()) {
				for (Need need : needs) {
					if (!grants.get(need.promptHash()).generate()) {
						continue;
					}
					for (int clips = RigPlan.maxClips(need.kind(), props); clips >= 1; clips--) {
						int cost = costs.rig() + clips * costs.retargetPerClip();
						if (budget - total >= cost) {
							grants.put(need.promptHash(), new Grant(true, clips));
							total += cost;
							break;
						}
					}
				}
			}
			reserved += total;
			if (!needs.isEmpty()) {
				log.info("credit plan: {} new model(s), {} credits reserved of {} available", needs.size(), total, (int) budget);
			}
			return new Reservation(Map.copyOf(grants), total);
		}
	}

	public void release(Reservation reservation) {
		synchronized (this) {
			reserved = Math.max(0, reserved - reservation.credits());
		}
		if (reservation.credits() > 0) {
			// the story has spent credits: read the balance again next time
			stale = true;
		}
	}

	private boolean fresh() {
		return !stale && cached != null && System.nanoTime() - cachedAtNanos < props.balanceCacheTtl().toNanos();
	}

	/** Blocking read with a short-lived cache; keeps the last known value when Tripo cannot be reached. */
	private TripoClient.Balance balance() {
		if (fresh()) {
			return cached;
		}
		synchronized (refreshLock) {
			if (!fresh()) {
				try {
					cached = tripo.balance();
					cachedAtNanos = System.nanoTime();
					stale = false;
				}
				catch (RuntimeException e) {
					log.warn("could not read the Tripo balance: {}", e.getMessage());
				}
			}
			return cached;
		}
	}

}
