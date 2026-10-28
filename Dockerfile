# ---- Build stage: compile and package the jar ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw -q -DskipTests package

# ---- Run stage: small JRE-only image, tuned for faster startup ----
FROM eclipse-temurin:21-jre
# The app uses LocalDateTime values without timezone offsets; keep backend dates aligned with the India-based UI.
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY --from=build /app/target/metro-ticketing-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-XX:TieredStopAtLevel=1", "-XX:+UseSerialGC", "-XX:MaxRAMPercentage=75", "-Duser.timezone=Asia/Kolkata", "-jar", "app.jar"]
