package hr.fesb.diorama.story;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import javax.imageio.ImageIO;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.story.ApiError.ApiException;
import hr.fesb.diorama.story.StoryRepository.StoryRow;
import hr.fesb.diorama.story.StoryRepository.StoryStatus;
import org.junit.jupiter.api.Test;

class ThumbnailServiceTest {

	private static final String TOKEN = "secret-upload-token";

	private final StoryRepository stories = mock(StoryRepository.class);
	private final Map<String, byte[]> stored = new HashMap<>();
	private final ModelStorage storage = new ModelStorage() {
		@Override
		public String put(String path, byte[] bytes, String contentType) {
			stored.put(path, bytes);
			return "/api/files/" + path;
		}

		@Override
		public boolean serves(String url) {
			return true;
		}
	};
	private boolean moderatorSaysYes = true;
	private final ThumbnailService service = new ThumbnailService(stories, storage, jpeg -> moderatorSaysYes, true);

	private StoryRow story(StoryStatus status, Instant created, String thumbnail, String tokenHash) {
		return new StoryRow(UUID.randomUUID(), "abc123xyz", "text", "en", "{}", status, null, null, true, created, null,
				thumbnail, tokenHash);
	}

	private void given(StoryRow row) {
		when(stories.findBySlug("abc123xyz")).thenReturn(Optional.of(row));
		when(stories.setThumbnailIfMissing(any(), anyString())).thenReturn(true);
	}

	private void readyStory() {
		given(story(StoryStatus.READY, Instant.now().minusSeconds(60), null, StoryService.tokenHash(TOKEN)));
	}

	static byte[] image(String format, int w, int h) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(0x88c0e8));
		g.fillRect(0, 0, w, h);
		g.setColor(new Color(0x7bc96f));
		g.fillOval(w / 4, h / 2, w / 2, h / 3);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try {
			ImageIO.write(img, format, out);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		return out.toByteArray();
	}

	private static ApiError code(Runnable call) {
		try {
			call.run();
		}
		catch (ApiException e) {
			return e.error();
		}
		return null;
	}

	@Test
	void theCreatorsFrameIsRedrawnAsASmallJpeg() throws IOException {
		readyStory();
		String url = service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 960, 540));

		assertThat(url).startsWith("/api/files/thumbs/abc123xyz-").endsWith(".jpg");
		byte[] jpeg = stored.values().iterator().next();
		BufferedImage saved = ImageIO.read(new ByteArrayInputStream(jpeg));
		assertThat(saved.getWidth()).isEqualTo(480);
		assertThat(saved.getHeight()).isEqualTo(270);
		assertThat(ThumbnailService.sniff(jpeg)).contains("jpeg");
	}

	@Test
	void withoutTheUploadTokenTheBodyIsNotEvenRead() {
		readyStory();
		AtomicBoolean read = new AtomicBoolean();
		Supplier<byte[]> body = () -> {
			read.set(true);
			return image("png", 960, 540);
		};

		assertThat(code(() -> service.accept("abc123xyz", "someone-else", "image/png", body))).isEqualTo(ApiError.THUMBNAIL_REFUSED);
		assertThat(code(() -> service.accept("abc123xyz", null, "image/png", body))).isEqualTo(ApiError.THUMBNAIL_REFUSED);
		assertThat(read).isFalse();
		assertThat(stored).isEmpty();
	}

	@Test
	void onlyOncePerStory_onlyWhenReady_onlyOnTheFirstDay_onlyWhenEnabled() {
		given(story(StoryStatus.READY, Instant.now(), "/api/files/thumbs/old.jpg", null));
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 960, 540)))).isEqualTo(ApiError.THUMBNAIL_EXISTS);

		given(story(StoryStatus.GENERATING_MODELS, Instant.now(), null, StoryService.tokenHash(TOKEN)));
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 960, 540)))).isEqualTo(ApiError.THUMBNAIL_REFUSED);

		given(story(StoryStatus.READY, Instant.now().minus(Duration.ofHours(25)), null, StoryService.tokenHash(TOKEN)));
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 960, 540)))).isEqualTo(ApiError.THUMBNAIL_REFUSED);

		readyStory();
		ThumbnailService off = new ThumbnailService(stories, storage, jpeg -> true, false);
		assertThat(code(() -> off.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 960, 540)))).isEqualTo(ApiError.THUMBNAIL_REFUSED);

		when(stories.findBySlug("nope")).thenReturn(Optional.empty());
		assertThat(code(() -> service.accept("nope", TOKEN, "image/png", () -> image("png", 960, 540)))).isEqualTo(ApiError.NOT_FOUND);
	}

	@Test
	void refusesWhatIsNotASmallLandscapeJpegOrPng() {
		readyStory();
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/jpeg", () -> image("png", 960, 540)))).as("type mismatch").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/gif", () -> image("gif", 960, 540)))).as("gif").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> "<svg/>".getBytes(StandardCharsets.UTF_8)))).as("not an image").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 6000, 3000)))).as("too many pixels").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> image("png", 600, 600)))).as("square").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/png", () -> new byte[ThumbnailService.MAX_UPLOAD_BYTES + 1]))).as("too big").isEqualTo(ApiError.BAD_IMAGE);
		byte[] truncated = java.util.Arrays.copyOf(image("jpeg", 960, 540), 200);
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/jpeg", () -> truncated))).as("truncated").isEqualTo(ApiError.BAD_IMAGE);
		assertThat(stored).isEmpty();
	}

	@Test
	void aPictureTheModeratorRefusesIsNotStored() {
		readyStory();
		moderatorSaysYes = false;
		assertThat(code(() -> service.accept("abc123xyz", TOKEN, "image/jpeg", () -> image("jpeg", 960, 540)))).isEqualTo(ApiError.BAD_IMAGE);
		assertThat(stored).isEmpty();
		verify(stories, never()).setThumbnailIfMissing(any(), anyString());
	}

	@Test
	void losingARaceIsAConflict() {
		readyStory();
		when(stories.setThumbnailIfMissing(any(), anyString())).thenReturn(false);
		assertThatThrownBy(() -> service.accept("abc123xyz", TOKEN, "image/jpeg", () -> image("jpeg", 960, 540)))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.error()).isEqualTo(ApiError.THUMBNAIL_EXISTS));
	}

	@Test
	void theVisionVerdictMustBeAClearYes() throws IOException {
		ObjectMapper json = new ObjectMapper();
		String answer = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"%s\"}]}}]}";
		assertThat(ThumbnailModerator.GeminiVision.verdict(json.readTree(answer.formatted("SAFE")))).isTrue();
		assertThat(ThumbnailModerator.GeminiVision.verdict(json.readTree(answer.formatted(" safe\\n")))).isTrue();
		assertThat(ThumbnailModerator.GeminiVision.verdict(json.readTree(answer.formatted("UNSAFE")))).isFalse();
		assertThat(ThumbnailModerator.GeminiVision.verdict(json.readTree("{}"))).isFalse();
	}

}
