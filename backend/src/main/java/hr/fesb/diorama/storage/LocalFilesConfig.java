package hr.fesb.diorama.storage;

import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Serves locally stored models at {@code /api/files/**} when the local storage is active. */
@Configuration
public class LocalFilesConfig implements WebMvcConfigurer {

	private final ObjectProvider<ModelStorage> storage;

	public LocalFilesConfig(ObjectProvider<ModelStorage> storage) {
		this.storage = storage;
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		if (storage.getIfAvailable() instanceof LocalModelStorage local) {
			String location = local.root().toUri().toString();
			registry.addResourceHandler(LocalModelStorage.URL_PREFIX + "**")
				.addResourceLocations(location.endsWith("/") ? location : location + "/")
				.setCacheControl(CacheControl.maxAge(Duration.ofHours(1)));
		}
	}

	@Override
	public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
		configurer.mediaType("glb", MediaType.parseMediaType(ModelStorage.GLB));
	}

}
