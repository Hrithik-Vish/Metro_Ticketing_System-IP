# Deploying Metro Ticketing System (Supabase + Render)

This app is a single Spring Boot service that serves both the REST API (`/api/*`)
and the frontend (static HTML/JS) together. You only need **two** things:
a Supabase Postgres database, and a Render web service.

## 1. Create the Supabase project

1. Go to https://supabase.com → New project.
2. Pick a name, a strong database password (save it), and a region close to you.
3. Once it's created, go to **Project Settings → Database**.
4. Under **Connection string**, choose the **Session pooler** (port `6543`) —
   NOT the direct connection (port `5432`). Render's free tier and most hosts
   work more reliably through Supabase's pooler.
5. It looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
6. You'll convert this into a JDBC URL for Spring Boot:
   ```
   jdbc:postgresql://aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
   (same host/port/db name, just with `jdbc:` prefix and no embedded credentials —
   username and password go in separate env vars below.)
   - Username: `postgres.xxxxxxxxxxxx` (the full string before the `@`, including the project ref)
   - Password: whatever you set in step 2

## 2. Push the code to GitHub

If it isn't already:
```bash
git init
git add .
git commit -m "Metro ticketing system"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## 3. Deploy on Render

**Option A — one-click via render.yaml (included in this repo):**
1. Go to https://render.com → New → Blueprint.
2. Connect your GitHub repo. Render will detect `render.yaml` automatically.
3. It'll ask you to fill in the blank env vars:
   - `SPRING_DATASOURCE_URL` → the `jdbc:postgresql://...` string from step 1.6
   - `SPRING_DATASOURCE_USERNAME` → `postgres.xxxxxxxxxxxx`
   - `SPRING_DATASOURCE_PASSWORD` → your Supabase DB password
4. Click **Apply** — Render builds the Docker image and deploys.

**Option B — manual web service:**
1. New → Web Service → connect your repo.
2. Runtime: **Docker** (it'll pick up the included `Dockerfile` automatically).
3. Add the same three environment variables as above.
4. Deploy.

First build takes a few minutes (Maven downloads dependencies + compiles).
Render gives you a URL like `https://metro-ticketing.onrender.com`.

## 4. First run

On first startup, Hibernate (`ddl-auto=update`) will automatically create all
tables in your Supabase database — no manual SQL needed. `DataInitializer`
will then seed demo data: stations, routes, fares, trains, schedules, metro
cards, one maintenance issue, and demo accounts:

- `admin` / `admin123` (admin)
- `operator1` / `operator123` (admin)
- `rider1` / `rider123` (passenger)
- `rider2` / `rider123` (passenger)

Open the Render URL in a browser — you'll land on the sign-in screen.

## Notes / things to know

- **Free tier sleep:** Render's free web services spin down after ~15 minutes
  of inactivity and take ~30–60s to wake on the next request. If you're
  demoing live, hit the URL a minute before showing it to avoid that delay.
- **No password hashing / no auth tokens:** this is a teaching-project level
  auth system (plain-text password check, session kept in browser
  localStorage). Fine for an academic demo; don't reuse this pattern for
  anything real.
- **Re-deploys keep your data** — Hibernate's `update` mode won't drop
  existing tables/rows, only adds missing ones.
- If you ever want a clean slate, you can drop all tables from the Supabase
  **Table Editor** or SQL editor and restart the Render service — it'll
  recreate and reseed everything.
