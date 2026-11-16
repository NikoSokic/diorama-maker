package hr.fesb.diorama.story;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.CreditGuard;
import hr.fesb.diorama.story.ApiError.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Tripo balance for the developer: only from this machine, or with the admin token. */
@RestController
@RequestMapping("/api/credits")
public class CreditsController {

	private final CreditGuard credits;
	private final DioramaProperties props;
	private final ClientIp clientIp;

	public CreditsController(CreditGuard credits, DioramaProperties props, ClientIp clientIp) {
		this.credits = credits;
		this.props = props;
		this.clientIp = clientIp;
	}

	@GetMapping
	Map<String, Object> credits(@RequestHeader(value = "X-Admin-Token", required = false) String token, HttpServletRequest request) {
		boolean local = ClientIp.isLoopback(clientIp.address(request));
		boolean admin = !props.adminToken().isBlank() && token != null && MessageDigest.isEqual(
				token.getBytes(StandardCharsets.UTF_8), props.adminToken().getBytes(StandardCharsets.UTF_8));
		if (!local && !admin) {
			throw new ApiException(ApiError.FORBIDDEN, null);
		}
		CreditGuard.Status status = credits.status();
		DioramaProperties.Costs costs = props.tripo().costs();
		return Map.of(
				"mode", props.tripo().resolvedMode().name().toLowerCase(),
				"known", status.known(),
				"balance", status.balance(),
				"frozen", status.frozen(),
				"reserved", status.reserved(),
				"available", status.available(),
				"rigging", props.tripo().enableRigging(),
				"costs", Map.of("textToModel", costs.textToModel(), "rig", costs.rig(), "retargetPerClip", costs.retargetPerClip()));
	}

}
