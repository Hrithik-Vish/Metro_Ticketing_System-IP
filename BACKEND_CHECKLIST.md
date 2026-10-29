# Backend checklist: split, tighter rules, passwords

Run after `docker compose up --build` (Swagger: `http://localhost:8080/swagger-ui/index.html`, group **full-api**).
Every endpoint URL is the same as before the split; this list checks the new rules.

## 1. Controller split (nothing should have changed for the UI)
- Open the site and click through every page (stations, routes, fares, trains, schedules, tickets, users, maintenance): data loads.
- Book a ticket as `rider1` (demo checkout): it works as before.
- In Swagger the **full-api** group now shows one section per area (Authentication, Users, Stations, Routes, Fares, ...).

## 2. Update and delete rules
| Call | Expect |
|---|---|
| PUT `/api/stations/NOPE` with a station body | 404 "Station not found: NOPE" (it no longer creates one) |
| DELETE `/api/stations/NOPE` | 404 |
| DELETE `/api/stations/ST-CEN` | 409 "Station ST-CEN is still used by routes, route stops, fares, tickets, ..." |
| DELETE `/api/trains/TR-103` | 409 (used by schedules / maintenance issues) |
| DELETE `/api/users/rider1` | 409 (has a metro card / tickets) |
| POST `/api/stations` with an existing `stationId` | 409 "Station ID already exists" |
| POST `/api/stations` with no `stationId` | 400 "Station ID is required" |
| POST `/api/fares` with `baseFare` 0 or both stations equal | 400 |
| POST `/api/trains` with `capacity` 0 | 400 |
| POST `/api/schedules` with arrival before departure | 400 "Arrival must be later than departure" |
| POST `/api/schedules` with an unknown `trainId` | 400 "Train not found: ..." |
| DELETE a **route** you created yourself | 204, and its schedules and stops are gone too |
| Book with `METRO_CARD`, then DELETE that ticket | card balance goes back up (see `METROCARD_DEMO.md` step 17) |

## 3. Passwords and sign-up
| Call | Expect |
|---|---|
| POST `/api/auth/signin` `{"userId":"rider1","password":"rider123"}` | 200 (existing demo logins still work) |
| POST `/api/auth/signin` with a wrong password | 401 "Invalid user ID or password" |
| POST `/api/auth/signup` `{"userId":"newbie","firstName":"New","password":"secret1","contact":"new@example.com"}` | 201, role USER, then sign in works |
| POST `/api/auth/signup` the same body plus `"role":"ADMIN"` | 403 "Admin accounts can only be created by an administrator." |
| POST `/api/auth/signup` with `password` of 3 characters | 400, `errors.password` explains |
| POST `/api/users` with `"role":"ADMIN"` | 201 (admin accounts are created here) |
| GET `/api/users` | no `password` field anywhere |
| PUT `/api/users/newbie` `{"password":"changed123"}` | 200; signing in with the new password works, the old one fails |

In the Supabase table editor, the `password` column of every user now starts with `$2` (a BCrypt hash). Accounts that had a
plain-text password are converted automatically the first time the app starts.
