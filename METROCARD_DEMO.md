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
| 12 | DELETE `/api/metro-cards/MC-2001` | none | 204 |
| 13 | DELETE again | none | 404 |

Use `operator1` for steps 4-12 because `rider1` and `rider2` already hold an active card.
