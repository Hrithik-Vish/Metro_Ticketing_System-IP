FROM eclipse-temurin:25-jdk

WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw -q -DskipTests package

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "target/metro-ticketing-0.0.1-SNAPSHOT.jar"]
