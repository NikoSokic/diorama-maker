package hr.fesb.diorama.story;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

import hr.fesb.diorama.config.DioramaProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Finds the caller's IP and turns it into a salted hash; raw IPs are never stored or logged. */
@Component
public class ClientIp {

	private static final Logger log = LoggerFactory.getLogger(ClientIp.class);

	private final boolean trustProxy;
	private final String salt;

	public ClientIp(DioramaProperties props) {
		this.trustProxy = props.trustProxy();
		if (props.ipHashSalt().isBlank()) {
			byte[] random = new byte[24];
			new SecureRandom().nextBytes(random);
			this.salt = HexFormat.of().formatHex(random);
			log.warn("IP_HASH_SALT is not set: using a random salt, so per-visitor limits reset on every restart");
		}
		else {
			this.salt = props.ipHashSalt();
		}
	}

	/** {@code X-Forwarded-For} is only believed when the app is configured as running behind a proxy. */
	public String address(HttpServletRequest request) {
		if (trustProxy) {
			String forwarded = request.getHeader("X-Forwarded-For");
			if (forwarded != null && !forwarded.isBlank()) {
				String first = forwarded.split(",")[0].trim();
				if (first.matches("[0-9a-fA-F:.]{2,45}")) {
					return first;
				}
			}
		}
		return request.getRemoteAddr();
	}

	public String hash(String address) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(digest.digest((salt + "|" + address).getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	public static boolean isLoopback(String address) {
		if (address == null || !address.matches("[0-9a-fA-F:.]{2,45}")) {
			return false;
		}
		try {
			// literal IPs only (checked above), so this never does a DNS lookup
			return InetAddress.getByName(address).isLoopbackAddress();
		}
		catch (UnknownHostException e) {
			return false;
		}
	}

}
