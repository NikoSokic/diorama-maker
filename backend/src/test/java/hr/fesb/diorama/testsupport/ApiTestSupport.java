package hr.fesb.diorama.testsupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** HTTP helpers for the full-application tests (real Postgres, mock Tripo, offline planner). */
public abstract class ApiTestSupport {

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected ObjectMapper json;

	/** POST /api/stories from the given address; asserts the HTTP status and returns the JSON body. */
	protected JsonNode postStory(String text, String lang, String remoteAddress, int expectedStatus) throws Exception {
		Map<String, String> body = new LinkedHashMap<>();
		body.put("text", text);
		if (lang != null) {
			body.put("lang", lang);
		}
		MockHttpServletRequestBuilder request = post("/api/stories").contentType(MediaType.APPLICATION_JSON)
			.content(json.writeValueAsBytes(body));
		if (remoteAddress != null) {
			request.with(servletRequest -> {
				servletRequest.setRemoteAddr(remoteAddress);
				return servletRequest;
			});
		}
		return read(mvc.perform(request).andReturn().getResponse(), expectedStatus);
	}

	/** {@code POST /api/stories/{slug}/variants} with the given fields, from {@code remoteAddress} (null: this machine). */
	protected JsonNode postVariant(String slug, Map<String, String> body, String remoteAddress, int expectedStatus) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/stories/" + slug + "/variants").contentType(MediaType.APPLICATION_JSON)
			.content(json.writeValueAsBytes(body));
		if (remoteAddress != null) {
			request.with(servletRequest -> {
				servletRequest.setRemoteAddr(remoteAddress);
				return servletRequest;
			});
		}
		return read(mvc.perform(request).andReturn().getResponse(), expectedStatus);
	}

	/** Creates a story from this machine (not rate limited) and returns its slug. */
	protected String createStory(String text, String lang) throws Exception {
		JsonNode created = postStory(text, lang, null, 202);
		assertThat(created.path("status").asText()).isEqualTo("ANALYZING");
		return created.path("slug").asText();
	}

	protected JsonNode getJson(String url, int expectedStatus) throws Exception {
		return read(mvc.perform(get(url)).andReturn().getResponse(), expectedStatus);
	}

	/** Polls like the frontend does until the story is READY or FAILED. */
	protected JsonNode awaitStory(String slug) throws Exception {
		long deadline = System.nanoTime() + 30_000_000_000L;
		int lastProgress = -1;
		while (true) {
			JsonNode story = getJson("/api/stories/" + slug, 200);
			String status = story.path("status").asText();
			if (status.equals("READY") || status.equals("FAILED")) {
				return story;
			}
			assertThat(story.path("progress").asInt()).as("progress never goes backwards").isGreaterThanOrEqualTo(lastProgress);
			lastProgress = story.path("progress").asInt();
			assertThat(System.nanoTime()).as("story %s still %s after 30 s", slug, status).isLessThan(deadline);
			Thread.sleep(25);
		}
	}

	protected JsonNode createAndAwait(String text, String lang) throws Exception {
		return awaitStory(createStory(text, lang));
	}

	protected static JsonNode character(JsonNode story, String key) {
		for (JsonNode character : story.path("characters")) {
			if (character.path("key").asText().equals(key)) {
				return character;
			}
		}
		throw new AssertionError("no character '" + key + "' in " + story.path("characters"));
	}

	private JsonNode read(MockHttpServletResponse response, int expectedStatus) throws Exception {
		String body = response.getContentAsString(StandardCharsets.UTF_8);
		assertThat(response.getStatus()).as(body).isEqualTo(expectedStatus);
		return body.isEmpty() ? json.createObjectNode() : json.readTree(body);
	}

}
