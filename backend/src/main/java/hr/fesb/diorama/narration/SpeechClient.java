package hr.fesb.diorama.narration;

/** Turns one scene's narration into speech (a WAV file). */
public interface SpeechClient {

	String model();

	String voice();

	/**
	 * @param lang story language, {@code hr} or {@code en}
	 * @throws SpeechException when no audio could be made
	 */
	byte[] speak(String text, String lang);

	/** {@code quota}: the free tier is used up for now, so asking again soon is pointless. */
	class SpeechException extends RuntimeException {

		private final boolean quota;

		public SpeechException(boolean quota, String message) {
			super(message);
			this.quota = quota;
		}

		public boolean quota() {
			return quota;
		}
	}

}
