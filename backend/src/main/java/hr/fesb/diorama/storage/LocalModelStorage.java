package hr.fesb.diorama.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Files on the local disk, served by the backend at {@code /api/files/**}. Used in mock mode so sample models
 * do not eat Supabase quota. URLs are relative so they work through the Vite dev proxy.
 */
public class LocalModelStorage implements ModelStorage {

	public static final String URL_PREFIX = "/api/files/";

	private final Path root;

	public LocalModelStorage(String directory) {
		this.root = Path.of(directory).toAbsolutePath().normalize();
		try {
			Files.createDirectories(root);
		}
		catch (IOException e) {
			throw new StorageException("could not create the local model directory", e);
		}
	}

	public Path root() {
		return root;
	}

	@Override
	public String put(String path, byte[] bytes, String contentType) {
		Path target = resolve(path);
		try {
			Files.createDirectories(target.getParent());
			// write-then-move so a browser never downloads a half-written model
			Path temp = Files.createTempFile(target.getParent(), "upload", ".tmp");
			Files.write(temp, bytes);
			Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
		}
		catch (IOException e) {
			throw new StorageException("could not store " + path, e);
		}
		return URL_PREFIX + path;
	}

	@Override
	public boolean serves(String url) {
		if (url == null || !url.startsWith(URL_PREFIX)) {
			return false;
		}
		try {
			return Files.isRegularFile(resolve(url.substring(URL_PREFIX.length())));
		}
		catch (IllegalArgumentException e) {
			return false;
		}
	}

	private Path resolve(String path) {
		if (path == null || !path.matches("[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*")) {
			throw new IllegalArgumentException("unsafe storage path");
		}
		Path target = root.resolve(path).normalize();
		if (!target.startsWith(root)) {
			throw new IllegalArgumentException("unsafe storage path");
		}
		return target;
	}

}
