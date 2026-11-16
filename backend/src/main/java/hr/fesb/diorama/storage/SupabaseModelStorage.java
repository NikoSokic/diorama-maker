package hr.fesb.diorama.storage;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.http.Http;

/**
 * Supabase Storage over REST (API_NOTES §3.2): upsert upload into the public bucket, public URL for reading.
 * New {@code sb_secret_} keys go in {@code apikey}; legacy JWT keys also need {@code Authorization}. Both
 * shapes are tried once and the one that works is remembered.
 */
public class SupabaseModelStorage implements ModelStorage {

	private static final Duration TIMEOUT = Duration.ofSeconds(60);

	private final DioramaProperties.Supabase props;
	private final Http http = new Http(Duration.ofSeconds(10), false);
	private final String baseUrl;
	private volatile boolean apikeyOnly;

	public SupabaseModelStorage(DioramaProperties.Supabase props) {
		this.props = props;
		this.baseUrl = props.url().replaceAll("/+$", "");
	}

	@Override
	public String put(String path, byte[] bytes, String contentType) {
		if (path == null || !path.matches("[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*")) {
			throw new IllegalArgumentException("unsafe storage path");
		}
		URI uri = URI.create(baseUrl + "/storage/v1/object/" + props.bucket() + "/" + path);
		IOException failure = null;
		int status = 0;
		// the upload is an upsert, so repeating it is safe
		for (int attempt = 1; attempt <= 3; attempt++) {
			try {
				Http.Response response = http.send("POST", uri, headers(contentType), bytes, TIMEOUT);
				status = response.status();
				if (response.ok()) {
					return publicPrefix() + path;
				}
				if ((status == 400 || status == 401 || status == 403) && !apikeyOnly) {
					apikeyOnly = true;
					continue;
				}
				if (status < 500 && status != 429) {
					break;
				}
			}
			catch (IOException e) {
				failure = e;
			}
			if (!Http.sleep(Duration.ofSeconds(attempt))) {
				break;
			}
		}
		throw new StorageException("Supabase upload of " + path + " failed"
				+ (failure != null ? " (" + failure.getClass().getSimpleName() + ")" : " with HTTP " + status), failure);
	}

	@Override
	public boolean serves(String url) {
		return url != null && url.startsWith(publicPrefix());
	}

	private String publicPrefix() {
		return baseUrl + "/storage/v1/object/public/" + props.bucket() + "/";
	}

	private Map<String, String> headers(String contentType) {
		Map<String, String> headers = new LinkedHashMap<>();
		headers.put("apikey", props.serviceKey());
		if (!apikeyOnly) {
			headers.put("Authorization", "Bearer " + props.serviceKey());
		}
		headers.put("Content-Type", contentType);
		headers.put("x-upsert", "true");
		headers.put("cache-control", "31536000");
		return headers;
	}

}
