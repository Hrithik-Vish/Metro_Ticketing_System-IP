# Metro Cards: Swagger demo script

Open `/swagger-ui/index.html`. The **metro-cards** group is selected by default; switch the dropdown (top right)
to **full-api** only when asked to show the whole project.

Seed data: users `admin` and `operator1` (admins), `rider1` and `rider2` (passengers); cards `MC-1001` (rider1, 500.00)
and `MC-1002` (rider2, 150.00). A passenger can hold only one active card, so this script creates a new passenger, `demo1`.

| # | Call | Body | Expect |
|---|------|------|--------|
| 0 | POST `/api/users` (full-api group) | `{"userId":"demo1","firstName":"Demo","lastName":"Rider","password":"demo1234","contact":"demo1@example.com"}` | 201, role USER, **no password in the response** |
| 1 | GET `/api/metro-cards` | none | 200, MC-1001 and MC-1002 |
| 2 | GET `/api/metro-cards/MC-1001` | none | 200, one card |
| 3 | GET `/api/metro-cards/NOPE` | none | 404 "Metro card not found: NOPE" |
| 4 | POST `/api/metro-cards` | `{"cardId":"MC-2001","passengerId":"demo1","balance":300.00}` | 201, dates filled automatically |
| 5 | POST again, same body | same | 409 already exists |
| 6 | POST `{"cardId":"MC-2002","passengerId":"rider1","balance":100}` | | 409 rider1 already has an active card |
| 7 | POST `{"cardId":"","balance":-5}` | | 400, one message per invalid field |
| 8 | PATCH `/api/metro-cards/MC-2001` | `{"balance":750.00}` | 200, **only balance changed** |
| 9 | PATCH `/api/metro-cards/MC-2001` | `{"isActive":false}` then `{"isActive":true}` | 200 each time |
| 10 | PUT `/api/metro-cards/MC-2001` | `{"passengerId":"demo1","balance":400.00,"issueDate":"2026-10-29","expiryDate":"2030-10-29","isActive":true}` | 200, every field replaced |
| 11 | PUT with `isActive` missing | | 400 "isActive is required" (the PUT vs PATCH difference) |
| 12 | POST `/api/metro-cards/MC-2001/top-up` | `{"amount":200.00}` | 200, balance 600.00 |
| 13 | POST `/api/metro-cards/MC-2001/top-up` | `{"amount":-5}` | 400 "amount must be at least 1.00" |
| 14 | GET `/api/stations` (full-api) | none | note two station IDs, e.g. `ST-CEN` and `ST-MKT` |
| 15 | POST `/api/bookings` | `{"passengerId":"demo1","sourceStationId":"ST-CEN","destStationId":"ST-MKT","ticketType":"SINGLE","passengerCount":1,"paymentMethod":"METRO_CARD"}` | 201; `remainingCardBalance` is 600.00 minus the fare; note the `ticketId` |
| 16 | GET `/api/metro-cards/MC-2001` | none | balance is lower by exactly the fare |
| 17 | DELETE `/api/tickets/{ticketId}` (full-api) | none | 204; GET the card again: **the fare is refunded** |
| 18 | PATCH `/api/metro-cards/MC-2001` then POST booking again | `{"balance":1.00}` | 400 "Insufficient metro card balance..." and the balance is unchanged |
| 19 | DELETE `/api/users/demo1` | none | 409 "still used by a metro card" |
| 20 | DELETE `/api/metro-cards/MC-2001`, then DELETE again | none | 204, then 404 |
| 21 | DELETE `/api/users/demo1` | none | 204 (nothing uses it any more) |

Get real station IDs from GET `/api/stations`. Omit `paymentMethod` (or send `DEMO`) for the original simulated checkout,
which does not touch any card. If step 15 says no route connects the stations, pick two stations on the same line.
