package hr.fesb.diorama.tripo;

/** Snapshot of a Tripo task ({@code GET /tasks/{id}}). Output fields are only set on success. */
public record TripoTask(
		String taskId,
		String type,
		Status status,
		int progress,
		String modelUrl,
		String renderedImageUrl,
		Boolean riggable,
		String rigType,
		String errorMessage,
		Double creditsConsumed) {

	public enum Status {
		/** queued, running, or a status we do not know: keep polling, never assume success. */
		PENDING,
		SUCCESS,
		/** failed, cancelled, banned or expired: credits are returned. */
		FAILED
	}

	public static Status parseStatus(String raw) {
		return switch (raw == null ? "" : raw.trim().toLowerCase()) {
			case "success" -> Status.SUCCESS;
			case "failed", "cancelled", "banned", "expired" -> Status.FAILED;
			default -> Status.PENDING;
		};
	}

}
