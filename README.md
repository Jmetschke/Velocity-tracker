# Elevated Production Scheduler

A production scheduling and inventory management web application for cannabis product manufacturers. The system ingests inventory snapshots and sales data, calculates per-SKU daily velocity using an AI-assisted analysis pipeline, and generates prioritized production batch recommendations — surfacing which SKUs need to be manufactured, how many batches, and when to start.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture Overview](#architecture-overview)
3. [Feature Reference](#feature-reference)
4. [Data Model](#data-model)
5. [Scheduling Engine](#scheduling-engine)
6. [AI Velocity Analysis](#ai-velocity-analysis)
7. [Tech Stack](#tech-stack)
8. [Project Structure](#project-structure)
9. [Environment Variables](#environment-variables)
10. [Development Setup](#development-setup)
11. [Database Workflow](#database-workflow)
12. [Testing](#testing)
13. [Security Notes](#security-notes)

---

## What It Does

The core problem this application solves: a cannabis manufacturer has dozens of SKUs, each with different production lead times, batch sizes, and sales velocities. Determining what to produce, how much, and when — while accounting for work-in-progress inventory, committed production runs, and par level buffers — is a multi-variable problem that is error-prone when managed manually in spreadsheets.

This application automates that reasoning. It takes three inputs — a METRC inventory export, a QuickBooks or generic sales report, and user-defined SKU parameters — and outputs a prioritized production schedule with urgency classification, days-to-stockout projections, and calendar-week batch assignments.

---

## Architecture Overview

The application is a full-stack TypeScript monorepo with a React frontend and an Express backend communicating exclusively over tRPC. There are no REST endpoints for application features — all client-server contracts are defined as tRPC procedures, giving end-to-end type safety without a shared contract file.

```
Client (React 19 + Vite)
    │
    │  tRPC over HTTP (superjson serialization)
    │
Server (Express 4 + tRPC 11)
    │
    ├── server/routers/          Domain-specific tRPC routers
    ├── server/scheduling.ts     Pure scheduling engine (no I/O)
    ├── server/velocity-ai.ts    LLM velocity analysis + Zod validation
    ├── server/parsers.ts        Generic inventory/sales Excel parsers
    ├── server/metrc-parser.ts   METRC-specific Excel parser
    ├── server/quickbooks-parser.ts  QuickBooks P&L Excel parser
    ├── server/excel.ts          Shared ExcelJS helpers (merged-cell aware)
    ├── server/db.ts             Drizzle query helpers
    └── drizzle/schema.ts        Single source of truth for the data model
```

Authentication is handled via Manus OAuth. A site-level password gate (`SITE_PASSWORD`) provides an additional layer of access control before OAuth. All timestamps are stored as UTC in the database and converted to local time in the browser.

---

## Feature Reference

### Production Dashboard

The main view. Displays a prioritized table of all active SKUs with their current stock, WIP (work-in-progress) units, projected stock, daily velocity, par level, deficit, committed quantity, adjusted deficit, days to stockout, batches needed, and suggested start date. Rows are color-coded by urgency: **critical** (red) when days to stockout is at or below lead time, **warning** (amber) when there is an unmet deficit after accounting for committed batches, and **ok** (green) when stock is sufficient.

The dashboard also shows a data freshness bar indicating when inventory and sales data were last uploaded, and a stockout timeline visualization for the most at-risk SKUs.

A **What-If panel** allows users to adjust individual SKU velocities with a slider and immediately see how the change affects the production schedule — without saving to the database.

An **Export PDF** button generates a landscape letter PDF of the Production Needs table, including summary statistics, urgency color-coding, and a data freshness row. The PDF library loads on demand (lazy import) to avoid impacting initial page load.

### Data Upload

Supports four file upload types:

| Upload Type | Format | Parser |
|---|---|---|
| METRC Inventory Export | `.xlsx` | `metrc-parser.ts` |
| Generic Inventory Report | `.xlsx` | `parsers.ts` |
| QuickBooks P&L Export | `.xlsx` | `quickbooks-parser.ts` |
| Generic Sales Report | `.xlsx` | `parsers.ts` |

All parsers use the shared `excel.ts` helper, which handles merged cells correctly (ExcelJS fills all cells in a merged range; the helper nulls all but the origin cell to match expected behavior).

After a sales upload, the system invokes the AI velocity analysis pipeline, which sends the processed CSV to an LLM with a structured JSON schema, validates the response with Zod, and updates SKU velocities in the database. The full LLM call is logged to the `llm_usage` telemetry table.

### SKU Management

CRUD interface for SKUs. Each SKU belongs to a category and inherits the category's theoretical batch size and loss percentage. SKU-level overrides are available for batch size, buffer days, and lead time. Velocity can be set manually, calculated from uploaded sales data, or set by AI analysis.

### Categories

Manage product categories. Each category defines the theoretical batch size and loss percentage used to calculate the net batch size (units available for sale after production losses).

### Velocity & Par

View and edit per-SKU velocity history. Shows the source of each velocity record (manual, calculated, or AI), the sales upload that triggered it, and any analyst notes. Par levels are calculated as `ceil(dailyVelocity × bufferDays)`.

### Committed Batches

Plan and track production runs by ISO calendar week. Users can commit batches with a quantity, start/end date, and status (`planned`, `in_progress`, `completed`, `cancelled`). Committed quantities are subtracted from the adjusted deficit in the scheduling engine so the dashboard reflects actual remaining need.

### Production Calendar

A month-view calendar showing all production batches (both suggested and committed) overlaid on the calendar grid. Clicking a batch opens a detail panel with status management. A batch list below the calendar provides a sortable, filterable table view.

### Stockout Notifications

Configurable email alerts via Resend when SKUs approach stockout. Settings include threshold days, email enabled/disabled, and notification frequency (immediate, daily, weekly). Notification history is stored in the database.

---

## Data Model

The database schema is defined in `drizzle/schema.ts` and enforced with Drizzle ORM against a MySQL/TiDB instance.

| Table | Purpose |
|---|---|
| `users` | OAuth user accounts with role (`user` \| `admin`) |
| `sku_categories` | Product categories with batch size and loss % |
| `skus` | Individual SKUs with velocity, par, buffer, and lead time |
| `inventory_snapshots` | Metadata for each inventory file upload |
| `inventory_items` | Per-SKU quantities from each snapshot |
| `sales_uploads` | Metadata for each sales file upload |
| `velocity_history` | Audit trail of all velocity changes with source |
| `production_batches` | AI-suggested production runs |
| `committed_batches` | User-planned production runs by ISO week |
| `notification_settings` | Per-user stockout alert configuration |
| `notification_history` | Log of all sent stockout notifications |
| `llm_usage` | LLM call telemetry (tokens, duration, success) |

Foreign key constraints are applied at the database level (not just in the ORM) for referential integrity.

---

## Scheduling Engine

The scheduling engine (`server/scheduling.ts`) is a pure function with no database I/O — it takes an array of `SkuScheduleInput` objects and returns an array of `ScheduleSuggestion` objects. This makes it fully unit-testable without mocking.

**Key business rules baked into the engine:**

- Production does not happen on weekends. `addBusinessDays()` and `nextBusinessDay()` skip Saturday and Sunday when calculating start and end dates.
- Days to stockout uses **calendar days** (not business days), because sales occur 7 days a week. The formula is `floor(projectedStock / dailyVelocity)`.
- Projected stock is `currentStock + wipStock` — WIP units are counted as available for the stockout calculation since they will be sellable within the lead time window.
- Committed quantities are subtracted from the deficit before calculating batches needed, so the dashboard does not double-count already-planned production.
- Urgency is `critical` when `daysUntilStockout <= leadTimeDays` (not enough time to produce before stockout), `warning` when there is an unmet adjusted deficit, and `ok` otherwise.
- Par level is `ceil(dailyVelocity × bufferDays)`. The default buffer is 14 days.
- Batch sizes use the net batch size (theoretical size minus the 5% loss factor), which is set at the category level and can be overridden per SKU.

---

## AI Velocity Analysis

When a sales file is uploaded, the system:

1. Parses the Excel file into a CSV-formatted string with SKU names and monthly quantities.
2. Sends the CSV to an LLM with a structured JSON schema (`response_format: json_schema`) requesting daily velocity per SKU for the most recent 3 full months.
3. **Validates the LLM response with Zod** (`VelocityAnalysisSchema`) before touching the database. If the LLM returns malformed data, a `ZodError` is thrown and the upload fails cleanly.
4. Fuzzy-matches LLM-returned SKU names against the database using `findBestSkuMatch()` to handle minor naming variations.
5. Updates `skus.dailyVelocity` and inserts a `velocity_history` record for each matched SKU.
6. Logs the full LLM call to `llm_usage` (estimated prompt tokens, duration, success/failure) for future cost monitoring and tier-based pricing support.

The LLM call is always made server-side. The API key is never exposed to the client.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 |
| Frontend routing | Wouter 3 |
| UI components | shadcn/ui (Radix UI primitives) |
| Styling | Tailwind CSS 4 |
| Client-server communication | tRPC 11 + TanStack Query 5 |
| Serialization | SuperJSON |
| Backend framework | Express 4 |
| Database ORM | Drizzle ORM |
| Database | MySQL / TiDB |
| Excel parsing | ExcelJS 4 |
| PDF generation | jsPDF 4 + jspdf-autotable 5 (lazy-loaded) |
| Email | Resend |
| File storage | AWS S3 |
| Authentication | Manus OAuth (JWT session cookies) |
| Validation | Zod 4 |
| Build tool | Vite 7 |
| Runtime | Node.js (tsx in dev, esbuild in prod) |
| Testing | Vitest |
| Language | TypeScript 5.9 (strict) |

---

## Project Structure

```
elevated-production-scheduler/
├── client/
│   └── src/
│       ├── pages/               Page-level components (lazy-loaded)
│       │   ├── Home.tsx         Production Dashboard
│       │   ├── UploadData.tsx   File upload and AI analysis
│       │   ├── SkuManagement.tsx
│       │   ├── Categories.tsx
│       │   ├── VelocityPar.tsx
│       │   ├── CommittedBatches.tsx
│       │   └── ProductionCalendar.tsx
│       ├── components/          Shared UI components
│       │   ├── DashboardLayout.tsx   Sidebar + nav shell
│       │   ├── PageErrorBoundary.tsx Per-page error isolation
│       │   ├── WhatIfPanel.tsx       Velocity scenario modeler
│       │   ├── StockoutTimeline.tsx  Visual stockout timeline
│       │   └── ValidationReport.tsx  Upload validation results
│       ├── lib/
│       │   ├── exportProductionPdf.ts  PDF export utility
│       │   ├── what-if-calc.ts         Client-side what-if logic
│       │   └── trpc.ts                 tRPC client binding
│       └── App.tsx              Route definitions with React.lazy
│
├── server/
│   ├── routers/                 Domain-specific tRPC routers
│   │   ├── index.ts             Barrel export
│   │   ├── categories.ts
│   │   ├── skus.ts
│   │   ├── inventory.ts
│   │   ├── sales.ts
│   │   ├── committed.ts
│   │   ├── production.ts
│   │   └── notifications.ts
│   ├── routers.ts               Slim aggregator (44 lines)
│   ├── db.ts                    Drizzle query helpers
│   ├── scheduling.ts            Pure scheduling engine
│   ├── velocity-ai.ts           LLM analysis + Zod validation
│   ├── excel.ts                 Shared ExcelJS helpers
│   ├── parsers.ts               Generic inventory/sales parsers
│   ├── metrc-parser.ts          METRC Excel parser
│   ├── quickbooks-parser.ts     QuickBooks Excel parser
│   ├── notifications.ts         Stockout email logic
│   ├── data-validation.ts       Upload data validation
│   ├── telemetry.ts             LLM usage logging helpers
│   ├── site-gate.ts             Site password middleware
│   ├── storage.ts               S3 helpers
│   └── *.test.ts                Vitest test files (16 files)
│
├── drizzle/
│   ├── schema.ts                Database schema (single source of truth)
│   ├── relations.ts             Drizzle relation definitions
│   └── *.sql                   Generated migration files
│
└── shared/
    ├── types.ts                 Shared TypeScript types
    └── const.ts                 Shared constants
```

---

## Environment Variables

All environment variables are injected by the platform. Do not commit `.env` files.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing secret |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | Owner's OAuth ID for admin seeding |
| `OWNER_NAME` | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API base URL (LLM, storage, etc.) |
| `BUILT_IN_FORGE_API_KEY` | Server-side bearer token for Manus APIs |
| `VITE_FRONTEND_FORGE_API_KEY` | Client-side bearer token for Manus APIs |
| `VITE_FRONTEND_FORGE_API_URL` | Client-side Manus API base URL |
| `RESEND_API_KEY` | Resend email service API key |
| `SITE_PASSWORD` | Site-level password gate (pre-OAuth) |

---

## Development Setup

**Prerequisites:** Node.js 22+, pnpm 10+

```bash
# Clone and install dependencies
git clone <repo-url>
cd elevated-production-scheduler
pnpm install

# Copy environment variables (fill in values)
cp .env.example .env

# Apply database migrations
pnpm db:push

# Start the development server (frontend + backend on port 3000)
pnpm dev
```

The development server runs both the Vite frontend (with HMR) and the Express backend on a single port via the Vite proxy. The backend is started with `tsx watch` for TypeScript hot-reload.

**Available scripts:**

| Command | Purpose |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production (Vite + esbuild) |
| `pnpm start` | Run production build |
| `pnpm check` | TypeScript type check (no emit) |
| `pnpm test` | Run all Vitest tests |
| `pnpm format` | Format with Prettier |

---

## Database Workflow

Schema changes follow a strict four-step process to keep the TypeScript schema and the actual database in sync:

1. **Edit** `drizzle/schema.ts` with the new table or column definition.
2. **Generate** the migration SQL: `pnpm drizzle-kit generate`
3. **Review** the generated `.sql` file in `drizzle/`.
4. **Apply** the migration via the platform's SQL execution tool (not `drizzle-kit migrate` directly in production).

Never modify the generated `.sql` files manually. Never use `drizzle-kit push` in production — it bypasses the migration history.

---

## Testing

The test suite has 16 test files covering 322 test cases across the full server-side logic.

```bash
pnpm test           # Run all tests
pnpm test --watch   # Watch mode
```

**Test coverage by area:**

| File | Coverage Area |
|---|---|
| `scheduling.test.ts` | Scheduling engine, urgency logic, business day math |
| `what-if-calc.test.ts` | Client-side what-if scenario calculations |
| `parsers.test.ts` | Generic inventory and sales Excel parsers |
| `metrc-parser.test.ts` | METRC Excel parser (real file integration) |
| `metrc-parser-unit.test.ts` | METRC parser unit tests with synthetic fixtures |
| `quickbooks-parser.test.ts` | QuickBooks P&L parser (real file integration) |
| `velocity-ai.test.ts` | AI velocity analysis and Zod validation |
| `data-validation.test.ts` | Upload data validation rules |
| `notifications.test.ts` | Stockout notification logic |
| `site-gate.test.ts` | Site password middleware |
| `coverage-gaps.test.ts` | Edge cases for scheduling and parsers |
| `edge-cases.test.ts` | Boundary conditions across all modules |
| `audit-remediation.test.ts` | Security and validation fixes (file size limits, Zod) |
| `page-error-boundary.test.ts` | React error boundary behavior |
| `auth.logout.test.ts` | Auth logout flow |
| `resend.test.ts` | Email service integration |

All test fixtures for Excel parsing are built programmatically using ExcelJS — no binary fixture files are committed to the repository.

---

## Security Notes

- **File upload size limits:** All base64 file upload inputs are capped at ~10MB (13.4M characters base64-encoded) via Zod input validation.
- **Notes field limits:** All free-text notes fields are capped at 1,000 characters.
- **LLM responses are Zod-validated** before any database writes. A malformed LLM response throws a `ZodError` and aborts the operation cleanly.
- **No raw SQL:** All database queries use Drizzle ORM's query builder. There are no template literal SQL strings.
- **Server-side LLM calls only:** The LLM API key is never exposed to the client. All AI calls are made inside tRPC procedures.
- **JWT session cookies** are `httpOnly`, `sameSite: lax`, and signed with `JWT_SECRET`.
- **Foreign key constraints** are enforced at the database level on all relational columns.
- **LLM telemetry** logs every AI call with token estimates, duration, and success/failure for future cost monitoring and tier-based access control.

---

## Inventor and License

This software was invented by Roy McFarland.

The repository is source-available under the PolyForm Noncommercial License 1.0.0. Noncommercial use is permitted under that license. Commercial or other profit-making use requires separate permission from the inventor.
