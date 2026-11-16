package hr.fesb.diorama.story;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestSizeFilterTest {

	private final RequestSizeFilter filter = new RequestSizeFilter(new ObjectMapper());

	/** A body sent with chunked transfer encoding: the container does not know its length up front. */
	private static MockHttpServletRequest chunked(int bytes) {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/stories") {

			@Override
			public int getContentLength() {
				return -1;
			}

			@Override
			public long getContentLengthLong() {
				return -1;
			}
		};
		request.setContent(new byte[bytes]);
		return request;
	}

	private static FilterChain readingAll(AtomicInteger read) {
		return (request, response) -> read.set(request.getInputStream().readAllBytes().length);
	}

	@Test
	void refusesADeclaredOversizedBodyWithoutReadingIt() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/stories");
		request.setContent(new byte[RequestSizeFilter.MAX_BODY_BYTES + 1]);
		request.addHeader("Accept-Language", "hr");
		MockHttpServletResponse response = new MockHttpServletResponse();
		AtomicInteger read = new AtomicInteger(-1);

		filter.doFilter(request, response, readingAll(read));

		assertThat(response.getStatus()).isEqualTo(413);
		assertThat(response.getContentAsString()).contains("\"code\":\"TOO_LARGE\"").contains("prevelik");
		assertThat(read).as("the chain must not run").hasValue(-1);
	}

	@Test
	void cutsOffABodyOfUnknownLengthAtTheLimit() {
		AtomicInteger read = new AtomicInteger(-1);

		assertThatThrownBy(() -> filter.doFilter(chunked(RequestSizeFilter.MAX_BODY_BYTES + 1), new MockHttpServletResponse(),
				readingAll(read)))
			.isInstanceOf(IOException.class)
			.hasMessageContaining("larger than");
		assertThat(read).hasValue(-1);
	}

	@Test
	void letsBodiesUpToTheLimitThrough() throws Exception {
		AtomicInteger read = new AtomicInteger(-1);

		filter.doFilter(chunked(RequestSizeFilter.MAX_BODY_BYTES), new MockHttpServletResponse(), readingAll(read));

		assertThat(read).hasValue(RequestSizeFilter.MAX_BODY_BYTES);
	}

}
