package hr.fesb.diorama.health;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import hr.fesb.diorama.config.CorsConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** Web-slice test: needs no database, so the build passes before Supabase is configured. */
@WebMvcTest(HealthController.class)
@Import(CorsConfig.class)
class HealthControllerTest {

	@Autowired
	private MockMvc mvc;

	@Test
	void healthReturnsOk() throws Exception {
		mvc.perform(get("/api/health"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("ok"));
	}

	@Test
	void corsAllowsOnlyTheFrontendOrigin() throws Exception {
		mvc.perform(get("/api/health").header("Origin", "http://localhost:5173"))
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
		mvc.perform(get("/api/health").header("Origin", "https://evil.example"))
			.andExpect(status().isForbidden());
	}

}
