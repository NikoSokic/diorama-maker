package hr.fesb.diorama.storage;

/** Where generated GLBs and thumbnails are re-hosted (Tripo's own URLs expire within minutes). */
public interface ModelStorage {

	String GLB = "model/gltf-binary";

	/**
	 * Stores (or replaces) a file.
	 *
	 * @param path relative path such as {@code <hash>/base.glb}
	 * @return the URL the browser loads it from
	 */
	String put(String path, byte[] bytes, String contentType);

	/** Whether a URL returned earlier by {@link #put} still points at a file this storage serves. */
	boolean serves(String url);

	/** Thrown when a file could not be stored. */
	class StorageException extends RuntimeException {

		public StorageException(String message, Throwable cause) {
			super(message, cause);
		}
	}

}
