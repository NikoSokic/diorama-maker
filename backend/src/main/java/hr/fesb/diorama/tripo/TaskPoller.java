package hr.fesb.diorama.tripo;

import java.time.Duration;
import java.util.function.IntConsumer;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;
import hr.fesb.diorama.tripo.TripoException.Reason;

/** Polls a task with a growing interval until it succeeds, fails or runs out of time. */
public final class TaskPoller {

	private TaskPoller() {
	}

	/**
	 * @param onProgress receives the task's own 0-100 progress whenever it changes
	 * @return the successful task
	 * @throws TripoException {@code TASK_FAILED} or {@code TIMEOUT}
	 */
	public static TripoTask await(TripoClient client, String taskId, DioramaProperties.Tripo props, IntConsumer onProgress) {
		long deadline = System.nanoTime() + props.taskTimeout().toNanos();
		Duration interval = props.pollInterval();
		int lastProgress = -1;
		while (true) {
			TripoTask task = client.task(taskId);
			switch (task.status()) {
				case SUCCESS -> {
					return task;
				}
				case FAILED -> throw new TripoException(Reason.TASK_FAILED,
						"Tripo task failed" + (task.errorMessage() == null ? "" : ": " + task.errorMessage()));
				case PENDING -> {
					if (task.progress() != lastProgress) {
						lastProgress = task.progress();
						onProgress.accept(Math.max(0, Math.min(100, lastProgress)));
					}
				}
			}
			if (System.nanoTime() >= deadline) {
				throw new TripoException(Reason.TIMEOUT, "Tripo task did not finish within " + props.taskTimeout().toSeconds() + " s");
			}
			if (!Http.sleep(interval)) {
				throw new TripoException(Reason.TIMEOUT, "interrupted while waiting for a Tripo task");
			}
			Duration next = interval.multipliedBy(5).dividedBy(4);
			interval = next.compareTo(props.maxPollInterval()) > 0 ? props.maxPollInterval() : next;
		}
	}

}
