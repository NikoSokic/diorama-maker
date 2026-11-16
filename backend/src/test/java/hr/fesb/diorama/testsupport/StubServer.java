package hr.fesb.diorama.testsupport;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * A scripted HTTP server on localhost for client tests: real sockets and real HTTP parsing, no external calls.
 * Replies for a route are served in order; the last one repeats.
 */
public final class StubServer implements AutoCloseable {

	/** @param headers names are lower case */
	public record Request(String method, String path, Map<String, String> headers, String body) {
	}

	public record Reply(int status, byte[] body, Map<String, String> headers) {

		public static Reply json(int status, String body) {
			return new Reply(status, body.getBytes(StandardCharsets.UTF_8), Map.of("Content-Type", "application/json"));
		}

		public static Reply bytes(byte[] body) {
			return new Reply(200, body, Map.of());
		}

		public Reply header(String name, String value) {
			Map<String, String> all = new HashMap<>(headers);
			all.put(name, value);
			return new Reply(status, body, all);
		}
	}

	private final HttpServer server;
	private final List<Request> requests = new CopyOnWriteArrayList<>();
	private final Map<String, Deque<Reply>> routes = new ConcurrentHashMap<>();

	public StubServer() {
		try {
			server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		server.createContext("/", this::handle);
		server.start();
	}

	public String url() {
		return "http://127.0.0.1:" + server.getAddress().getPort();
	}

	public StubServer on(String method, String path, Reply... replies) {
		routes.put(method + " " + path, new ArrayDeque<>(List.of(replies)));
		return this;
	}

	public List<Request> requests() {
		return requests;
	}

	public List<Request> requests(String method, String path) {
		return requests.stream().filter(r -> r.method().equals(method) && r.path().equals(path)).toList();
	}

	private void handle(HttpExchange exchange) throws IOException {
		Map<String, String> headers = new HashMap<>();
		exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(Locale.ROOT), String.join(",", values)));
		String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
		String path = exchange.getRequestURI().getPath();
		requests.add(new Request(exchange.getRequestMethod(), path, headers, body));

		Reply reply;
		Deque<Reply> queue = routes.get(exchange.getRequestMethod() + " " + path);
		synchronized (this) {
			reply = queue == null ? Reply.json(404, "{\"code\":4001,\"message\":\"no stub for this route\"}")
					: queue.size() > 1 ? queue.poll() : queue.peek();
		}
		reply.headers().forEach((name, value) -> exchange.getResponseHeaders().add(name, value));
		exchange.sendResponseHeaders(reply.status(), reply.body().length == 0 ? -1 : reply.body().length);
		if (reply.body().length > 0) {
			try (OutputStream out = exchange.getResponseBody()) {
				out.write(reply.body());
			}
		}
		exchange.close();
	}

	private boolean closed;

	@Override
	public synchronized void close() {
		if (!closed) {
			closed = true;
			server.stop(0);
		}
	}

}
