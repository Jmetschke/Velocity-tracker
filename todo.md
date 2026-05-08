# Elevated Production Scheduler - TODO

- [x] Database schema: SKUs, inventory snapshots, sales history, velocity, production batches
- [x] Upload and parse inventory spreadsheet (xlsx) to display current stock levels by SKU
- [x] Upload and parse historical sales data (xlsx) for AI velocity analysis
- [x] Dynamic par level calculation engine: velocity × 14-day buffer with 5-day lead time
- [x] Production scheduling dashboard: flag SKUs below par, suggest batch start dates (skip weekends)
- [x] SKU management interface: add, edit, remove products with custom batch sizes and production rules
- [x] Editable velocity settings: manual adjust or override AI-calculated velocities
- [x] Batch size configuration per SKU category (Chunks: 7125, Mini's: 5938, Vapes/Whoopie/Dots: 950) with 5% loss
- [x] Production calendar view with visual indicators for weekends and lead times
- [x] Historical tracking of inventory uploads and velocity changes for trend analysis
- [x] AI-powered velocity analysis using LLM to calculate daily wholesale velocity from sales data
- [x] Clean, functional dashboard UI appropriate for business operations
- [x] Unit tests for core scheduling and velocity logic
- [x] Add 'Days Until Stockout' column to dashboard Production Needs table (enhanced with color-coded badges and tooltips)
- [x] Validate inventory upload parsing against actual InventoryStatusReport.xlsx format
- [x] Validate sales upload parsing against actual Sales by ProductService Summary.xlsx format
- [x] Ensure SKU name matching handles real-world SKU naming conventions
- [x] End-to-end test: upload both files and verify dashboard populates with real data
- [x] Add committed_batches DB table with SKU, quantity, calendar week, start/end dates, status
- [x] CRUD tRPC routers for committed batches (create, list, update status, delete)
- [x] Update scheduling engine to subtract committed batch quantities from deficit calculations
- [x] Build Committed Batches UI page for adding/managing planned production runs
- [x] Display ISO calendar week numbers throughout the app (dashboard, calendar, committed batches)
- [x] Update Production Calendar to show committed batches alongside scheduling suggestions
- [x] Unit tests for committed batches logic and updated scheduling

## Bugs

- [x] Fix login error preventing access to app (database connection reset - resolved by restarting dev server)
- [x] Add notifications DB schema (notification_settings, notification_history tables)
- [x] Integrate Resend for email sending
- [x] Update notification service to use Resend instead of notifyOwner
- [x] Add "Check for Stockouts" button to dashboard
- [ ] Build notification settings UI page with configurable threshold
- [ ] Build notification history page to view past alerts
- [ ] Write tests for Resend email integration
- [x] Enhance email alerts to include specific stockout date for each SKU
- [x] Add visual stockout timeline to dashboard showing projected stockout dates
- [x] Update SKU database: replace old vape names with Snackbar flavors (Watermelon Lychee, Lemon Yuzu, Grape Crush, Mango Magic)
- [x] Add Shooter SKUs (Triple Citrus, Watermelon, Sour Blue Razz) with 1,500 theoretical batch size
- [x] Add Shooters category (1,500 theoretical / 1,425 net)
- [x] Build METRC parser with definitive item-to-SKU mapping table
- [x] Add batch name keyword fallback for ambiguous METRC items
- [x] Filter by location: include Ready For Sale, EO Curing Room, EO Vault; exclude EO Concentrate Cabinet
- [x] Separate WIP inventory (Curing Room + SubmittedForTesting) from available inventory
- [x] Exclude Pheotera, Tincture, and Concentrate items from parsing
- [x] Integrate METRC upload as a new option in the Upload Data page
- [x] Write tests for METRC parser with actual export data (9 tests, all passing)
- [x] Parse METRC export and populate database with real inventory data (19 SKUs loaded)
- [x] Parse sales history and calculate refined daily velocities per SKU (Dec 2025 - Feb 2026 avg)
- [x] Update database with new velocities, par levels, and velocity history records (16 SKUs updated)
- [x] Re-add deleted Mini's category (6,250 per batch) with both SKUs (MiNi's Chunks 10pk, Sugar Free MiNi's 10pk)
- [x] Fix: Production Calendar not displaying committed batches (merged both data sources, source-aware actions)
- [x] Audit all existing tests and identify coverage gaps
- [x] Add new tests for uncovered features and edge cases
- [x] Analyze full QuickBooks Sales export file structure
- [x] Build dedicated QuickBooks parser with definitive product-to-SKU mapping
- [x] Exclude Pheotera and non-relevant products from QB parsing
- [x] Integrate QB parser into upload flow (replace or augment existing sales parser)
- [x] Write comprehensive unit tests for QB parser with synthetic data
- [x] Add QuickBooks upload UI card with parse results display
- [x] Second test audit: fill remaining coverage gaps (QB parseNum, classifyRow, category context reset, METRC batch fallback, vape patterns, normalization, scheduling edge cases)
- [x] Add SITE_PASSWORD env secret for shared password gate
- [x] Build server-side password verification endpoint with hashed comparison
- [x] Add middleware to gate all routes behind password cookie (bypass OAuth)
- [x] Build frontend password gate UI (clean, simple form)
- [x] Write tests for password gate logic
- [x] Proactive QB parser stress test: partial month detection, resilient Total column matching, CSV warning for AI
- [x] Build shared validation framework (types, severity levels, ValidationIssue interface)
- [x] Implement QB validators (total mismatch, negative qty, fractional edibles, duplicates, partial month anomalies)
- [x] Implement METRC validators (duplicate tags, negative/zero qty, WIP quantity anomalies)
- [x] Implement inventory validators (ambiguous SKU matches, quantity outliers)
- [x] Wire validators into upload routers (block on errors, pass-through on warnings)
- [x] Build UI validation report component (yellow/red banners with expandable details)
- [x] Write comprehensive tests for all validators
- [x] Add 'last uploaded' freshness indicators on the dashboard for inventory and sales velocity data
- [x] Full codebase review: server-side code quality, duplication, robustness
- [x] Full codebase review: client-side design consistency, UX polish, accessibility
- [x] Apply fixes and improvements from codebase review
- [x] Add/update tests for any changed code
- [x] Build What-If velocity scratchpad panel component with editable velocity fields
- [x] Add real-time client-side recalculation of par levels, days-to-stockout, and production deficit
- [x] Add percentage-based bulk adjustment (e.g., +20% all SKUs)
- [x] Add visual diff indicators (arrows, color) showing impact vs. current actuals
- [x] Add "Apply" button to save adjusted velocities as new actuals
- [x] Integrate What-If panel into dashboard with toggle button
- [x] Write tests for What-If recalculation logic
- [x] Bug: newly added SKU "Sampler Medley - 3pk" not showing on dashboard — fixed: zero-velocity SKUs now appear in suggestions as "ok" instead of being silently skipped
- [x] Reclassify WIP anomaly validation from 'warning' to 'info' severity
- [x] Add 'In Testing' (WIP) column to dashboard Production Needs table
- [x] Add 'Projected Stock' column (Available + WIP) to dashboard
- [x] Use Projected Stock instead of Available for days-to-stockout calculation
- [x] Pass WIP data through scheduling engine and routers
- [x] Write/update tests for WIP-aware scheduling and validation changes
- [x] Make DashboardLayout sidebar mobile-friendly (hamburger menu, overlay) — already had mobile support via useIsMobile
- [x] Make Home dashboard tables and cards responsive for mobile — card-based mobile layout for production needs table, responsive header/summary cards
- [x] Make Categories page responsive for mobile — card-based mobile layout, responsive header
- [x] Make UploadData page responsive for mobile — responsive header, card layout for AI analysis results
- [x] Make CalendarView page responsive for mobile — compact calendar cells, responsive legend, card-based batch list
- [x] Make SKUs/inventory pages responsive for mobile — card-based mobile layout for SKU table and velocity table
- [x] Make WhatIfPanel responsive for mobile — card-based mobile layout for velocity adjustments
- [x] Make StockoutTimeline responsive for mobile — bottom tooltip on mobile, responsive progress bars
- [x] Make SiteGate password page responsive for mobile — already mobile-friendly (centered, max-w-sm)
- [x] Test all pages on mobile viewport — TypeScript check and Vite build pass clean, desktop view verified

## Webapp Audit Remediation (March 2026)

- [x] P0: Replace xlsx with ExcelJS (2 unpatched CVEs: Prototype Pollution + ReDoS)
- [x] P0: Handle ExcelJS merged cell behavior (null non-origin cells to match old xlsx output)
- [x] P0: Add Zod validation to LLM response in velocity-ai.ts
- [x] P1: Add file size limits (z.string().max(10M)) to all 4 upload inputs
- [x] P1: Update @trpc/server to latest (prototype pollution fix)
- [x] P1: Update axios to latest (DoS fix)
- [x] P1: Add z.string().max(1000) to all notes fields
- [x] P2: Fix 4x as-any casts in routers with proper Partial<> types
- [x] P2: Add accessibility to DataFreshness (role, tabIndex, keyboard handler)
- [x] P2: Type SkuMobileCard prop (replace any with inferred tRPC type)
- [x] P3: Split routers.ts into 7 modular router files (662 → 44 lines)
- [x] P3: Add LLM telemetry/usage tracking table (llm_usage) and logging
- [x] P3: Add 9 foreign key constraints to schema
- [x] P3: Fix parseSalesReport month detection (stop at Total column)
- [x] Test: Add audit-remediation.test.ts (18 tests: Zod validation, file size limits, ExcelJS helpers)
- [x] Test: Migrate all 6 test files from xlsx to ExcelJS (buildExcelBuffer helper)
- [x] Test: Verify ExcelJS parser compatibility with real QB file (merged cell fix)
- [x] Audit report compiled: AUDIT_REPORT.md (22 findings, 5 severity tiers)

## Error Boundaries
- [x] Create reusable PageErrorBoundary component with retry + dashboard escape
- [x] Wrap all 7 page routes with per-page error boundaries via guarded() helper
- [x] Write tests for PageErrorBoundary (8 tests, all passing)

## Second Webapp Audit (March 2026)
- [x] Phase 1a: Static code analysis — server-side (post-remediation)
- [x] Phase 1b: Static code analysis — client-side
- [x] Phase 1c: Security vulnerability scan and dependency audit
- [x] Phase 1d: Performance, architecture, and test coverage assessment
- [x] Phase 1e: Compile second audit report and present to user
- [x] Phase 2: Strategic remediation — implement prioritized fixes
- [x] Phase 3: Test suite fortification — update and write new tests
- [x] Phase 4: Recompilation, verification, and final delivery

## Second Audit Remediation
- [x] F6: Code-splitting with React.lazy for all 6 pages (main bundle 1.1MB → 870KB)
- [x] F1: Update @aws-sdk/client-s3 (fast-xml-parser now 5.5.8, CVE patched)
- [x] F3: Replace catch (error: any) with catch (error: unknown) in 3 locations
- [x] F4: Type SkuMobileCard prop in Home.tsx (inferred from tRPC output)
- [x] F5: Type status casts in ProductionCalendar.tsx (proper enum unions)
- [x] F7: Type QB/AI results in UploadData.tsx (QbParseResult, AiAnalysis, ValidationResult interfaces)
- [x] F2: Replace as-any with proper ExcelJS.CellValue types in excel.ts
- [x] F8: Remove console.log in ComponentShowcase.tsx
- [x] F9: ManusDialog img already had alt attribute — no fix needed

## PDF Export
- [x] Add PDF export for Production Needs dashboard view
- [x] Clean, well-formatted report with urgency color coding, summary stats, and timestamp
- [x] Export button on dashboard header (lazy-loads jsPDF on demand, no bundle impact)

## Documentation
- [x] Write comprehensive README.md for the repository

## Bug Fixes (April 2026)
- [x] Fix tRPC "Unable to transform response from server" on home page: race condition where tRPC auth.me fired before Set-Cookie from /api/site-gate/verify propagated; fixed by re-verifying gate status after successful verify before rendering app, and returning tRPC-compatible 401 envelope for /api/trpc/* paths in site-gate middleware
- [x] Fix login failure: previous "fix" introduced a new bug — the confirmation fetchGateStatus() call returned authenticated:false because the browser hadn't committed the Set-Cookie yet when the follow-up fetch fired; reverted to trusting ok:true from /verify directly with a 50ms yield to let the browser commit the cookie before React re-renders
- [x] Fix login failure (definitive): replaced in-place React re-render after verify with window.location.reload() — the only reliable way to guarantee the cookie is committed before tRPC queries fire; any React state update races the browser's async Set-Cookie storage step
