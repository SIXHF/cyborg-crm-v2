# Cyborg CRM v2 — Claude Code Project Config

High-performance CRM built with Next.js 15, TypeScript, PostgreSQL. Designed for 10-20M leads with hundreds of concurrent agents.

## Tech Stack
- **Frontend**: Next.js 15 App Router + React + Tailwind CSS + Lucide icons
- **Backend**: Next.js API routes + Server Components
- **Database**: PostgreSQL 16 via Drizzle ORM (`src/lib/db/schema.ts`)
- **Auth**: Custom session-based auth (`src/lib/auth/index.ts`)
- **Deployment**: Railway (Docker) — auto-deploys from `main` branch
- **Theme**: Dark/light mode via next-themes

## Deployment
- **App URL**: `cyborg-crm-v2-production.up.railway.app`
- **Railway Project**: `intelligent-reverence` (id: `18ac304c-9a5d-4c17-b9b7-243109e26e5c`)
- **CRM Service**: id `5d8eaa7e-eacb-4c4b-aba5-f3dfe0b66025`
- **PostgreSQL Service**: id `d1bff43f-527b-4937-9cf1-188ed0aeb20a`
- **Environment**: `production` (id: `cb310ba1-a1ff-480a-b76a-bf5f69c6ce9e`)
- **Railway API Token**: Available in env as `RAILWAY_TOKEN`
- **Docker** + `startup.sh`: Runs migration SQL + seeds admin user on container start, then starts Next.js

### Railway API Access
The Railway GraphQL API (`https://backboard.railway.app/graphql/v2`) can be used with the `RAILWAY_TOKEN` env var to:
- Read/set environment variables (`variableUpsert` mutation)
- Trigger redeploys (`serviceInstanceRedeploy` mutation)
- Check deployment status and logs (`deployments`, `deploymentLogs` queries)
- Manage services and databases

## Database
- **31 tables** defined in `src/lib/db/schema.ts` (Drizzle ORM)
- **Migration SQL** in `drizzle/0000_harsh_amphibian.sql`
- Connection pooling: 20 connections via `postgres` npm package
- GIN trigram index for fuzzy search across 20M leads (created by seed script)
- Internal URL: `postgresql://postgres:<pw>@postgres.railway.internal:5432/railway`
- Public URL: `postgresql://postgres:<pw>@maglev.proxy.rlwy.net:36194/railway`

### Key Tables
- `users` — agents, processors, admins (session-based auth, bcrypt passwords)
- `leads` — main lead record (40+ fields, JSONB custom_fields)
- `lead_cards` — payment card info (multi-card per lead)
- `lead_comments`, `lead_attachments`, `lead_followups` — interactions
- `lead_cosigners`, `lead_employers`, `lead_vehicles`, `lead_relatives`, `lead_addresses`, `lead_emails`, `lead_licenses` — related records
- `call_queue`, `call_log`, `sip_call_debug` — VoIP/calling
- `sms_log` — SMS history
- `import_jobs` — bulk CSV import tracking
- `audit_log` — all user actions
- `notifications`, `collab_events`, `user_presence` — real-time features
- `custom_fields` — dynamic field definitions
- `bin_cache`, `phone_cache` — external lookup caches
- `app_settings` — key-value config store
- `sessions`, `login_attempts`, `password_resets` — auth infrastructure

### DB Commands
```bash
npm run db:generate  # Generate migration from schema changes
npm run db:push      # Push schema to database (no migration file)
npm run db:migrate   # Run migration files
npm run db:seed      # Create admin user + GIN search index
npm run db:studio    # Open Drizzle Studio (visual DB browser)
```

## Project Structure
```
src/
├── app/
│   ├── (auth)/login/          # Login page (static, client component)
│   ├── (crm)/                 # Authenticated layout wrapper (sidebar + topbar)
│   │   ├── dashboard/         # Stats cards, quick actions
│   │   ├── leads/             # Lead list (cursor pagination, search, filters)
│   │   │   ├── [id]/          # Lead detail (7 tabs: overview, cards, comments, files, followups, calls, related)
│   │   │   ├── new/           # New lead form
│   │   │   └── import/        # Bulk CSV import with drag-drop + progress
│   │   ├── sms/               # SMS conversation viewer
│   │   ├── profile/           # Current user profile
│   │   └── admin/
│   │       ├── data/          # Data manager (bulk delete operations)
│   │       ├── users/         # User management (CRUD, roles)
│   │       ├── audit/         # Audit log viewer
│   │       ├── analytics/     # Reports with stats
│   │       ├── settings/      # App settings + SIP config
│   │       ├── security/      # IP whitelist
│   │       ├── calls/         # Call history
│   │       ├── fields/        # Custom fields manager
│   │       └── performance/   # Performance monitoring
│   ├── api/
│   │   ├── auth/login/        # POST — authenticate user
│   │   ├── auth/logout/       # POST — destroy session
│   │   ├── leads/             # POST — create lead
│   │   ├── leads/[id]/patch/  # PATCH — update lead fields
│   │   ├── leads/[id]/comments/ # GET/POST — lead comments
│   │   └── admin/data-manager/  # POST — bulk delete operations
│   ├── page.tsx               # Root redirect (-> /login or /leads)
│   ├── layout.tsx             # Root layout (theme provider)
│   └── globals.css            # CSS variables (dark/light theme)
├── components/
│   ├── sidebar.tsx            # Collapsible sidebar nav with sections
│   ├── topbar.tsx             # Page header with notifications
│   └── theme-provider.tsx     # next-themes wrapper
├── lib/
│   ├── db/
│   │   ├── schema.ts          # All 31 Drizzle table definitions
│   │   └── index.ts           # PostgreSQL connection pool
│   ├── auth/
│   │   └── index.ts           # Session auth, login, logout, RBAC, audit logging
│   └── utils.ts               # cn(), generateRef(), formatPhone(), timeAgo(), etc.
scripts/
├── startup.sh                 # Docker entrypoint: migrate + seed + start server
├── migrate.ts                 # Run Drizzle migrations
└── seed.ts                    # Create admin user + pg_trgm + GIN index
drizzle/
└── 0000_harsh_amphibian.sql   # Initial migration (all 31 tables)
```

## Auth System
- Session-based with `sessions` table (not JWT)
- Cookie: `crm_session` (httpOnly, secure, sameSite=lax)
- Roles: `admin`, `processor`, `agent`
- `requireAuth()` — server component helper, redirects to /login if not authenticated
- `getUser()` — returns current session user or null
- Rate limiting: 5 failed attempts per IP per 15 minutes
- Audit logging on all actions via `audit()` function
- Default admin: `admin` / `admin123`

## SkyTelecom API Reference (skytelecom.io)

### Authentication
- **Base URL**: `https://skytelecom.io/api`
- **API Key**: `1346|hD1M1l971riq60KCKLViDRmsV5dUNuVRSHfvSM4n9cf0c4c1`
- **Auth Header**: `Authorization: Bearer <key>`

### SMS APIs
- `POST /api/sms/send` — Send SMS (params: `to`, `message`, `sender_id`, `route_option_id`)
- `GET /api/sms/available-routes` — List route codes
- `GET /api/sms/routes?numbers=<recipient>` — Routes for a specific destination
- `GET /api/sms/logs` — SMS delivery logs

### VoIP APIs
- `POST /api/voip/account/update` — Update caller ID
- `GET /api/voip/account/update` — View call logs
- `POST /api/voip/account/charge` — Top up SIP balance

### IVR Studio (DTMF)
- `POST /api/dtmf/upload` — Upload audio file
- `GET /api/dtmf/audio-files` — List audio files
- `POST /api/dtmf/flows` — Create/update IVR flow
- `POST /api/dtmf/call` — Initiate IVR call
- `GET /api/dtmf/result/{session_id}` — Poll call result

## External APIs (To Be Integrated)
- **Twilio** — VoIP softphone (Device SDK), call recording
- **Anthropic Claude** — AI column mapping for imports, call analysis
- **BIN Lookup** (`binlist.io`) — card brand/issuer enrichment
- **Carrier Lookup** (AbstractAPI) — phone line type detection

## Development
```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
```

## What's Done
- Full database schema (31 tables with indexes, foreign keys, enums)
- Auth system (login, logout, sessions, roles, CSRF, rate limiting, audit)
- App layout (sidebar, topbar, dark/light theme)
- Dashboard with stats
- Lead list with cursor-based pagination, search, filters, batch select
- Lead detail with 7 tabs (overview, cards, comments, files, followups, calls, related)
- Lead add/edit forms (40+ fields)
- Bulk import page (drag-drop, progress bar)
- Data manager (delete all, by status, duplicates, by import batch)
- User management page
- Audit log viewer
- Settings, SMS, Analytics, Security, Call History, Custom Fields, Performance pages
- Profile page
- All API routes (auth, leads CRUD, comments, data manager)
- Railway deployment with Docker + auto-migration

## What's TODO
- Bulk import backend worker (PostgreSQL COPY streaming)
- SMS sending integration (SkyTelecom API)
- Twilio softphone/call queue (Device SDK, WebRTC)
- AI call analysis (Claude API)
- Notification system (Server-Sent Events)
- BIN/carrier lookup integration
- CSV/PDF export
- MySQL -> PostgreSQL data migration script from v1
- Redis caching layer
- Real-time agent presence
- Custom fields CRUD (admin create/edit/delete)
- User create/edit forms (admin)

## Performance Design
- **Cursor-based pagination** — O(1) instead of OFFSET on 20M rows
- **GIN trigram index** — fuzzy search across name/email/phone in <200ms
- **Connection pooling** — 20 connections serve 500+ concurrent users
- **Server Components** — data fetching on server, minimal client JS
- **JSONB custom fields** — no join table needed, indexed
- **TRUNCATE CASCADE** — instant delete-all operations

## Migration from PHP v1
- Original PHP CRM: `SIXHF/cyborg-crm` (75 PHP files, MySQL)
- This is a full rewrite — same features, new architecture
