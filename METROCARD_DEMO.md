# Metro Cards: Swagger demo script

Open `/swagger-ui/index.html`. The **metro-cards** group is selected by default; switch the
dropdown (top right) to **full-api** only when asked to show the whole project.

Seed data: `MC-1001` (rider1, 500.00) and `MC-1002` (rider2, 150.00). Users `rider1`, `rider2`,
`admin`, `operator1` exist.

| # | Call | Body | Expect |
|---|------|------|--------|
| 1 | GET `/api/metro-cards` | none | 200, list with MC-1001 and MC-1002 |
| 2 | GET `/api/metro-cards/MC-1001` | none | 200, one card |
| 3 | GET `/api/metro-cards/NOPE` | none | 404 "Metro card not found: NOPE" |
| 4 | POST `/api/metro-cards` | `{"cardId":"MC-2001","passengerId":"operator1","balance":300.00}` | 201, dates filled automatically |
| 5 | POST again with the same body | same | 409 "already exists" |
| 6 | POST `{"cardId":"MC-2002","passengerId":"rider1","balance":100}` | | 409 rider1 already has an active card |
| 7 | POST `{"cardId":"","balance":-5}` | | 400 with a message per invalid field |
| 8 | PATCH `/api/metro-cards/MC-2001` | `{"balance":750.00}` | 200, **only balance changed** |
| 9 | PATCH `/api/metro-cards/MC-2001` | `{"isActive":false}` | 200, card deactivated |
| 10 | PUT `/api/metro-cards/MC-2001` | `{"passengerId":"operator1","balance":400.00,"issueDate":"2026-10-29","expiryDate":"2030-10-29","isActive":true}` | 200, every field replaced |
| 11 | PUT with `isActive` missing | | 400 "isActive is required" (this is the PUT vs PATCH difference) |
| 12 | POST `/api/metro-cards/MC-2001/top-up` | `{"amount":200.00}` | 200, balance increased by 200 |
| 13 | POST `/api/metro-cards/MC-2001/top-up` | `{"amount":-5}` | 400 "amount must be at least 1.00" |
| 14 | POST `/api/bookings` (switch to the **full-api** group) | `{"passengerId":"operator1","sourceStationId":"<a station ID>","destStationId":"<another>","ticketType":"SINGLE","passengerCount":1,"paymentMethod":"METRO_CARD"}` | 201, `remainingCardBalance` shows the card balance after the fare was deducted |
| 15 | GET `/api/metro-cards/MC-2001` | none | 200, balance is lower by exactly the fare |
| 16 | Repeat step 14 until the balance is too low | same | 400 "Insufficient metro card balance..." and the balance is unchanged |
| 17 | DELETE `/api/metro-cards/MC-2001` | none | 204 |
| 18 | DELETE again | none | 404 |

Use `operator1` for steps 4-17 because `rider1` and `rider2` already hold an active card.

Get real station IDs from GET `/api/stations`. Omit `paymentMethod` (or send `DEMO`) for the original simulated checkout, which doesn't touch any card.
