package hr.fesb.diorama.story;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps request bodies. The only body the API accepts is a story of at most 500 characters, so anything larger
 * is refused before it is buffered and parsed: by its declared length when there is one, otherwise while reading.
 */
@Component
public class RequestSizeFilter extends OncePerRequestFilter {

	/** 500 characters as escaped surrogate pairs are about 6 KB of JSON. */
	static final int MAX_BODY_BYTES = 16 * 1024;

	private final ObjectMapper json;

	public RequestSizeFilter(ObjectMapper json) {
		this.json = json;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (request.getContentLengthLong() > MAX_BODY_BYTES) {
			ApiError error = ApiError.TOO_LARGE;
			response.setStatus(error.status().value());
			response.setContentType(MediaType.APPLICATION_JSON_VALUE);
			response.setCharacterEncoding(StandardCharsets.UTF_8.name());
			json.writeValue(response.getOutputStream(),
					new ApiExceptionHandler.ErrorBody(error.name(), error.message(ApiExceptionHandler.lang(request))));
			return;
		}
		chain.doFilter(new Limited(request), response);
	}

	/** Bodies sent without a length (chunked) are cut off at the same limit; the JSON parser then reports a bad request. */
	private static final class Limited extends HttpServletRequestWrapper {

		Limited(HttpServletRequest request) {
			super(request);
		}

		@Override
		public ServletInputStream getInputStream() throws IOException {
			ServletInputStream in = super.getInputStream();
			return new ServletInputStream() {

				private int count;

				@Override
				public int read() throws IOException {
					int value = in.read();
					if (value >= 0) {
						counted(1);
					}
					return value;
				}

				@Override
				public int read(byte[] buffer, int offset, int length) throws IOException {
					int read = in.read(buffer, offset, length);
					if (read > 0) {
						counted(read);
					}
					return read;
				}

				private void counted(int bytes) throws IOException {
					count += bytes;
					if (count > MAX_BODY_BYTES) {
						throw new IOException("request body is larger than " + MAX_BODY_BYTES + " bytes");
					}
				}

				@Override
				public boolean isFinished() {
					return in.isFinished();
				}

				@Override
				public boolean isReady() {
					return in.isReady();
				}

				@Override
				public void setReadListener(ReadListener listener) {
					in.setReadListener(listener);
				}
			};
		}
	}

}
