# syntax=docker/dockerfile:1
# Build: the tests are run by `mvnw verify` on the host/CI, not here (they start an embedded Postgres).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src src
# The cache mount keeps the downloaded dependencies between builds (BuildKit, the default builder).
RUN --mount=type=cache,target=/root/.m2 mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --home /app diorama && mkdir -p /app/data && chown -R diorama /app
USER diorama
COPY --from=build /src/target/diorama-0.0.1-SNAPSHOT.jar app.jar
# Local model files (mock mode) live in /app/data/files; mount a volume to keep them.
VOLUME /app/data
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
