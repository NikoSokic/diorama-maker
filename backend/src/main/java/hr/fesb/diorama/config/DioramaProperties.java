package hr.fesb.diorama.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** All app settings under {@code diorama.*}. Secrets live here but are never logged (see the {@code toString()}s). */
@ConfigurationProperties(prefix = "diorama")
public record DioramaProperties(
		@DefaultValue("http://localhost:5173") String frontendOrigin,
		@DefaultValue("5") int maxStoriesPerIpPerDay,
		@DefaultValue("") String ipHashSalt,
		@DefaultValue("") String adminToken,
		/** Read the client IP from X-Forwarded-For. Only enable behind a trusted reverse proxy. */
		@DefaultValue("false") boolean trustProxy,
		/** How many reverse proxies in front of the app append to X-Forwarded-For (only read when trustProxy is on). */
		@DefaultValue("1") int trustedProxyHops,
		/** Apply the per-IP story limit to loopback callers too (off by default so local development is not throttled). */
		@DefaultValue("false") boolean rateLimitLoopback,
		@DefaultValue Tripo tripo,
		@DefaultValue Gemini gemini,
		@DefaultValue Storage storage,
		@DefaultValue Supabase supabase) {

	public enum Mode { MOCK, LIVE }

	public record Tripo(
			@DefaultValue("") String apiKey,
			@DefaultValue("https://openapi.tripo3d.ai/v3") String baseUrl,
			@DefaultValue("mock") String mode,
			@DefaultValue("true") boolean enableRigging,
			@DefaultValue("v3.1-20260211") String modelVersion,
			@DefaultValue("10000") int faceLimit,
			@DefaultValue("standard") String textureQuality,
			@DefaultValue("v1.0-20240301") String bipedRigModel,
			@DefaultValue("v2.5-20260210") String creatureRigModel,
			@DefaultValue("2s") Duration pollInterval,
			@DefaultValue("5s") Duration maxPollInterval,
			@DefaultValue("6m") Duration taskTimeout,
			@DefaultValue("30s") Duration requestTimeout,
			@DefaultValue("30s") Duration balanceCacheTtl,
			/** First delay of the exponential backoff for retried requests. */
			@DefaultValue("1s") Duration retryBackoff,
			@DefaultValue Costs costs,
			@DefaultValue Mock mock) {

		/** Anything that is not exactly "live" is mock, so a typo can never spend credits. */
		public Mode resolvedMode() {
			return "live".equalsIgnoreCase(mode.trim()) ? Mode.LIVE : Mode.MOCK;
		}

		@Override
		public String toString() {
			return "Tripo[mode=" + mode + ", apiKey=" + (apiKey.isEmpty() ? "unset" : "set") + "]";
		}
	}

	/** Credit prices (API_NOTES §1.8). Trust {@code credits_consumed} from Tripo over these. */
	public record Costs(
			@DefaultValue("20") int textToModel,
			@DefaultValue("25") int rig,
			@DefaultValue("10") int retargetPerClip) {
	}

	/** Mock Tripo: fake progressive delay and a simulated wallet so the credit guard can be exercised. */
	public record Mock(
			@DefaultValue("6s") Duration generationTime,
			@DefaultValue("3s") Duration animationTime,
			@DefaultValue("10000") int balance) {
	}

	public record Gemini(
			@DefaultValue("") String apiKey,
			@DefaultValue("live") String mode,
			@DefaultValue("gemini-3.5-flash-lite") String model,
			@DefaultValue("https://generativelanguage.googleapis.com/v1beta") String baseUrl,
			@DefaultValue("30s") Duration timeout,
			@DefaultValue("2s") Duration retryBackoff) {

		/** Mock (offline planner) when asked for, or when there is no key to call Gemini with. */
		public Mode resolvedMode() {
			return "mock".equalsIgnoreCase(mode.trim()) || apiKey.isBlank() ? Mode.MOCK : Mode.LIVE;
		}

		@Override
		public String toString() {
			return "Gemini[mode=" + mode + ", model=" + model + ", apiKey=" + (apiKey.isEmpty() ? "unset" : "set") + "]";
		}
	}

	/**
	 * {@code auto} = Supabase when Tripo is live and Supabase is configured, otherwise local files served at
	 * /api/files (mock samples are not worth Supabase quota). {@code supabase} / {@code local} force one.
	 */
	public record Storage(
			@DefaultValue("auto") String mode,
			@DefaultValue("data/files") String localDir) {
	}

	public record Supabase(
			@DefaultValue("") String url,
			@DefaultValue("") String serviceKey,
			@DefaultValue("models") String bucket) {

		public boolean configured() {
			return !url.isBlank() && !serviceKey.isBlank();
		}

		@Override
		public String toString() {
			return "Supabase[bucket=" + bucket + ", serviceKey=" + (serviceKey.isEmpty() ? "unset" : "set") + "]";
		}
	}

	@Override
	public String toString() {
		return "DioramaProperties[" + tripo + ", " + gemini + ", " + supabase + "]";
	}

}
