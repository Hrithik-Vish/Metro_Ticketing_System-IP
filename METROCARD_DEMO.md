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
| 19 | POST `/api/metro-cards/MC-1001/top-up` | `{"amount":500.00}` | 200, wallet balance increases and a top-up appears in activity |
| 20 | GET `/api/metro-cards/MC-1001/transactions` | none | 200, recent top-ups, pass purchases, and card-paid fares |
| 21 | POST `/api/metro-cards/MC-1001/passes` | `{"passType":"DAY"}` | 200, buys a 24-hour unlimited pass for ₹120 from the card balance |
| 22 | GET `/api/metro-cards/MC-1001/passes` | none | 200, pass purchase history with start and expiry timestamps |
| 23 | POST `/api/bookings` using `paymentMethod":"METRO_CARD"` | existing booking body | An active time pass covers the ride for ₹0; otherwise the fare is deducted from stored value |

Use `operator1` for steps 4-17 because `rider1` and `rider2` already hold an active card.

Get real station IDs from GET `/api/stations`. Omit `paymentMethod` (or send `DEMO`) for the original simulated checkout, which doesn't touch any card.

Pass plans: `DAY` is unlimited for 24 hours (₹120), `WEEK` for 7 days (₹600), and `MONTH` for 30 days (₹1,800). A pass starts immediately, or queues after an active/upcoming pass. Pass purchases require sufficient stored balance. Top-ups accept ₹1–₹10,000 per transaction with up to two decimal places.
