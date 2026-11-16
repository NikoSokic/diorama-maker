package hr.fesb.diorama.story;

import hr.fesb.diorama.story.ApiError.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** One JSON error shape for the whole API: {@code {"code": "...", "message": "..."}}. No internals leak out. */
@RestControllerAdvice
public class ApiExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	public record ErrorBody(String code, String message) {
	}

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ErrorBody> api(ApiException e, HttpServletRequest request) {
		return body(e.error(), e.lang() != null ? e.lang() : lang(request));
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
			MissingServletRequestParameterException.class, HttpMediaTypeNotSupportedException.class,
			HttpRequestMethodNotSupportedException.class })
	ResponseEntity<ErrorBody> badRequest(Exception e, HttpServletRequest request) {
		return body(ApiError.INVALID_REQUEST, lang(request));
	}

	@ExceptionHandler(NoResourceFoundException.class)
	ResponseEntity<ErrorBody> notFound(NoResourceFoundException e, HttpServletRequest request) {
		return body(ApiError.NOT_FOUND, lang(request));
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ErrorBody> unexpected(Exception e, HttpServletRequest request) {
		log.error("unhandled error on {} {}", request.getMethod(), request.getRequestURI(), e);
		return body(ApiError.INTERNAL, lang(request));
	}

	private static ResponseEntity<ErrorBody> body(ApiError error, String lang) {
		return ResponseEntity.status(error.status()).body(new ErrorBody(error.name(), error.message(lang)));
	}

	/** UI language from {@code Accept-Language}; Croatian unless English is clearly preferred. */
	static String lang(HttpServletRequest request) {
		String header = request.getHeader("Accept-Language");
		return header != null && header.trim().toLowerCase().startsWith("en") ? "en" : "hr";
	}

}
