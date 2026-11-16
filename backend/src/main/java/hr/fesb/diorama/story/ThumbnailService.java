package hr.fesb.diorama.story;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import com.fasterxml.jackson.databind.ObjectMapper;
import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.storage.ModelStorage;
import hr.fesb.diorama.story.ApiError.ApiException;
import hr.fesb.diorama.story.StoryRepository.StoryRow;
import hr.fesb.diorama.story.StoryRepository.StoryStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Gallery thumbnails captured by the player. An anonymous upload, so it is narrow on purpose: one image per story,
 * only while it has none, only with the single-use upload token handed to the story's creator, only on the story's
 * first day; a small JPEG or PNG whose size is checked before it is decoded; what is stored is always a fresh
 * 480x270 JPEG drawn by the server, never the uploaded bytes; and with Gemini live that JPEG must pass a look by
 * {@link ThumbnailModerator} before it can appear in the public gallery.
 */
@Service
public class ThumbnailService {

	private static final Logger log = LoggerFactory.getLogger(ThumbnailService.class);

	static final int MAX_UPLOAD_BYTES = 200 * 1024;
	static final int WIDTH = 480;
	static final int HEIGHT = 270;
	static final Duration WINDOW = Duration.ofHours(24);
	private static final int MIN_W = 160;
	private static final int MAX_W = 1920;
	private static final int MIN_H = 90;
	private static final int MAX_H = 1200;

	static {
		ImageIO.setUseCache(false); // decode in memory, never into temp files
	}

	private final StoryRepository stories;
	private final ModelStorage storage;
	private final ThumbnailModerator moderator;
	private final boolean enabled;

	@Autowired
	public ThumbnailService(StoryRepository stories, ModelStorage storage, DioramaProperties props, ObjectMapper json) {
		this(stories, storage, ThumbnailModerator.of(props.gemini(), json), props.thumbnailUploads());
	}

	ThumbnailService(StoryRepository stories, ModelStorage storage, ThumbnailModerator moderator, boolean enabled) {
		this.stories = stories;
		this.storage = storage;
		this.moderator = moderator;
		this.enabled = enabled;
	}

	/**
	 * @param body read only after the cheap checks passed
	 * @return the stored thumbnail's URL
	 */
	public String accept(String slug, String token, String contentType, Supplier<byte[]> body) {
		StoryRow story = stories.findBySlug(slug).orElseThrow(() -> new ApiException(ApiError.NOT_FOUND, null));
		if (story.thumbnailUrl() != null) {
			throw new ApiException(ApiError.THUMBNAIL_EXISTS, null);
		}
		boolean owner = token != null && !token.isBlank() && story.uploadTokenHash() != null
				&& MessageDigest.isEqual(StoryService.tokenHash(token).getBytes(StandardCharsets.US_ASCII),
						story.uploadTokenHash().getBytes(StandardCharsets.US_ASCII));
		if (!enabled || !owner || story.status() != StoryStatus.READY || story.createdAt().isBefore(Instant.now().minus(WINDOW))) {
			log.info("thumbnail for {} refused (enabled={}, token ok={}, status={})", slug, enabled, owner, story.status());
			throw new ApiException(ApiError.THUMBNAIL_REFUSED, null);
		}
		byte[] jpeg = encode(cover(decode(body.get(), contentType)));
		if (!moderator.acceptable(jpeg)) {
			throw new ApiException(ApiError.BAD_IMAGE, null);
		}
		String url = storage.put("thumbs/" + slug + "-" + UUID.randomUUID().toString().substring(0, 8) + ".jpg", jpeg, "image/jpeg");
		if (!stories.setThumbnailIfMissing(story.id(), url)) {
			throw new ApiException(ApiError.THUMBNAIL_EXISTS, null); // another upload won the race
		}
		return url;
	}
	/** The image, after its format and size were checked without decoding the pixels. */
	static BufferedImage decode(byte[] body, String contentType) {
		if (body == null || body.length == 0 || body.length > MAX_UPLOAD_BYTES) {
			throw new ApiException(ApiError.BAD_IMAGE, null);
		}
		String format = sniff(body).orElseThrow(() -> new ApiException(ApiError.BAD_IMAGE, null));
		String declared = contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase();
		if (!declared.equals("image/" + format)) {
			throw new ApiException(ApiError.BAD_IMAGE, null);
		}
		try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(body))) {
			Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
			if (in == null || !readers.hasNext()) {
				throw new ApiException(ApiError.BAD_IMAGE, null);
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(in, true, true);
				int w = reader.getWidth(0);
				int h = reader.getHeight(0);
				double aspect = w / (double) h;
				// a decompression bomb is refused here, before its pixels exist
				if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H || aspect < 1.2 || aspect > 2.4) {
					throw new ApiException(ApiError.BAD_IMAGE, null);
				}
				BufferedImage image = reader.read(0);
				if (image == null) {
					throw new ApiException(ApiError.BAD_IMAGE, null);
				}
				return image;
			}
			finally {
				reader.dispose();
			}
		}
		catch (IOException | RuntimeException e) {
			if (e instanceof ApiException api) {
				throw api;
			}
			throw new ApiException(ApiError.BAD_IMAGE, null);
		}
	}

	static Optional<String> sniff(byte[] b) {
		if (b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
			return Optional.of("jpeg");
		}
		if (b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
			return Optional.of("png");
		}
		return Optional.empty();
	}

	/** Scaled and centre-cropped to exactly 480x270 on an opaque canvas. */
	static BufferedImage cover(BufferedImage source) {
		BufferedImage out = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
		double scale = Math.max(WIDTH / (double) source.getWidth(), HEIGHT / (double) source.getHeight());
		int w = (int) Math.ceil(source.getWidth() * scale);
		int h = (int) Math.ceil(source.getHeight() * scale);
		Graphics2D g = out.createGraphics();
		try {
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
			g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			g.drawImage(source, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h, null);
		}
		finally {
			g.dispose();
		}
		return out;
	}

	static byte[] encode(BufferedImage image) {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
			writer.setOutput(out);
			ImageWriteParam param = writer.getDefaultWriteParam();
			param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			param.setCompressionQuality(0.82f);
			writer.write(null, new IIOImage(image, null, null), param);
		}
		catch (IOException e) {
			throw new IllegalStateException("could not encode a thumbnail", e);
		}
		finally {
			writer.dispose();
		}
		return bytes.toByteArray();
	}

}
