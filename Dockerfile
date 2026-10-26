FROM eclipse-temurin:25-jdk

# The app uses LocalDateTime values without timezone offsets; keep backend dates aligned with the India-based UI.
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw -q -DskipTests package

EXPOSE 8080
ENTRYPOINT ["java", "-Duser.timezone=Asia/Kolkata", "-jar", "target/metro-ticketing-0.0.1-SNAPSHOT.jar"]
