# Metro Ticketing System — Repair Notes

This package contains an offline repair pass for the college demonstration project. It has **not** been deployed to Render, and no write requests or schema changes were sent to the live Supabase database while preparing it.

## Changes made

### Ticket booking and fares
- Added a transactional `POST /api/bookings` flow so a booking is validated and the demo ticket and simulated payment are saved together.
- Blocked booking when there is no connected path, the stations are closed, a passenger account is not eligible, or a required one-way/segment fare is missing.
- Added transfer-aware shortest-path calculation across adjacent stops and interchanges. The estimated journey time now reflects the travelled part of each route rather than always using the entire route duration.
- Made the UI and backend use the same demo fare rules. A configured direct fare is used when present; otherwise, single/return fares are derived from configured segment fares. The demo treats fares as symmetric when only the reverse direction is configured.
- Defined demo ticket-type rules: `SINGLE` uses a one-way fare and 2-hour validity; `RETURN` uses twice the one-way fare and 24-hour validity; `DAY_PASS` costs the highest positive configured base fare and remains valid until the end of the current local day. A day pass still requires a connected journey and at least one configured positive fare. These are explicit demo rules, not a claim about any real metro's fare policy.
- Added a persisted `passengerCount` field to tickets. Existing rows that predate the field display as one passenger; new bookings retain the selected count.
- Used local date/time formatting consistently and configured the Docker runtime timezone to `Asia/Kolkata` so frontend and backend `LocalDateTime` values remain aligned for the India-based demonstration.
- Ticket cancellation/deletion now removes the associated simulated payment record, and the frontend summaries ignore payments without a corresponding ticket.
- Added a real ticket download as an HTML file that can be printed or saved as PDF. The ticket's QR-style illustration is still explicitly visual-only and is not a scannable fare-validation code.

### Schedules and network
- Station departure panels filter out inactive schedules/trains, weekdays that do not match, schedules outside their validity range, and departures already passed at the station. The station display estimates the departure time at intermediate stops from the route's scheduled travel time.
- Added explicit validity dates when creating schedules and checks to keep schedule dates and weekdays consistent.
- Added/updated the original demo weekly timetable only when the database matches the exact legacy demo schedule seed. This avoids repopulating arbitrary schedules that a user deliberately removed.
- Added the Central interchange stop to the original seeded Green route only when the stored route matches the known original two-stop demo configuration.
- Fixed interchange rendering so a shared station marker appears on each route lane. Route line colours are restricted to supported hex-colour values before being used in SVG.
- The dashboard's simulated status updates refresh once per minute. When a route has no timetable at all, the station panel labels illustrative arrivals as illustrative instead of presenting them as a configured schedule.

### Administration and form behaviour
- Added an admin-visible “Issue Ticket” navigation entry and passenger selection for administrator-issued tickets.
- Added route creation and ordered intermediate-stop insertion/removal, preserving route endpoints and resequencing stops.
- Added the missing administrative row actions for editing, toggling active state, deleting safe-to-delete records, and resolving maintenance issues. Reference checks prevent deleting records that are already used by other data in the normal UI workflows.
- Added normal form checks for required fields, duplicate IDs, positive fare amounts, valid passenger counts, schedule time/date consistency, active train/passenger selections, and relevant numeric values.
- Fixed sign-in/sign-up messaging so data-loading errors do not get followed by a misleading success message.
- Prevented the demo ticket from being seeded again on every restart after a user deletes all tickets. The seed ticket is now created only when the database was genuinely empty at initial startup.

### Dependency compatibility
- Updated Springdoc OpenAPI to `3.2.0`, which aligns with the project's Spring Boot 4.1.x line per the upstream compatibility information: https://github.com/springdoc/springdoc-openapi and https://springdoc.org/faq.html.
- Made the Maven wrapper executable in this ZIP and retained the Docker build's existing executable-bit step.

## Verification performed

- `node --check src/main/resources/static/app.js` — passed.
- HTML parse and duplicate-ID check — passed (186 IDs checked, no duplicate IDs; all 13 forms have IDs).
- `pom.xml` XML parse — passed.
- Browser integration tests run against the project's actual HTML, CSS, and JavaScript with an isolated in-memory mock API (no Render/Supabase writes): **23/23 passed**, with no browser page errors and no mock API errors. The checks cover signup validation, signin, transfer fares, multi-passenger return booking, ticket persistence across refresh, ticket download, segment-fare handling, day-pass handling, schedule filtering and station offsets, cancellation state, interchange rendering, admin booking, route creation, and ordered stop edits.

## Verification limitation

The Java/Maven build could not be completed in the repair environment. The project specifies Java 25; only Java 21 is installed here, no system Maven is available, and the Maven wrapper could not download its Maven distribution due to network restrictions in this environment. As a result, this package should be built and smoke-tested once after extraction in an environment with Java 25/network access (or through your Render build). I am not claiming a successful Java compilation or live Supabase integration test.

## Deploying

This package is a local repaired copy only. The live Render deployment does not change until you deploy this ZIP/version. The new ticket passenger-count field is compatible with the project's existing `spring.jpa.hibernate.ddl-auto=update` setting, which should add the column on application startup; no manual change was made to the live database. Keep a Supabase backup before redeploying, as good practice.
