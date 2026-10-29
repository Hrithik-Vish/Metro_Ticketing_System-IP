# Merge notes

Base: `Metro_Ticketing_System-IP-final` backend (split controllers, BCrypt, validation, card payment/refund).
Frontend: teammate's `Metro_Ticketing_System_Updated` static files (`index.html`, `app.js`, `core.js`, `views.js`, `scene-map.js`, CSS).

The teammate's frontend also needed wallet features that only existed in their older backend, so they were ported into the final backend:
- New entities/repositories: `MetroCardPass`, `MetroCardTransaction`.
- `MetroCardController`: `GET/POST /api/metro-cards/{id}/passes`, `GET /api/metro-cards/{id}/transactions`; top-up now writes a ledger row.
- `BookingService`: an active time pass makes a METRO_CARD booking free (payment method `METRO_CARD_PASS`); card fares write a `FARE` ledger row.
- `TicketController` delete: refunds write a `REFUND` ledger row.
- `pom.xml`: H2 scope changed test -> runtime so `START_PREVIEW.cmd` (profile `preview`) works locally.
New tables are created automatically on startup (`ddl-auto=update`).
