package hr.fesb.diorama.narration;

/** One scene's spoken narration: where the WAV is served and how long it plays. */
public record NarrationClip(String url, double durationSec) {
}
