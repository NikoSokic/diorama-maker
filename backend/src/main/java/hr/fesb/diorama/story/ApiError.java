package hr.fesb.diorama.story;

import org.springframework.http.HttpStatus;

/**
 * Every error the API or the pipeline reports, with a friendly message in both UI languages. The code is
 * stable (the frontend may translate by it); the message is ready to show to a child.
 */
public enum ApiError {

	INVALID_TEXT(HttpStatus.BAD_REQUEST,
			"Napiši priču od 1 do 500 znakova.",
			"Write a story between 1 and 500 characters."),
	INVALID_REQUEST(HttpStatus.BAD_REQUEST,
			"Ovaj zahtjev ne možemo pročitati.",
			"We could not read this request."),
	TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE,
			"Ovaj zahtjev je prevelik.",
			"This request is too large."),
	RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS,
			"Danas si već napravio puno priča. Dođi opet sutra!",
			"You have made lots of stories today. Come back tomorrow!"),
	CREDITS_EXHAUSTED(HttpStatus.SERVICE_UNAVAILABLE,
			"Naša radionica igračaka trenutno odmara. Pokušaj malo kasnije!",
			"Our toy workshop is resting right now. Please try again later!"),
	BUSY(HttpStatus.SERVICE_UNAVAILABLE,
			"Trenutno je velika gužva. Pokušaj ponovno za minutu.",
			"We are very busy right now. Please try again in a minute."),
	UNSAFE_CONTENT(HttpStatus.UNPROCESSABLE_ENTITY,
			"Ova priča nije za našu pozornicu. Probaj s nekom veselijom!",
			"This story is not right for our stage. Try a friendlier one!"),
	INTERRUPTED(HttpStatus.INTERNAL_SERVER_ERROR,
			"Izrada ove priče je prekinuta. Pokušaj ponovno.",
			"Making this story was interrupted. Please try again."),
	NOT_FOUND(HttpStatus.NOT_FOUND,
			"Ne možemo pronaći tu priču.",
			"We cannot find that story."),
	FORBIDDEN(HttpStatus.FORBIDDEN,
			"Ovo je samo za administratore.",
			"This is for administrators only."),
	BAD_IMAGE(HttpStatus.BAD_REQUEST,
			"Ovu sliku ne možemo upotrijebiti.",
			"We cannot use this picture."),
	THUMBNAIL_EXISTS(HttpStatus.CONFLICT,
			"Ova priča već ima sličicu.",
			"This story already has a picture."),
	THUMBNAIL_REFUSED(HttpStatus.FORBIDDEN,
			"Ovoj priči ne možeš dodati sličicu.",
			"You cannot add a picture to this story."),
	INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR,
			"Nešto je pošlo po zlu. Pokušaj ponovno.",
			"Something went wrong. Please try again.");

	private final HttpStatus status;
	private final String hr;
	private final String en;

	ApiError(HttpStatus status, String hr, String en) {
		this.status = status;
		this.hr = hr;
		this.en = en;
	}

	public HttpStatus status() {
		return status;
	}

	public String message(String lang) {
		return "en".equalsIgnoreCase(lang) ? en : hr;
	}

	/** Thrown by services; turned into a JSON error body by {@link ApiExceptionHandler}. */
	public static class ApiException extends RuntimeException {

		private final ApiError error;
		private final String lang;

		public ApiException(ApiError error, String lang) {
			super(error.name());
			this.error = error;
			this.lang = lang;
		}

		public ApiError error() {
			return error;
		}

		public String lang() {
			return lang;
		}
	}

}
