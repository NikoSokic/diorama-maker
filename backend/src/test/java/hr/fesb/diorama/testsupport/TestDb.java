package hr.fesb.diorama.testsupport;

import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicInteger;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;

/**
 * One real Postgres per test JVM (no Docker). Every caller gets its own empty database,
 * so Spring contexts with different settings never see each other's rows.
 */
public final class TestDb {

	private static final AtomicInteger COUNTER = new AtomicInteger();
	private static EmbeddedPostgres postgres;

	private TestDb() {
	}

	private static synchronized EmbeddedPostgres postgres() {
		if (postgres == null) {
			try {
				postgres = EmbeddedPostgres.builder().start();
			}
			catch (IOException e) {
				throw new IllegalStateException("could not start embedded Postgres", e);
			}
			Runtime.getRuntime().addShutdownHook(new Thread(() -> {
				try {
					postgres.close();
				}
				catch (IOException ignored) {
					// JVM is going down anyway
				}
			}));
		}
		return postgres;
	}

	/** Creates a fresh database and returns its JDBC URL (user {@code postgres}, no password). */
	public static String newDatabaseUrl() {
		EmbeddedPostgres pg = postgres();
		String name = "t" + COUNTER.incrementAndGet();
		try (Connection connection = pg.getPostgresDatabase().getConnection();
				Statement statement = connection.createStatement()) {
			statement.execute("CREATE DATABASE " + name);
		}
		catch (SQLException e) {
			throw new IllegalStateException("could not create test database", e);
		}
		return pg.getJdbcUrl("postgres", name);
	}

}
