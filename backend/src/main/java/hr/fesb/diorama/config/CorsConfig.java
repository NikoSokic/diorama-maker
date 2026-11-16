package hr.fesb.diorama.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Cross-origin access to the API for the frontend's origin(s). {@code FRONTEND_ORIGIN} may list several,
 * comma-separated (e.g. the production domain and a preview domain). When the frontend and the API share one
 * origin (nginx in Docker, a proxy), CORS is not involved at all.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

	private final String frontendOrigin;

	public CorsConfig(@Value("${diorama.frontend-origin:http://localhost:5173}") String frontendOrigin) {
		this.frontendOrigin = frontendOrigin;
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
			.allowedOrigins(origins(frontendOrigin))
			.allowedMethods("GET", "POST", "PUT", "OPTIONS");
	}

	public static String[] origins(String configured) {
		return java.util.Arrays.stream(configured.split(","))
			.map(String::trim)
			.map(o -> o.endsWith("/") ? o.substring(0, o.length() - 1) : o)
			.filter(o -> !o.isEmpty())
			.toArray(String[]::new);
	}

}
