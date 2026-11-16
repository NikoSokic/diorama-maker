package hr.fesb.diorama.health;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import hr.fesb.diorama.config.CorsConfig;
import hr.fesb.diorama.config.DioramaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** Web-slice test: needs no database. Also proves that tests never see the developer's real settings. */
@WebMvcTest(HealthController.class)
@Import(CorsConfig.class)
@EnableConfigurationProperties(DioramaProperties.class)
class HealthControllerTest {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private DioramaProperties props;

	@Test
	void healthReturnsOkAndTheModes() throws Exception {
		mvc.perform(get("/api/health"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("ok"))
			.andExpect(jsonPath("$.tripoMode").value("mock"))
			.andExpect(jsonPath("$.plannerMode").value("mock"));
	}

	@Test
	void corsAllowsOnlyTheFrontendOrigin() throws Exception {
		mvc.perform(get("/api/health").header("Origin", "http://localhost:5173"))
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
		mvc.perform(get("/api/health").header("Origin", "https://evil.example"))
			.andExpect(status().isForbidden());
	}

	@Test
	void testsNeverSeeRealKeysFromDotEnv() {
		// src/test/resources/config/application.yml must win over the repo's .env
		org.assertj.core.api.Assertions.assertThat(props.gemini().apiKey()).isEmpty();
		org.assertj.core.api.Assertions.assertThat(props.tripo().apiKey()).isEmpty();
		org.assertj.core.api.Assertions.assertThat(props.supabase().configured()).isFalse();
		org.assertj.core.api.Assertions.assertThat(props.tripo().resolvedMode()).isEqualTo(DioramaProperties.Mode.MOCK);
	}

}
