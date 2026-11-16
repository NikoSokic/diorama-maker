package hr.fesb.diorama.story;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HexFormat;
import java.util.List;

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
	private final int trustedProxyHops;
	private final String salt;

	public ClientIp(DioramaProperties props) {
		this.trustProxy = props.trustProxy();
		this.trustedProxyHops = Math.max(1, props.trustedProxyHops());
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

	/**
	 * {@code X-Forwarded-For} is only believed when the app is configured as running behind a proxy, and then
	 * only the entry written by the outermost trusted proxy: counted from the right, because everything to the
	 * left of it is sent by the client and can be forged (for example as 127.0.0.1 to look like a local caller).
	 */
	public String address(HttpServletRequest request) {
		if (trustProxy) {
			List<String> entries = new ArrayList<>();
			for (Enumeration<String> headers = request.getHeaders("X-Forwarded-For"); headers != null && headers.hasMoreElements();) {
				for (String entry : headers.nextElement().split(",")) {
					if (!entry.isBlank()) {
						entries.add(entry.trim());
					}
				}
			}
			if (!entries.isEmpty()) {
				String candidate = entries.get(Math.max(0, entries.size() - trustedProxyHops));
				if (candidate.matches("[0-9a-fA-F:.]{2,45}")) {
					return candidate;
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
