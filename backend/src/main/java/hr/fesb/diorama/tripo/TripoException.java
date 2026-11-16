package hr.fesb.diorama.tripo;

/** A Tripo call or task that did not work out. Messages never contain the API key. */
public class TripoException extends RuntimeException {

	public enum Reason {
		CONTENT_POLICY, INSUFFICIENT_CREDITS, AUTH, RATE_LIMITED, NOT_FOUND, BAD_REQUEST, SERVER, TRANSPORT,
		/** The task itself ended as failed/cancelled; Tripo returns the credits. */
		TASK_FAILED,
		/** The task did not finish within our time limit; it may still complete and be charged. */
		TIMEOUT,
		/** The task succeeded but its output was unusable (missing URL, not a GLB). */
		BAD_OUTPUT
	}

	private final Reason reason;

	public TripoException(Reason reason, String message) {
		super(message);
		this.reason = reason;
	}

	public TripoException(Reason reason, String message, Throwable cause) {
		super(message, cause);
		this.reason = reason;
	}

	public Reason reason() {
		return reason;
	}

	/**
	 * Only a failed task is safe to submit again: its credits came back. After a timeout or a lost response the
	 * first task may still be charged, so resubmitting could pay twice (API_NOTES §1.9).
	 */
	public boolean retryable() {
		return reason == Reason.TASK_FAILED;
	}

	/** Map an API envelope ({@code code}) and HTTP status to a reason (API_NOTES §1.9). */
	public static Reason reasonFor(int httpStatus, int code) {
		return switch (code) {
			case 2008 -> Reason.CONTENT_POLICY;
			case 2010 -> Reason.INSUFFICIENT_CREDITS;
			case 1007, 2000 -> Reason.RATE_LIMITED;
			case 2, 1002 -> Reason.AUTH;
			case 2001 -> Reason.NOT_FOUND;
			case 1000, 1001 -> Reason.SERVER;
			default -> httpStatus == 429 ? Reason.RATE_LIMITED
					: httpStatus == 401 || httpStatus == 403 ? Reason.AUTH
					: httpStatus == 404 ? Reason.NOT_FOUND
					: httpStatus >= 500 ? Reason.SERVER
					: Reason.BAD_REQUEST;
		};
	}

}
