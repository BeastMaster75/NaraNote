# Dev only. Source is bind-mounted at runtime (see docker-compose.yml), not
# copied in here — this image just carries the JDK and a warm dependency
# cache so `docker compose up` doesn't re-download Maven's world every start.
FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

COPY docker-dev-watch.sh ./
# Strip CR in case this was checked out with CRLF line endings (Windows) —
# a shebang line ending in \r fails to exec on Linux.
RUN sed -i 's/\r$//' docker-dev-watch.sh && chmod +x docker-dev-watch.sh

CMD ["./docker-dev-watch.sh"]
