package hr.fesb.diorama.http;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Thin wrapper over the JDK HTTP client shared by the Tripo, Gemini and Supabase clients: every call has a
 * timeout, bodies are plain bytes, and nothing (URL, headers, body) is ever logged here.
 */
public final class Http {

	private final HttpClient client;

	/**
	 * @param followRedirects only for unauthenticated downloads; API clients that send credentials never
	 *                        follow redirects, so a key cannot leak to another host
	 */
	public Http(Duration connectTimeout, boolean followRedirects) {
		this.client = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(connectTimeout)
			.followRedirects(followRedirects ? HttpClient.Redirect.NORMAL : HttpClient.Redirect.NEVER)
			.build();
	}

	public Response send(String method, URI uri, Map<String, String> headers, byte[] body, Duration timeout)
			throws IOException {
		HttpRequest.Builder request = HttpRequest.newBuilder(uri)
			.timeout(timeout)
			.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
		headers.forEach(request::header);
		try {
			HttpResponse<byte[]> response = client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
			return new Response(response.statusCode(), response.headers(), response.body());
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new InterruptedIOException("request interrupted");
		}
	}

	public record Response(int status, HttpHeaders headers, byte[] body) {

		public boolean ok() {
			return status >= 200 && status < 300;
		}

		public String text() {
			return new String(body, StandardCharsets.UTF_8);
		}

		public String header(String name) {
			return headers.firstValue(name).orElse(null);
		}
	}

	/** Sleeps without swallowing an interrupt; returns false when the thread was interrupted. */
	public static boolean sleep(Duration duration) {
		try {
			Thread.sleep(Math.max(0, duration.toMillis()));
			return true;
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return false;
		}
	}

}
