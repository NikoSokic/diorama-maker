package hr.fesb.diorama.testsupport;

import java.util.HashMap;
import java.util.Map;

import hr.fesb.diorama.config.DioramaProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/** Builds {@link DioramaProperties} for plain unit tests exactly as Spring would bind them. */
public final class TestProps {

	private TestProps() {
	}

	/**
	 * Fast mock timings plus the given overrides.
	 *
	 * @param keysAndValues pairs such as {@code "tripo.mock.balance", "60"} (keys relative to {@code diorama.})
	 */
	public static DioramaProperties of(String... keysAndValues) {
		Map<String, String> map = new HashMap<>();
		map.put("diorama.tripo.poll-interval", "5ms");
		map.put("diorama.tripo.max-poll-interval", "10ms");
		map.put("diorama.tripo.retry-backoff", "5ms");
		map.put("diorama.tripo.balance-cache-ttl", "0s");
		map.put("diorama.tripo.mock.generation-time", "30ms");
		map.put("diorama.tripo.mock.animation-time", "15ms");
		map.put("diorama.gemini.retry-backoff", "5ms");
		for (int i = 0; i < keysAndValues.length; i += 2) {
			map.put("diorama." + keysAndValues[i], keysAndValues[i + 1]);
		}
		return new Binder(new MapConfigurationPropertySource(map)).bindOrCreate("diorama", Bindable.of(DioramaProperties.class));
	}

}
