package hr.fesb.diorama.story;

import java.util.List;

import hr.fesb.diorama.story.StoryService.Created;
import hr.fesb.diorama.story.StoryService.GalleryItem;
import hr.fesb.diorama.story.StoryService.StoryView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

	public StoryController(StoryService stories, ClientIp clientIp) {
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
