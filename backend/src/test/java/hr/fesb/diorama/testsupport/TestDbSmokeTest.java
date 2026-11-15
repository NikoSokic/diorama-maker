package hr.fesb.diorama.testsupport;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/** The Flyway migrations apply cleanly to a real Postgres. */
class TestDbSmokeTest {

	@Test
	void migrationsCreateTheSchema() throws Exception {
		String url = TestDb.newDatabaseUrl();
		Flyway.configure().dataSource(url, "postgres", "").load().migrate();
		try (Connection connection = DriverManager.getConnection(url, "postgres", "");
				ResultSet tables = connection.createStatement().executeQuery(
						"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' "
								+ "AND table_name IN ('stories', 'story_characters', 'models')")) {
			tables.next();
			assertThat(tables.getInt(1)).isEqualTo(3);
		}
	}

}
