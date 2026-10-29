# Frontend issue checklist and preview notes

The supplied `FRONTEND_ISSUES.md` was treated as a project checklist. Its contents do not override the user's request.

## Part A — backend alignment

- **A1:** API errors retain status and field details. Stale admin actions and ticket deletes reload data on failure.
- **A2:** Missing-record updates surface the server's 404 response.
- **A3:** Local reference guards remain; the nonexistent metro-card station reference was removed. Route deletion is a single transactional request.
- **A4:** Card-paid ticket cancellation/deletion reloads balances and reports actual refunds.
- **A5:** Checkout offers demo or eligible metro-card payment, shows available card information, updates balances, and labels payments.
- **A6:** Passenger/admin top-ups use a validated in-app amount form.
- **A7:** Admin password reset is available and password inputs cap at 72 characters.
- **A8:** Public signup creates passenger accounts only.
- **A9:** User forms use separate first/last names, optional last name, email validation, unique-ID checks, and field-level errors.
- **A10:** Station, route, fare, train, and schedule creation validates the documented requirements and surfaces server wording.
- **A11:** API URLs and Swagger endpoints remain unchanged.

## Part B — frontend issues

- **B1–B4:** Card issue/edit forms include issue/expiry dates and active state; ignored `createdAt` is omitted; edits use dialogs.
- **B5–B6:** Admin user form supports single names, inline validation, and an Email label.
- **B7:** Admin user creation can set an optional station and hire date. The server's supported roles remain USER and ADMIN.
- **B8:** User editing uses a role dropdown.
- **B9:** Demo sign-in remains prefilled for the supplied demo account.
- **B10–B11:** Station form includes code, coordinates, and opened date; schedule form includes validity dates.
- **B12:** Route creation supports ordered intermediate stops in the same form; existing routes can still be edited with the stop panel.
- **B13:** Edit and destructive confirmation actions use styled in-app dialogs. There are no `window.prompt()` or `window.confirm()` calls.
- **B14:** Successful add forms close their panels; mapped server/local validation errors highlight fields.
- **B15:** Slow server requests show a wake-up notice, have a 70-second timeout, and retry reads once.
- **B16:** Browser fare preview is labeled as an estimate; the booked amount comes from the server.
- **B17:** Demo session persistence remains in localStorage, as documented.
- **B18:** Frontend logic is separated into `core.js`, `views.js`, and `app.js`.

## Visual and motion pass

- Added route-color wayfinding accents, a rail-line stripe on digital tickets, and a transit-card motif on the wallet card.
- Kept the animated city/train scene and switched the train glide to compositor-friendly transforms. Scroll parallax now follows animation frames without an extra lagging transition.
- Smooth scrolling and existing reduced-motion preferences are respected.

## Reference-led interface redesign (29 October 2026)

- Reworked the overall visual language around the supplied transit-app references: warm light canvas, charcoal navigation and ticket cards, coral primary actions, compact rounded panels, and softer shadows. Light mode is the fresh-install default; the dark-mode control remains available.
- Replaced the local-train photo with a metro route-map and tunnel treatment in the sign-in scene and wallet feature.
- Added a dashboard route diagram and up to three real upcoming departures from configured schedules and active trains. Empty timetable data is presented as empty instead of inventing departure times.
- Added working Share and Save ticket controls to both the ticket list and booking-complete ticket. Share uses the device share sheet where available and otherwise copies the ticket summary.
- Replaced the frozen background with one slow constant-speed train glide; the skyline, lights and reflections stay still to avoid flicker. Reduced-motion settings still stop the glide.

## Metro card wallet and passes

- Passenger cards now have a wallet top-up dialog with preset amounts and a custom amount, plus a recent activity ledger showing top-ups, pass purchases, and stored-value fares with the resulting balance.
- Added 24-hour (₹120), 7-day (₹600), and 30-day (₹1,800) unlimited passes. Passes debit the card balance, show active/upcoming validity, queue after an existing pass, and cover ticket fares while valid.
- Pass purchases and balance changes are persisted as database records and are protected by a row lock so simultaneous purchases cannot overspend the wallet.

## Run the complete local preview

Double-click `START_PREVIEW.cmd`, then open `http://localhost:8080/`. It starts Spring Boot with the `preview` profile and an in-memory H2 database. This database is isolated from PostgreSQL and resets when the server stops. If an older MetroPass server is already running on port 8080, stop that server and relaunch this updated project so the new wallet tables and endpoints load. Opening `src/main/resources/static/index.html` directly is only a visual file preview; API-backed sign-in and data need the server.

## Verification

- `node --check` passes for all three frontend scripts.
- `node --check` passes for all three frontend scripts, Maven compilation succeeds, and JPA initializes against the preview H2 database.
- The embedded browser could not reach this build environment's localhost server, so the purchase flow still needs a browser interaction after launching the included preview on the user's machine.
