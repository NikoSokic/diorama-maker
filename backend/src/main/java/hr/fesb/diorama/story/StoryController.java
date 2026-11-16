package hr.fesb.diorama.story;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import hr.fesb.diorama.story.ApiError.ApiException;
import hr.fesb.diorama.story.StoryService.Created;
import hr.fesb.diorama.story.StoryService.GalleryItem;
import hr.fesb.diorama.story.StoryService.StoryView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stories")
public class StoryController {

	public record CreateStoryRequest(String text, String lang) {
	}

	private final StoryService stories;
	private final ClientIp clientIp;

	private final ThumbnailService thumbnails;

	public StoryController(StoryService stories, ClientIp clientIp, ThumbnailService thumbnails) {
		this.thumbnails = thumbnails;
		this.stories = stories;
		this.clientIp = clientIp;
	}

	/** Accepts the story and answers at once; the client then polls {@code GET /api/stories/{slug}}. */
	@PostMapping
	ResponseEntity<Created> create(@RequestBody CreateStoryRequest body, HttpServletRequest request) {
		String lang = body.lang() == null || body.lang().isBlank() ? ApiExceptionHandler.lang(request)
				: "en".equalsIgnoreCase(body.lang().trim()) ? "en" : "hr";
		return ResponseEntity.accepted().body(stories.create(body.text(), lang, clientIp.address(request)));
	}

	/** A new story made from a finished one: {@code tweak} (place / time / weather) or {@code retry} (plan again). */
	@PostMapping("/{slug}/variants")
	ResponseEntity<Created> variant(@PathVariable String slug, @RequestBody StoryService.VariantRequest body,
			HttpServletRequest request) {
		return ResponseEntity.accepted()
			.body(stories.variant(slug, body, clientIp.address(request), ApiExceptionHandler.lang(request)));
	}

	/**
	 * The gallery picture, captured by the creator's player. Raw JPEG or PNG body (at most 200 KB), the upload token
	 * from {@code POST /api/stories} in {@code X-Upload-Token}; see {@link ThumbnailService} for the rules.
	 */
	@PutMapping("/{slug}/thumbnail")
	ResponseEntity<Map<String, String>> thumbnail(@PathVariable String slug,
			@RequestHeader(value = "X-Upload-Token", required = false) String token, HttpServletRequest request) {
		String url = thumbnails.accept(slug, token, request.getContentType(), () -> {
			try {
				return request.getInputStream().readNBytes(ThumbnailService.MAX_UPLOAD_BYTES + 1);
			}
			catch (IOException e) {
				throw new ApiException(ApiError.TOO_LARGE, ApiExceptionHandler.lang(request));
			}
		});
		return ResponseEntity.ok(Map.of("thumbnailUrl", url));
	}

	@GetMapping("/{slug}")
	ResponseEntity<StoryView> get(@PathVariable String slug, HttpServletRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(stories.get(slug, ApiExceptionHandler.lang(request)));
	}

	/** Recent public stories for the gallery. */
	@GetMapping
	List<GalleryItem> gallery(@RequestParam(defaultValue = "12") int limit) {
		return stories.gallery(limit);
	}

}
