# Metro Ticketing System

A simple Spring Boot and PostgreSQL implementation of the supplied ER diagram.

## Run with Docker

From this directory:

```bash
docker compose up --build
```

The API is available at `http://localhost:8080`.

Stop it with:

```bash
docker compose down
```

The database data remains in the `postgres_data` volume. To remove it too, run `docker compose down -v`.

## API examples

All endpoints use JSON and are under `/api`:

- `GET /api/users`, `POST /api/users`
- `GET /api/stations`, `POST /api/stations`
- `GET /api/routes`, `POST /api/routes`
- `GET /api/fares`, `POST /api/fares`
- `GET /api/tickets`, `POST /api/tickets`
- `GET /api/payments`, `POST /api/payments`

Use `PUT` and `DELETE` with `/{id}` for users, stations, routes, fares, and tickets. JPA creates the tables from the entities on first startup.
