# Deployable image: frontend build embedded into the backend jar's static
# resources, served by Spring Boot from one container. Build context is the
# repo root (both frontend/ and backend/ are needed), e.g.:
#   docker build -t naranote .
# or via docker-compose.prod.yml.

FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM eclipse-temurin:21-jdk AS backend-build
WORKDIR /backend
COPY backend/mvnw backend/pom.xml ./
COPY backend/.mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B
COPY backend/src src
# backend/src/main/resources/static is empty in source control — this is
# where Spring Boot's default static resource handler looks, so dropping
# the built frontend here is what makes one jar serve both.
COPY --from=frontend-build /frontend/dist src/main/resources/static
# Skipped here, not silently: NaraNoteApplicationTests is a @SpringBootTest
# needing a live Postgres, which a docker build stage has no network path
# to. `mvnw test` against the running db service stays the real test path.
RUN ./mvnw -DskipTests package -B

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=backend-build /backend/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
