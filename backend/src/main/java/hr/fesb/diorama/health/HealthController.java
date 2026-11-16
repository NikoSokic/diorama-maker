package hr.fesb.diorama.health;

import java.util.Locale;
import java.util.Map;

import hr.fesb.diorama.config.DioramaProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

	private final DioramaProperties props;

	public HealthController(DioramaProperties props) {
		this.props = props;
	}

	/** Liveness plus which mode the generators run in, so the UI can show a "demo models" badge. */
	@GetMapping
	public Map<String, String> health() {
		return Map.of(
				"status", "ok",
				"tripoMode", props.tripo().resolvedMode().name().toLowerCase(Locale.ROOT),
				"plannerMode", props.gemini().resolvedMode().name().toLowerCase(Locale.ROOT));
	}

}
