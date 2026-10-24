# RESQAI Supabase setup

## 1. Create the database

Create a Supabase project and wait for its database to finish provisioning. In
the project dashboard, open **Connect** or **Project Settings → Database** and
obtain the PostgreSQL connection URI or the individual host, port, database,
user, and password values.

Use the direct connection when the backend host supports its network
requirements. If it does not, use the Supavisor session pooler URI. Do not use a
pooler setting that disables or breaks PostgreSQL transactions.

## 2. Configure the backend

From `BACKEND`, copy `.env.example` to `.env` and fill in **either**
`DATABASE_URL` **or** the individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
and `DB_PASSWORD` values. Keep the credentials only in `BACKEND/.env`; never
place them in frontend configuration, source control, or logs.

Supabase endpoints automatically enable TLS. `DB_SSL=true` can explicitly
enable TLS; `DB_SSL=false` is intended only for a trusted local PostgreSQL
instance. For a URI, percent-encode reserved characters in the username and
password.

Required values from Supabase:

- PostgreSQL host and port (or the complete connection URI).
- Database name.
- Database username.
- Database password.

`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, and `PORT`
are optional tuning/runtime settings.

## 3. Apply the schema safely

For a **new, empty** database, review and run `schema.sql` in the Supabase SQL
Editor.

For an existing database, do not run the fresh-install schema. First inspect
the current schema and data, then run the following preflight query in the SQL
Editor:

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ambulances', 'hospitals', 'emergencies', 'assignments')
ORDER BY table_name, ordinal_position;
```

Check for duplicate emergency assignments and orphaned references before
applying the additive migration:

```sql
SELECT emergency_id, COUNT(*)
FROM public.assignments
GROUP BY emergency_id
HAVING COUNT(*) > 1;

SELECT a.id
FROM public.assignments AS a
LEFT JOIN public.emergencies AS e ON e.id = a.emergency_id
LEFT JOIN public.ambulances AS am ON am.id = a.ambulance_id
LEFT JOIN public.hospitals AS h ON h.id = a.hospital_id
WHERE e.id IS NULL OR am.id IS NULL OR h.id IS NULL;
```

Resolve any existing schema mismatch, duplicate assignment, or orphaned row
manually before running `migrations/001_supabase_schema.sql`. The migration
checks required columns and their expected types, requires integer IDs, adds
generated IDs and primary keys where absent, and adds the assignment table
constraints/indexes without dropping data. A constraint failure is intentional
protection: inspect the existing records instead of deleting them to make the
migration pass.

Apply `migrations/002_hospital_room_capacity.sql` after the existing schema
migration (or after `schema.sql` on a fresh database). It adds nullable
`total_rooms` and `available_rooms` columns and
non-negative/capacity constraints. Existing values are left NULL until a
staff member enters real capacity; these fields are separate from
`available_beds`, which remains used by emergency hospital selection.

## 4. Validate and import the CSV datasets

The repository contains:

- `DATA/resqai_ambulances.csv` — 20 rows.
- `DATA/resqai_hospitals.csv` — 15 rows.
- `DATA/resqai_emergencies.csv` — 10 rows.
- No assignment CSV is present; the importer does not create assignments.

From `BACKEND`, first validate the datasets against the configured database
without writing rows:

```powershell
npm run import:csv -- --dry-run
```

Review reported invalid rows and conflicts. Then import:

```powershell
npm run import:csv
```

The importer processes ambulances, hospitals, then emergencies. It uses CSV
header mapping, parameterized inserts, a transaction per dataset, explicit-ID
sequence synchronization, and a stable ID plus natural-key conflict check.
Identical existing rows are skipped; conflicting rows are reported and are not
overwritten. It does not truncate tables. If the importer reports rejected
rows, review them before treating the import as complete.

Verify counts in the Supabase SQL Editor:

```sql
SELECT 'ambulances' AS table_name, COUNT(*) FROM public.ambulances
UNION ALL
SELECT 'hospitals', COUNT(*) FROM public.hospitals
UNION ALL
SELECT 'emergencies', COUNT(*) FROM public.emergencies
UNION ALL
SELECT 'assignments', COUNT(*) FROM public.assignments;
```

The CSV row counts above are the number of source records, not a claim about
what has been uploaded. Existing rows may make database totals higher.

## 5. Test and run

From `BACKEND`:

```powershell
npm install
npm test
npm run db:test
npm start
```

`db:test` checks PostgreSQL connectivity and the same dashboard aggregate
queries used by the backend. In a second terminal, from `FRONTEND`:

```powershell
npm install
npm run dev
```

The frontend defaults to `http://localhost:5000/api`. To use another backend,
set the Vite variable `VITE_API_BASE_URL` to its `/api` URL in the frontend
development environment; it contains no database credentials.

Submit an emergency in the existing UI. A successful response should include
the emergency, selected ambulance, selected hospital, and assignment. If
coordination fails, the backend rolls back the emergency and assignment work
and returns a safe, actionable error.

## 6. Limitations and manual steps

- Supabase credentials were not added to this repository. Configure them
  locally before database connectivity or remote import can be verified.
- The automated tests use isolated fake clients; they do not modify a shared or
  production database and cannot prove remote PostgreSQL behavior.
- The CSV import must be run by an operator with access to the intended
  Supabase project, followed by the count queries above.
- Hospital bed counts are used by the existing selection algorithm but are not
  reserved/decremented by the current application workflow.
- The fleet and hospital editing endpoints are an unauthenticated development
  demo. The frontend displays a warning, but this is not access control. Do
  not expose the backend to the public internet or use real operational data
  until authentication, role-based authorization, audit logging, and
  restrictive CORS/deployment controls are implemented. The database pool
  credentials remain backend-only.

## 7. Management API

- `GET /api/emergencies` returns active incidents with actual assignment,
  ambulance, and hospital details. Search with `?search=...`; filter by
  status with `?status=...`. Use `?history=true` for resolved/completed
  incidents only.
- `GET /api/ambulances` retrieves fleet records. `PATCH /api/ambulances/:id`
  updates only supported existing ambulance fields.
- `GET /api/hospitals` retrieves hospital records. `PATCH /api/hospitals/:id`
  updates supported existing hospital fields and, after migration 002, room
  capacity. Hospital room updates lock the row and validate capacity in a
  transaction. No personnel or contact fields are available in the current
  schema. Ambulance operational status remains controlled by coordination;
  management edits cover the registration, location, coordinates, unit type,
  and equipment.
