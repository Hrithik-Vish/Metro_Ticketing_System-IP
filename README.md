# Metro Ticketing System

A full-stack metro ticketing and metro-network management application built with **Spring Boot, Java, PostgreSQL, JPA/Hibernate, HTML, CSS, and vanilla JavaScript**.

The project models both sides of a metro system:

- **Passenger side:** account creation, sign in, metro-network exploration, fare lookup, ticket booking, demo payment, digital tickets, ticket wallet, metro-card information, and profile information.
- **Admin side:** management of users, stations, routes, route-station mappings, fares, trains, schedules, tickets, payments, metro cards, and maintenance issues.

The application is deployed on **Render** and uses **Supabase PostgreSQL** as its production database. For local development, Docker Compose can run the Spring Boot application together with a local PostgreSQL container.

> **Project scope:** This is an academic/demo metro system. The application simulates payment and ticketing workflows; it is not connected to a real payment gateway, metro control system, or live train-tracking service.

---

## 1. What the Project Does

At a high level, the system works like this:

```text
Passenger / Admin
        |
        v
    Web Frontend
        |
        v
      Render
        |
        v
   Spring Boot App
        |
        v
      REST API
        |
        v
Supabase PostgreSQL
```

The same application provides two role-based experiences:

```text
                    Metro Ticketing System
                             |
                +------------+------------+
                |                         |
                v                         v
             Passenger                 Admin
                |                         |
                v                         v
        Passenger Features        Management Features
```

### Passenger capabilities

- Sign up and sign in
- Explore stations and metro routes
- View route/station relationships
- View schedule information
- Select source and destination stations
- Find the applicable fare
- Select passenger count and ticket type
- Calculate total fare
- Complete a simulated/demo checkout
- Generate a digital ticket
- View a QR-style ticket visual
- View previously created tickets
- Cancel/delete a ticket
- View metro-card information
- View profile information
- Log out

### Admin capabilities

The admin dashboard provides CRUD-style management for:

- Users
- Stations
- Routes
- Route-station mappings
- Fares
- Trains
- Schedules
- Tickets
- Payments
- Metro cards
- Maintenance issues

---

## 2. Complete Project Structure

There are **73 files in the supplied ZIP**.

Of these, **41 are meaningful source/config/test/project files**. The remaining **32 files are Maven-generated files under `target/`** and can be recreated by building the project.

```text
Metro Ticketing System
|
+-- PROJECT / DEPLOYMENT
|   +-- .dockerignore
|   +-- .mvn/wrapper/maven-wrapper.properties
|   +-- pom.xml
|   +-- Dockerfile
|   +-- docker-compose.yml
|   +-- render.yaml
|   +-- README.md
|   +-- DEPLOY.md
|   +-- mvnw
|   +-- mvnw.cmd
|
+-- BACKEND
|   |
|   +-- DemoApplication.java
|   +-- DataInitializer.java
|   |
|   +-- controller
|   |   +-- MetroController.java
|   |
|   +-- entity
|   |   +-- User.java
|   |   +-- Station.java
|   |   +-- Route.java
|   |   +-- RouteStation.java
|   |   +-- Fare.java
|   |   +-- Ticket.java
|   |   +-- Payment.java
|   |   +-- Train.java
|   |   +-- Schedule.java
|   |   +-- MetroCard.java
|   |   +-- MaintenanceIssue.java
|   |
|   +-- repository
|       +-- UserRepository.java
|       +-- StationRepository.java
|       +-- RouteRepository.java
|       +-- RouteStationRepository.java
|       +-- FareRepository.java
|       +-- TicketRepository.java
|       +-- PaymentRepository.java
|       +-- TrainRepository.java
|       +-- ScheduleRepository.java
|       +-- MetroCardRepository.java
|       +-- MaintenanceIssueRepository.java
|
+-- CONFIG
|   +-- application.properties
|
+-- FRONTEND
|   +-- index.html
|   +-- styles.css
|   +-- app.js
|
+-- TESTS
|   +-- DemoApplicationTests.java
|   +-- application-test.properties
|
+-- target/
    +-- 32 generated build files
```

---

## 3. File-by-File Guide

### 3.1 Project / Deployment Files

| File | What it holds / does |
|---|---|
| `.dockerignore` | Lists files and directories that should not be sent into the Docker build context. |
| `.mvn/wrapper/maven-wrapper.properties` | Maven Wrapper configuration. Pins the Maven distribution used by the project. |
| `pom.xml` | Main Maven project definition. Declares Java/Spring Boot versions, dependencies, test dependencies, OpenAPI support, and the Spring Boot Maven plugin. |
| `Dockerfile` | Builds the Spring Boot application into a Docker image using Eclipse Temurin JDK 25, runs the Maven build, exposes port 8080, and starts the generated JAR. |
| `docker-compose.yml` | Defines the local two-container environment: PostgreSQL plus the Spring Boot app. Also configures the PostgreSQL volume and health check. |
| `render.yaml` | Render deployment manifest. Defines the web service, Dockerfile path, free plan, and database-related environment variables. |
| `README.md` | This document: project overview, architecture, setup, file descriptions, API reference, flows, database model, and limitations. |
| `DEPLOY.md` | Deployment-specific instructions for running the application on Render with a PostgreSQL database such as Supabase. |
| `mvnw` | Unix/Linux Maven Wrapper script for running Maven without relying on a globally installed Maven executable. |
| `mvnw.cmd` | Windows Maven Wrapper script. |

---

### 3.2 Backend Application Files

#### `DemoApplication.java`

The Spring Boot entry point.

Its job is to start the application and bootstrap the Spring application context.

```text
Run DemoApplication
        |
        v
Start Spring Boot
        |
        +--> Web server
        +--> JPA/Hibernate
        +--> Database connection
        +--> DataInitializer
```

---

#### `DataInitializer.java`

The application's **initial/demo data loader**.

It implements `CommandLineRunner` and inserts demo records when the application starts and the expected data has not already been populated.

It creates initial data for:

- Users
- Stations
- Routes
- Fares
- Tickets
- Payments
- Trains
- Route-station mappings
- Schedules
- Metro cards
- Maintenance issues

It also contains helper methods for constructing and saving the individual entities.

Example seeded roles include:

- `ADMIN`
- `USER`

Example demo accounts include `admin`, `operator1`, `rider1`, and `rider2`.

> The credentials are demo credentials and should not be reused for a real production system.

---

### 3.3 `controller/MetroController.java`

This is the **main REST controller for the entire backend**.

It is mapped under:

```text
/api
```

Rather than using one controller per domain object, this project centralizes the API endpoints in a single controller.

It handles:

- Authentication
- User CRUD
- Station CRUD
- Route CRUD
- Fare CRUD
- Ticket CRUD
- Payment creation/listing
- Train CRUD
- Schedule CRUD
- Metro-card CRUD
- Route-station operations
- Maintenance-issue CRUD
- Passenger-specific ticket lookup
- Route-specific ordered station lookup

The controller directly uses Spring Data repositories to read/write entities.

Simplified architecture:

```text
HTTP Request
     |
     v
MetroController
     |
     v
Repository
     |
     v
PostgreSQL
     |
     v
JSON Response
```

There is **no separate Service layer** in this project.

---

## 4. Database Model: 11 Entity Classes

The database schema is represented through the JPA entity classes. Hibernate/JPA uses these entity definitions to create/update the database schema.

There is no separate hand-written SQL schema file in the project.

| Entity file | Database table | What it represents |
|---|---|---|
| `User.java` | `users` | Passenger/admin/operator account information and role. |
| `Station.java` | `stations` | Metro station information, location, code, line color, opening date, and active state. |
| `Route.java` | `routes` | Metro line/route information such as name, endpoints, distance, travel time, and color. |
| `RouteStation.java` | `route_stations` | The relationship between a route and a station, including the station's sequence/order on the route. |
| `Fare.java` | `fares` | Base fare between a source station and destination station. |
| `Ticket.java` | `tickets` | Passenger journey/ticket record including source, destination, fare, type, validity, and used state. |
| `Payment.java` | `payments` | Payment record associated with a ticket and its amount/time. |
| `Train.java` | `trains` | Physical train information such as train number, capacity, coaches, manufacture year, and active state. |
| `Schedule.java` | `schedules` | A train running on a route at a defined day/time, with validity information. |
| `MetroCard.java` | `metro_cards` | Passenger metro-card record including balance, issue/expiry dates, and status. |
| `MaintenanceIssue.java` | `maintenance_issues` | Operational issue associated with a train and/or station, including type, description, priority, status, and resolution time. |

---

## 5. Entity Relationships

The core domain can be understood through these relationships:

```text
USER
 |
 +-----> TICKET ---------> PAYMENT
 |          |
 |          +-----> FARE
 |          |
 |          +-----> SOURCE STATION
 |          |
 |          +-----> DESTINATION STATION
 |
 +-----> METRO CARD
 |
 +-----> MAINTENANCE ISSUE

ROUTE
 |
 +-----> ROUTE-STATION <----- STATION
              |
              +-----> Station Sequence / Order

TRAIN
 |
 +-----> SCHEDULE ------> ROUTE
              |
              +-----> Day / Departure / Arrival

MAINTENANCE ISSUE
 |
 +-----> TRAIN
 +-----> STATION
 +-----> USER (reporter)
```

### Why `RouteStation` exists

A route contains multiple stations, and a station can conceptually appear on multiple routes. `RouteStation` acts as the mapping table and stores the order of stations along a route.

The repository method:

```java
findByRouteIdOrderBySequenceNumberAsc(...)
```

returns the stations for a route in the correct sequence.

### Why `Payment` is separate from `Ticket`

A ticket represents the travel entitlement/journey record. A payment represents the monetary record associated with that ticket. In the current project, the payment is a simulated/demo transaction rather than a real payment gateway transaction.

---

## 6. Repository Layer: 11 Repository Classes

All repositories use Spring Data JPA and mostly extend `JpaRepository`.

This means the standard database operations such as the following are available without handwritten SQL:

```text
findAll
findById
save
deleteById
existsById
count
```

| Repository | Purpose | Special logic |
|---|---|---|
| `UserRepository.java` | Database access for users | Standard JPA CRUD. |
| `StationRepository.java` | Database access for stations | Standard JPA CRUD. |
| `RouteRepository.java` | Database access for routes | Standard JPA CRUD. |
| `RouteStationRepository.java` | Database access for route-station mappings | Finds mappings for a route ordered by sequence number. |
| `FareRepository.java` | Database access for fares | Standard JPA CRUD. |
| `TicketRepository.java` | Database access for tickets | Finds tickets belonging to a specific passenger. |
| `PaymentRepository.java` | Database access for payments | Standard JPA CRUD. |
| `TrainRepository.java` | Database access for trains | Standard JPA CRUD. |
| `ScheduleRepository.java` | Database access for schedules | Standard JPA CRUD. |
| `MetroCardRepository.java` | Database access for metro cards | Standard JPA CRUD. |
| `MaintenanceIssueRepository.java` | Database access for maintenance issues | Standard JPA CRUD. |

Two domain-specific repository methods are especially important:

```java
TicketRepository.findByPassengerId(String passengerId)
```

Used for the passenger's ticket wallet.

```java
RouteStationRepository.findByRouteIdOrderBySequenceNumberAsc(String routeId)
```

Used to retrieve a route's stations in travel order.

---

## 7. Frontend Files

The frontend is a **single-page style application implemented with standard HTML, CSS, and vanilla JavaScript**. It is served by the Spring Boot application from `src/main/resources/static/`.

### `index.html`

Defines the frontend page structure for both roles.

It contains the UI for areas such as:

- Sign in
- Sign up
- Passenger dashboard
- Ticket booking
- Payment/checkout
- Digital ticket
- Ticket wallet
- Metro network exploration
- Metro card
- Profile
- Admin dashboard
- Admin management tables/forms

`index.html` is therefore the **HTML structure/skeleton of the application**.

---

### `styles.css`

Contains the application's visual design.

It controls things such as:

- Layout
- Navigation
- Cards
- Forms
- Buttons
- Tables
- Ticket visuals
- Metro-card visuals
- Network visuals
- Dark/light theme presentation
- Responsive layouts
- Animations and visual effects
- Reduced-motion behavior

`styles.css` is responsible for **how the application looks**, not how data is processed.

---

### `app.js`

This is the **main frontend logic file** and effectively the client-side application controller.

It handles:

- API communication
- Authentication UI behavior
- Current-user state
- Browser local storage
- Passenger navigation
- Admin navigation
- Loading stations/routes/fares/schedules/etc.
- Fare lookup and calculation
- Metro network processing
- Ticket creation
- Payment creation
- Ticket rendering
- Ticket cancellation
- QR-style ticket drawing
- Metro-card display
- Profile display
- Admin CRUD interactions
- Dashboard statistics/visuals
- Theme and frontend visual behaviors

A simplified frontend data cycle is:

```text
User interaction
      |
      v
JavaScript logic
      |
      v
HTTP request
      |
      v
Spring Boot REST API
      |
      v
JSON response
      |
      v
JavaScript processes response
      |
      v
Update page / frontend state
```

Some logic happens entirely in the browser, especially fare calculation, parts of the metro-network processing, ticket rendering, QR-style code drawing, and local-storage handling.

---

## 8. Frontend-to-Backend Architecture

The deployed application is a single Spring Boot web application that serves the static frontend and the REST API.

```text
                         BROWSER
                            |
                            v
                  +---------------------+
                  | HTML / CSS / JS     |
                  | index.html          |
                  | styles.css          |
                  | app.js              |
                  +----------+----------+
                             |
                             | HTTP / JSON
                             v
                      +--------------+
                      | Spring Boot  |
                      | REST API     |
                      +------+-------+
                             |
                             v
                    Spring Data JPA
                             |
                             v
                        Hibernate
                             |
                             v
                  +--------------------+
                  | PostgreSQL         |
                  | Supabase (prod.)   |
                  +--------------------+
```

There is no React/Angular/Vue frontend and no Node.js/Express backend in the current project.

---

## 9. Passenger Flow

The normal passenger journey is:

```text
Open Application
      |
      v
Sign Up / Sign In
      |
      v
Passenger Dashboard
      |
      +--------------------+
      |                    |
      v                    v
Explore Metro         Book Ticket
                            |
                            v
                     Select Source
                            |
                            v
                  Select Destination
                            |
                            v
                       Find Fare
                            |
                            v
                  Select Passengers
                            |
                            v
                     Ticket Type
                            |
                            v
                    Calculate Fare
                            |
                            v
                     Review Trip
                            |
                            v
                   Demo Checkout
                            |
                            v
                    Create Ticket
                            |
                            v
                   Create Payment
                            |
                            v
                  Digital Ticket
                            |
                            v
                    QR-style Code
```

The passenger can also return to the dashboard and use:

```text
My Tickets
Metro Card
Profile
Explore Metro
Logout
```

### Ticket booking behavior

For a selected source and destination, the frontend loads the available fare data and looks for the applicable station pair. It also checks the reverse pair when necessary.

The total fare is calculated on the client side using the base fare and passenger count.

The booking then creates:

1. a ticket record; and
2. a payment record.

### Important limitation

The payment step is a **demo checkout**. No real payment provider is integrated.

The QR-style ticket graphic is also **visual/demo-only** and is not a production ticket-validation QR implementation.

---

## 10. Admin Flow

The admin journey is separate from the passenger experience.

```text
Admin Sign In
      |
      v
Admin Dashboard
      |
      v
Choose Management Area
      |
      +--> Users
      +--> Stations
      +--> Routes
      +--> Route-Stations
      +--> Fares
      +--> Trains
      +--> Schedules
      +--> Tickets
      +--> Payments
      +--> Metro Cards
      +--> Maintenance Issues
```

Most management areas support the common pattern:

```text
View
 |
 +--> Create
 |
 +--> Edit
 |
 +--> Delete
```

`Route-Stations` is used to manage the relationship between a route and stations, including station sequence.

`Schedules` connect a train with a route and define when it runs.

`Maintenance Issues` represent operational problems associated with stations and/or trains, along with priority and status information.

---

## 11. REST API Reference

All REST endpoints are under `/api`.

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/signin` | Authenticate an existing user. |
| `POST` | `/api/auth/signup` | Create a new user account. |

### Users

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/users` | Get all users. |
| `POST` | `/api/users` | Create a user. |
| `PUT` | `/api/users/{id}` | Update a user. |
| `DELETE` | `/api/users/{id}` | Delete a user. |
| `GET` | `/api/users/{id}/tickets` | Get tickets for a specific passenger. |

### Stations

```text
GET    /api/stations
POST   /api/stations
PUT    /api/stations/{id}
DELETE /api/stations/{id}
```

### Routes

```text
GET    /api/routes
POST   /api/routes
PUT    /api/routes/{id}
DELETE /api/routes/{id}
GET    /api/routes/{routeId}/stations
```

### Route-Stations

```text
GET    /api/route-stations
POST   /api/route-stations
DELETE /api/route-stations/{id}
```

The route-station controller logic uses sequence ordering when retrieving a route's stations.

### Fares

```text
GET    /api/fares
POST   /api/fares
PUT    /api/fares/{id}
DELETE /api/fares/{id}
```

### Tickets

```text
GET    /api/tickets
POST   /api/tickets
PUT    /api/tickets/{id}
DELETE /api/tickets/{id}
```

### Payments

```text
GET    /api/payments
POST   /api/payments
```

### Trains

```text
GET    /api/trains
POST   /api/trains
PUT    /api/trains/{id}
DELETE /api/trains/{id}
```

### Schedules

```text
GET    /api/schedules
POST   /api/schedules
PUT    /api/schedules/{id}
DELETE /api/schedules/{id}
```

### Metro Cards

```text
GET    /api/metro-cards
POST   /api/metro-cards
PUT    /api/metro-cards/{id}
DELETE /api/metro-cards/{id}
```

### Maintenance Issues

```text
GET    /api/maintenance-issues
POST   /api/maintenance-issues
PUT    /api/maintenance-issues/{id}
DELETE /api/maintenance-issues/{id}
```

---

## 12. Database and JPA Flow

The project does not use a manually maintained SQL schema file.

Instead:

```text
11 JPA Entity Classes
        |
        v
Hibernate / JPA
        |
        v
PostgreSQL Tables
```

The relevant configuration is in:

```text
src/main/resources/application.properties
```

The default local configuration points to:

```text
Host: localhost
Port: 5432
Database: metrodb
Username: postgres
Password: postgres
```

In production, these values are supplied through environment variables and point to the Supabase PostgreSQL database.

The project uses:

```text
spring.jpa.hibernate.ddl-auto=update
```

by default, so Hibernate updates the database schema from the entity model rather than using Flyway or Liquibase migration files.

---

## 13. Startup and Demo Data Flow

When the application starts:

```text
Spring Boot Starts
        |
        v
DataInitializer Runs
        |
        v
Check Existing Data
        |
     +--+--+
     |     |
   Needed  Already Present
     |     |
     v     v
Seed     Continue
Demo Data
     |     |
     +--+--+
        |
        v
   PostgreSQL
```

This is why a fresh database can immediately contain a usable demo metro network.

---

## 14. Local Development with Docker

### Requirements

- Docker Desktop
- Docker Compose support

### Start the application

From the project root:

```bash
docker compose up --build
```

The application becomes available at:

```text
http://localhost:8080
```

Because the frontend is served by Spring Boot, the same URL provides the web interface and its `/api` endpoints.

### Stop the application

```bash
docker compose down
```

### Remove the database volume too

```bash
docker compose down -v
```

### Local Docker architecture

```text
Docker Compose
      |
      +-----------------------+
      |                       |
      v                       v
Spring Boot Container   PostgreSQL Container
      |                       |
      +-----------+-----------+
                  |
                  v
           postgres_data
             volume
```

The PostgreSQL container uses `postgres:17` in the current Compose configuration.

---

## 15. Production Deployment

The application is deployed using **Render** for the Spring Boot service and **Supabase PostgreSQL** for the production database.

```text
                        Internet
                           |
                           v
                        Render
                           |
                           v
                 Spring Boot Docker App
                           |
                           v
                    Supabase PostgreSQL
```

### Render configuration

`render.yaml` defines:

- a Docker-based web service
- application name `metro-ticketing`
- `Dockerfile` as the build source
- required database environment variables
- `SPRING_JPA_HIBERNATE_DDL_AUTO=update`

The application reads its database connection details from environment variables.

### Important deployment files

```text
Dockerfile
render.yaml
DEPLOY.md
application.properties
```

`DEPLOY.md` contains the repository-specific deployment instructions.

---

## 16. Configuration

The main configuration file is:

```text
src/main/resources/application.properties
```

It configures:

- application name
- HTTP port
- PostgreSQL driver
- database URL
- database username/password
- Hibernate schema generation mode
- PostgreSQL dialect
- Open Session in View behavior

The port supports Render's `PORT` environment variable:

```properties
server.port=${PORT:8080}
```

The database configuration supports environment variables such as:

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
SPRING_JPA_HIBERNATE_DDL_AUTO
```

This allows the same codebase to run against local PostgreSQL or production Supabase PostgreSQL.

---

## 17. Testing

The project currently contains a small test setup rather than a large automated test suite.

### `DemoApplicationTests.java`

Contains a Spring Boot context-load test that verifies the application context can start.

### `application-test.properties`

Provides a test configuration using an **H2 in-memory database** rather than the production PostgreSQL database.

Conceptually:

```text
Tests
  |
  v
Spring Boot
  |
  v
H2 In-Memory DB
```

The test suite is therefore mainly a startup/integration sanity check at present.

---

## 18. Technology Stack

### Backend

- **Java 25**
- **Spring Boot 4.1.0**
- Spring Web
- Spring Data JPA
- Hibernate
- PostgreSQL
- Springdoc OpenAPI 2.2.0

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Browser `localStorage`
- Canvas API for the QR-style ticket visual

### Testing

- Spring Boot test support
- H2 in-memory database

### Build / DevOps

- Maven
- Maven Wrapper
- Docker
- Docker Compose
- Render
- Supabase PostgreSQL

---

## 19. Important Architectural Characteristics

### Single Spring Boot application

The frontend and backend are not separate deployed applications.

```text
Spring Boot
 |
 +--> Serves static frontend
 |
 +--> Provides REST API
 |
 +--> Connects to PostgreSQL
```

### Single REST controller

The current project centralizes API endpoints in `MetroController.java` rather than splitting them into many controller classes.

### Repository-driven database access

The controller talks directly to Spring Data JPA repositories. There is no dedicated business/service layer in the current structure.

### Client-side application logic

Some application/business logic lives in `app.js`, especially:

- fare calculation
- reverse fare lookup
- route/station processing
- ticket rendering
- QR-style code drawing
- local-storage user state

---

## 20. Security and Production Limitations

This project is suitable as an academic/demo system, but the current implementation should not be treated as production-ready security architecture.

Important limitations include:

- No Spring Security configuration
- No JWT/OAuth authentication flow
- Authentication is implemented directly in the controller
- Passwords are stored as plain text in the current database model
- Role handling is primarily enforced by the frontend UI rather than a full backend authorization layer
- Demo credentials are seeded automatically
- Payment processing is simulated
- QR generation is visual/demo-only
- Ticket cancellation deletes the ticket record rather than preserving a full cancellation/audit history
- No live metro telemetry or train tracking
- No real-time passenger occupancy system
- No real-world metro gate validation system
- No Flyway/Liquibase migration history
- Test coverage is minimal

These limitations are not hidden implementation details; they are part of the current project's scope and should be considered before using the project beyond a demonstration/academic context.

---

## 21. Generated `target/` Directory

The supplied ZIP contains a `target/` directory with **32 generated files**.

These include:

- compiled `.class` files for the Java application
- compiled controller/entity/repository classes
- copied `application.properties`
- copied frontend files
- compiled test classes
- test resources

They are generated by Maven and are **not additional source features**.

For example:

```text
src/main/java/.../User.java
            |
            | Maven compile
            v
 target/classes/.../User.class
```

and:

```text
src/main/resources/static/app.js
            |
            | Maven package
            v
 target/classes/static/app.js
```

Normally, `target/` can be deleted and recreated with a Maven build.

---

## 22. How the Whole System Fits Together

The complete architecture can be summarized as:

```text
                         METRO TICKETING SYSTEM
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
                PASSENGER                      ADMIN
                    |                             |
                    +--------------+--------------+
                                   |
                                   v
                              WEB FRONTEND
                                   |
                        index.html / styles.css
                              / app.js
                                   |
                             HTTP / JSON
                                   |
                                   v
                              SPRING BOOT
                                   |
                         MetroController.java
                                   |
                         Spring Data JPA
                                   |
                               Hibernate
                                   |
                                   v
                         SUPABASE POSTGRESQL
                                   |
          +--------+-------+-------+--------+--------+------+
          |        |       |       |        |        |      |
        Users  Stations Routes  Fares   Tickets Payments Trains
          |        |       |       |        |        |      |
          |        +--- RouteStations    Schedules     |
          |                                             |
          +---------------- Metro Cards ---------------+
                                   |
                         Maintenance Issues
```

The essential principle is:

> **The frontend provides the user experience, Spring Boot provides the REST API and application entry point, JPA/Hibernate maps the Java domain model to PostgreSQL, and Supabase provides the production PostgreSQL database.**

---

## 23. Quick Mental Model for the Source Code

When trying to understand the codebase, start with these files in this order:

```text
1. README.md
       |
       v
2. DemoApplication.java
       |
       v
3. MetroController.java
       |
       +--> entity/*.java
       |
       +--> repository/*.java
       |
       v
4. DataInitializer.java
       |
       v
5. index.html
       |
       v
6. app.js
       |
       v
7. application.properties
       |
       v
8. Dockerfile / docker-compose.yml / render.yaml
```

This gives a useful reading order:

```text
What is it?
    -> How does it start?
    -> What APIs exist?
    -> What data exists?
    -> How is data accessed?
    -> What demo data is inserted?
    -> What does the user see?
    -> How does the frontend behave?
    -> How is the app configured?
    -> How is it deployed?
```

---

## 24. Project Summary

**Metro Ticketing System** is a database-driven full-stack academic application that models a simplified metro service.

Its main layers are:

```text
Frontend
    |
    +--> index.html
    +--> styles.css
    +--> app.js

Backend
    |
    +--> MetroController.java

Database Model
    |
    +--> 11 Entity classes
    +--> 11 Repository classes

Database Initialization
    |
    +--> DataInitializer.java

Persistence
    |
    +--> Hibernate / JPA
    +--> Supabase PostgreSQL (production)
```

Its two primary user experiences are:

```text
Passenger
   -> Explore Metro
   -> Book Ticket
   -> Demo Payment
   -> Receive Ticket
   -> Manage Tickets / Card / Profile

Admin
   -> Manage Users
   -> Manage Metro Network
   -> Manage Fares
   -> Manage Trains / Schedules
   -> Manage Tickets / Payments / Cards
   -> Manage Maintenance Issues
```

For development, the project can run with Docker Compose and local PostgreSQL. For the deployed system, Render hosts the Spring Boot application and Supabase hosts the PostgreSQL database.

