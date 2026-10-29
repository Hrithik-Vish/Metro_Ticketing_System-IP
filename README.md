<div align="center">

# 🚇 Metro Ticketing System

**A full-stack metro ticketing and network-management web app, with passenger and admin experiences, metro-card wallets, fare-aware booking and a live REST API.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://metro-ticketing-system-ip.onrender.com/)
[![Swagger](https://img.shields.io/badge/API_Docs-Swagger_UI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](https://metro-ticketing-system-ip.onrender.com/swagger-ui/index.html)

![Java](https://img.shields.io/badge/Java-21-ED8B02?logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E?logo=javascript&logoColor=black)

</div>

---

## 🔗 Live links

| | Link |
|---|---|
| 🌐 **Web app** | https://metro-ticketing-system-ip.onrender.com/ |
| 📘 **Swagger UI** | https://metro-ticketing-system-ip.onrender.com/swagger-ui/index.html |
| 📄 **OpenAPI JSON** | https://metro-ticketing-system-ip.onrender.com/v3/api-docs |

> ⏳ The app runs on Render's free tier, so the **first request after a quiet period can take up to a minute** while the service wakes up.
> 🧹 If the page ever looks stale after an update, hard refresh with `Ctrl + Shift + R`.

> **Project scope:** an academic/demo system. Payments and tickets are simulated. There is no real payment gateway, metro control system or live train tracking.

---

## ✨ Features

### 🧑 Passenger
- Sign up and sign in
- Explore the network: stations, routes, interchanges and an animated metro-scene background
- Journey planner with a connected-route check and transfer-aware shortest path
- Step-by-step ticket booking (**Single**, **Return**, **Day Pass**) for 1 or more passengers
- Pay with the **demo checkout** or a **metro card**
- Digital ticket wallet, with a **downloadable ticket** (HTML that can be printed or saved as PDF)
- Metro card balance, top-up, time passes and a transaction ledger
- Station departure panels based on active schedules
- 🌗 Light and dark theme

### 🛠 Admin
- Manage **users, stations, routes, route stops, fares, trains, schedules, tickets, payments, metro cards and maintenance issues**
- Add or remove ordered intermediate stops on a route (endpoints are protected)
- Issue tickets on behalf of a passenger
- Activate, deactivate, edit and safely delete records. Records that are still referenced elsewhere are protected from deletion.
- Resolve maintenance issues

### 💳 Metro cards
- One active card per passenger
- Top-up, balance patching and full replacement (`PATCH` vs `PUT`)
- Time passes: an active pass makes a metro-card booking free
- Every fare, refund and top-up writes a ledger row
- Deleting a ticket refunds the fare to the card

---

## 🧱 Architecture

```text
 Browser (HTML + CSS + vanilla JS)
            │   same origin: /api/*
            ▼
 ┌─────────────────────────────┐
 │  Spring Boot 4 (Java 21)    │   served from one Render Docker service
 │  • static frontend          │
 │  • REST controllers         │
 │  • services / validation    │
 │  • JPA / Hibernate          │
 └──────────────┬──────────────┘
                ▼
     Supabase PostgreSQL (Session pooler)
```

One Spring Boot service serves **both** the frontend (static files) and the REST API, so there is no separate frontend host and no CORS setup.

---

## 🛠 Tech stack

| Layer | Technology |
|---|---|
| Language / runtime | Java 21 |
| Backend | Spring Boot 4.1, Spring Web MVC, Spring Data JPA, Bean Validation |
| Security | `spring-security-crypto` (BCrypt password hashing) |
| Database | PostgreSQL (Supabase in production, Docker Postgres locally, H2 for preview and tests) |
| API docs | springdoc-openapi 3.2 (Swagger UI) |
| Frontend | HTML, CSS, vanilla JavaScript (no build step) |
| Build / deploy | Maven wrapper, multi-stage Dockerfile, Render |

---

## 📁 Project structure

```text
Metro Ticketing System
│
├── Dockerfile · render.yaml · docker-compose.yml · pom.xml
├── mvnw · mvnw.cmd · .mvn/wrapper/
├── README.md · DEPLOY.md · METROCARD_DEMO.md · START_PREVIEW.cmd
│
└── src
    ├── main
    │   ├── java/com/example/demo
    │   │   ├── DemoApplication.java
    │   │   ├── DataInitializer.java        # seed data on first start
    │   │   ├── controller/                 # one controller per area, each with a Swagger tag
    │   │   │   ├── Auth · User · Station · Route · RouteStation · Fare
    │   │   │   ├── Train · Schedule · MaintenanceIssue
    │   │   │   └── Booking · Ticket · Payment · MetroCard
    │   │   ├── service/                    # BookingService, PasswordService
    │   │   ├── dto/                        # request / response bodies
    │   │   ├── entity/                     # 13 JPA entities
    │   │   ├── repository/                 # 13 Spring Data repositories
    │   │   ├── exception/                  # Errors helpers, GlobalExceptionHandler
    │   │   └── config/                     # OpenApiConfig, PasswordConfig
    │   └── resources
    │       ├── application.properties
    │       ├── application-preview.properties
    │       └── static/                     # frontend: index.html, styles.css, metro-theme.css,
    │                                       #           scene-map.js, core.js, views.js, app.js
    └── test
        ├── java/com/example/demo/DemoApplicationTests.java
        └── resources/application-test.properties
```

---

## 🔌 REST API overview

Full interactive docs live in [Swagger UI](https://metro-ticketing-system-ip.onrender.com/swagger-ui/index.html). Use the group selector at the top right: **metro-cards** is shown first, **full-api** shows everything.

| Area | Base path | Operations |
|---|---|---|
| Authentication | `/api/auth` | `POST /signin`, `POST /signup` |
| Users | `/api/users` | list, create, update, delete, `GET /{id}/tickets` |
| Stations | `/api/stations` | list, create, update, delete |
| Routes | `/api/routes` | list, create, update, delete, `GET /{id}/stations`, `POST /{id}/stops`, `DELETE /{id}/stops/{stopId}` |
| Route-stations | `/api/route-stations` | list, create, delete |
| Fares | `/api/fares` | list, create, update, delete |
| Trains | `/api/trains` | list, create, update, delete |
| Schedules | `/api/schedules` | list, create, update, delete |
| Maintenance | `/api/maintenance-issues` | list, create, update, delete |
| Bookings | `/api/bookings` | `POST` (validated, transactional booking plus payment) |
| Tickets | `/api/tickets` | list, create, update, delete (refunds card payments) |
| Payments | `/api/payments` | list, create |
| Metro cards | `/api/metro-cards` | list, get, create, `PUT`, `PATCH`, `POST /{id}/top-up`, `GET`/`POST /{id}/passes`, `GET /{id}/transactions`, delete |

**Quick API test** in Swagger: `POST /api/auth/signin` with

```json
{ "userId": "admin", "password": "admin123" }
```

A `200` response with the user profile (no password) means the app and database are healthy.

---

## 🔐 Demo accounts (seeded on first start)

| Role | User ID | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Admin | `operator1` | `operator123` |
| Passenger | `rider1` | `rider123` |
| Passenger | `rider2` | `rider123` |

Seed data also includes 5 stations (Central, University, Market, Airport, Riverside), 3 routes (Blue Line, Airport Express, River Connector) with Central as an interchange, trains, schedules, fares, and metro cards `MC-1001` (rider1, 500.00) and `MC-1002` (rider2, 150.00).

> 🔒 Passwords are stored as BCrypt hashes. Sign-up **always creates a passenger**. Admin accounts can only be created by an administrator through `POST /api/users`.
> ⚠️ These are demo credentials. The API has no token-based authorization, so don't store real data in it.

---

## 🎟 Fare and ticket rules (demo)

| Ticket | Price | Validity |
|---|---|---|
| `SINGLE` | 1× one-way fare | 2 hours |
| `RETURN` | 2× one-way fare | 24 hours |
| `DAY_PASS` | 3× one-way fare | until the end of the current local day |

- A configured direct fare is used when present. Otherwise the fare is derived from the segment fares along the route, and the demo treats fares as symmetric.
- Booking is blocked when there is no connected path, a station is closed, the passenger account is ineligible, or a required fare is missing.
- Journey time follows the travelled part of each route, including transfers.

---

## 🚀 Run locally

**Prerequisites:** JDK 21, or just Docker.

### Option 1: instant preview (no database needed)

Uses an in-memory H2 database.

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=preview
```

On Windows you can double-click `START_PREVIEW.cmd`. Then open http://localhost:8080.

### Option 2: Docker Compose (app plus PostgreSQL)

```bash
docker compose up --build
```

App: http://localhost:8080. Swagger: http://localhost:8080/swagger-ui/index.html. Postgres is exposed on port `5432` (database `metrodb`, user and password `postgres`).

### Option 3: your own PostgreSQL

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/metrodb
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=postgres
./mvnw spring-boot:run
```

### Tests

```bash
./mvnw test
```

---

## ☁️ Deployment

Production runs as a single **Docker web service on Render** connected to a **Supabase PostgreSQL** database. See [DEPLOY.md](DEPLOY.md) for the full walkthrough.

| Environment variable | Purpose |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require` (use the Supabase **Session pooler**) |
| `SPRING_DATASOURCE_USERNAME` | e.g. `postgres.<project-ref>` |
| `SPRING_DATASOURCE_PASSWORD` | your database password |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `update` (tables are created automatically) |
| `DB_POOL_SIZE` | optional, default `5` |
| `PORT` | provided by Render |

The Dockerfile builds the jar in one stage and runs it on a slim JRE in a second, with the timezone set to `Asia/Kolkata` so backend and UI dates agree.

> **Repo hygiene:** never commit `target/` or `.vscode/`. Both are in `.gitignore`.

---

## 🧪 Guided API demo

[METROCARD_DEMO.md](METROCARD_DEMO.md) has a 20-step Swagger script covering metro-card create, patch, put, top-up, booking, refund and error cases.

---

## 📝 Notes and limitations

- Payments are simulated. The QR-style graphic on tickets is visual only and is not scannable.
- Departure times shown at intermediate stops are estimates derived from the route's scheduled travel time.
- The free Render and Supabase tiers may sleep when idle, so expect a slow first load.

---

<div align="center">

Built as a college project · Spring Boot · PostgreSQL · Vanilla JS

</div>
