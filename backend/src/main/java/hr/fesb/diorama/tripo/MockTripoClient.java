package hr.fesb.diorama.tripo;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.plan.StoryPlan.Kind;
import hr.fesb.diorama.tripo.TripoException.Reason;

/**
 * Stand-in for Tripo ({@code TRIPO_MODE=mock}): same task flow as the real API, but "generation" is a fake
 * progressive delay and the result is a bundled CC0 sample GLB. It keeps a simulated wallet with the real
 * prices so the credit guard can be exercised without spending anything.
 *
 * <p>Prompt keywords for trying the failure paths: {@code mock-fail} (generation always fails),
 * {@code mock-flaky} (fails once, then works), {@code mock-norig} (rig check says "not riggable").
 */
public class MockTripoClient implements TripoClient {

	static final String URL_PREFIX = "mock://";
	private static final Set<String> SAMPLES = Set.of("biped", "quadruped", "creature", "object");

	private record MockTask(String id, String type, String sample, String prompt, long createdNanos, long durationNanos,
			boolean fails) {
	}

	private final DioramaProperties.Tripo props;
	private final Map<String, MockTask> tasks = new ConcurrentHashMap<>();
	private final Set<String> flakySeen = ConcurrentHashMap.newKeySet();
	private double balance;

	public MockTripoClient(DioramaProperties.Tripo props) {
		this.props = props;
		this.balance = props.mock().balance();
	}

	@Override
	public String source() {
		return "mock";
	}

	@Override
	public synchronized Balance balance() {
		return new Balance(balance, 0);
	}

	/** Test hook: set the simulated wallet. */
	public synchronized void setBalance(double credits) {
		this.balance = credits;
	}

	@Override
	public String textToModel(String prompt, Kind kindHint) {
		boolean fails = prompt.contains("mock-fail") || (prompt.contains("mock-flaky") && flakySeen.add(prompt));
		String sample = kindHint == null ? "creature" : kindHint.json();
		return create("text_to_model", sample, prompt, props.mock().generationTime().toNanos(), props.costs().textToModel(), fails);
	}

	@Override
	public String rigCheck(String modelTaskId) {
		MockTask model = require(modelTaskId);
		return create("animate_prerigcheck", model.sample(), model.prompt(), props.mock().animationTime().toNanos() / 5, 0, false);
	}

	@Override
	public String rig(String modelTaskId, String rigType, String rigModel) {
		MockTask model = require(modelTaskId);
		return create("animate_rig", model.sample(), model.prompt(), props.mock().animationTime().toNanos(), props.costs().rig(), false);
	}

	@Override
	public String retarget(String rigTaskId, List<String> presets) {
		MockTask rig = require(rigTaskId);
		return create("animate_retarget", rig.sample(), rig.prompt(), props.mock().animationTime().toNanos(),
				props.costs().retargetPerClip() * presets.size(), false);
	}

	@Override
	public TripoTask task(String taskId) {
		MockTask task = require(taskId);
		long elapsed = System.nanoTime() - task.createdNanos();
		boolean done = elapsed >= task.durationNanos();
		if (done && task.fails()) {
			return new TripoTask(task.id(), task.type(), TripoTask.Status.FAILED, 0, null, null, null, null,
					"simulated failure (mock)", 0.0);
		}
		if (!done) {
			int progress = (int) Math.min(99, elapsed * 100 / Math.max(1, task.durationNanos()));
			return new TripoTask(task.id(), task.type(), TripoTask.Status.PENDING, progress, null, null, null, null, null, null);
		}
		boolean riggable = (task.sample().equals("biped") || task.sample().equals("quadruped")) && !task.prompt().contains("mock-norig");
		boolean check = task.type().equals("animate_prerigcheck");
		return new TripoTask(task.id(), task.type(), TripoTask.Status.SUCCESS, 100,
				check ? null : URL_PREFIX + task.sample() + ".glb", null,
				check ? riggable : null, check && riggable ? task.sample() : null, null, null);
	}

	@Override
	public byte[] download(String url) {
		String name = url != null && url.startsWith(URL_PREFIX) && url.endsWith(".glb")
				? url.substring(URL_PREFIX.length(), url.length() - 4)
				: "";
		if (!SAMPLES.contains(name)) {
			throw new TripoException(Reason.BAD_OUTPUT, "unknown mock model");
		}
		try (InputStream in = MockTripoClient.class.getResourceAsStream("/mock-models/" + name + ".glb")) {
			if (in == null) {
				throw new TripoException(Reason.BAD_OUTPUT, "mock model " + name + ".glb is missing from the classpath");
			}
			return in.readAllBytes();
		}
		catch (IOException e) {
			throw new TripoException(Reason.TRANSPORT, "could not read mock model " + name + ".glb", e);
		}
	}

	private String create(String type, String sample, String prompt, long durationNanos, int cost, boolean fails) {
		if (!fails) {
			// like the real API: credits are taken when the task is created; a failed task costs nothing
			charge(cost);
		}
		String id = "mock-" + UUID.randomUUID();
		tasks.put(id, new MockTask(id, type, sample, prompt, System.nanoTime(), durationNanos, fails));
		return id;
	}

	private synchronized void charge(int cost) {
		if (cost > balance) {
			throw new TripoException(Reason.INSUFFICIENT_CREDITS, "mock wallet is empty (needs " + cost + " credits)");
		}
		balance -= cost;
	}

	private MockTask require(String taskId) {
		MockTask task = taskId == null ? null : tasks.get(taskId);
		if (task == null) {
			throw new TripoException(Reason.NOT_FOUND, "unknown mock task");
		}
		return task;
	}

}
