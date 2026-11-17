# MotoSheba Development Execution Plan

Nov 16, 2026 · @comrade yunus

## Summary

MotoSheba will be built as plain HTML pages styled with Tailwind and driven by Alpine.js (both from CDN), calling serverless API functions that read and write MongoDB Atlas. Delivery follows the four phases of the concept document: marketplace, finance and insurance, AI assistance, then authorized integrations.

- **Target:** a working prototype of Phases 1–3 over 14 weeks (assumed: one semester). Phase 4 providers are simulated and labeled as simulations, as the concept document assumes.
- **Stack:** HTML + Tailwind CDN + Alpine CDN, Node.js serverless functions (Vercel-style `/api` folder), MongoDB Atlas through one connection string kept in an environment variable.
- **Rules carried over:** deterministic math for loan and fee figures; AI flags are prompts for human review; no estimate is shown as an official credit score, approval or ownership proof; sensitive documents are consent-gated and audit-logged.

## Architecture

&#91;embedded content: architecture · 4 layers\]

Pages are static files; role checks, business rules and database access sit in the API layer, so the browser never sees the Atlas connection string.

## Modules and roles

Each functional area from the concept document becomes a set of static pages plus a matching API group. Garage services and garage finance have no phase in the concept document; they are placed in Phase 2 here.

| Module | Pages (HTML) | Roles | Phase |
| --- | --- | --- | --- |
| Auth and accounts | `login`, `register`, `profile` | All | 1 |
| Marketplace | `listings`, `listing`, `compare`, `my-listings`, `inquiries`, `reservations` | Buyer, seller, dealer | 1 |
| Dealer storefront | `storefront`, `inventory`, `leads`, `staff` | Dealer | 1 |
| Admin | `admin-verify`, `admin-moderation`, `admin-users`, `admin-audit` | Administrator | 1 |
| Financing | `loan-calculator`, `lenders`, `finance-apply`, `my-applications` | Buyer, seller, garage | 2 |
| Insurance | `insurance-quote`, `policies`, `claim-prep`, `renewals` | Buyer, owner | 2 |
| Garage commerce | `garages`, `garage`, `booking`, `garage-dashboard` | Garage, buyer | 2 |
| Provider console (simulated) | `provider-queue`, `provider-application` | Insurer, lender | 2 |
| AI trust layer | `ai-review`, document upload panels | All, admin review | 3 |

Roles stored on the user record: `buyer`, `seller`, `dealer`, `garage`, `provider`, `admin`. Every API function checks the role before touching data.

## Data model

Thirteen MongoDB collections cover the platform; documents reference each other by `_id`. Create indexes in Phase 1 so search stays fast on the free Atlas tier.

| Collection | Holds | Key fields and indexes | Phase |
| --- | --- | --- | --- |
| `users` | Accounts and roles | `email` (unique), `passwordHash`, `role`, `status`, `verified` | 1 |
| `profiles` | Dealer, seller and garage details | `userId`, `businessName`, `licenseNo`, `verificationStatus` | 1 |
| `listings` | Car listings | `sellerId`, `make`, `model`, `year`, `price`, `condition`, `status`; text index on title and description; compound index on make, model, price | 1 |
| `inquiries` | Buyer questions | `listingId`, `buyerId`, `message`, `status` | 1 |
| `reservations` | Reservations and orders | `listingId`, `buyerId`, `status`, `timeline[]` | 1 |
| `auditLogs` | Admin and sensitive actions | `actorId`, `action`, `targetId`, `at` | 1 |
| `providers` | Lenders and insurers | `type`, `name`, `products[]`, `rules`, `isSimulated` | 2 |
| `applications` | Finance, insurance and claim applications | `type`, `applicantId`, `providerId`, `status`, `checklist[]`, `statusHistory[]` | 2 |
| `documents` | Upload metadata (file in blob storage) | `ownerId`, `applicationId`, `fileUrl`, `consent`, `expiresAt` | 2 |
| `garages` and `bookings` | Services, packages, appointments | `garageId`, `services[]`, `slot`, `status` | 2 |
| `complaints` | Disputes | `raisedBy`, `targetId`, `status` | 2 |
| `aiFlags` | Extraction results and review flags | `documentId`, `extracted`, `flags[]`, `reviewStatus`, `reviewedBy` | 3 |

Files are not stored in MongoDB. Use a blob or file host (for example Vercel Blob or Cloudinary) and keep only the URL and consent record in `documents`; set a short `expiresAt` to honor limited retention.

## API endpoints

One serverless function per route file under `/api`, all sharing three helpers: `lib/db.js` (a cached MongoClient reused across warm invocations), `lib/auth.js` (verifies a JWT from an httpOnly cookie and checks the role) and `lib/validate.js` (input checks). The Atlas connection string lives only in the `MONGODB_URI` environment variable.

| Group | Routes | Access | Phase |
| --- | --- | --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Public, then any signed-in user | 1 |
| Listings | `GET /api/listings` (search, filters, paging), `GET /api/listings/:id`, `POST /api/listings`, `PATCH /api/listings/:id`, `GET /api/compare?ids=` | Read public; write seller or dealer | 1 |
| Inquiries and reservations | `POST /api/inquiries`, `GET /api/inquiries`, `POST /api/reservations`, `PATCH /api/reservations/:id` | Buyer, seller, dealer | 1 |
| Admin | `GET /api/admin/queue`, `PATCH /api/admin/verify/:id`, `PATCH /api/admin/listings/:id`, `GET /api/admin/audit` | Admin | 1 |
| Finance | `POST /api/finance/calculate`, `GET /api/providers`, `POST /api/applications`, `PATCH /api/applications/:id/status`, `POST /api/documents/sign` | Calculator public; rest signed in | 2 |
| Insurance | `POST /api/insurance/quote`, `GET /api/insurance/compare`, `POST /api/claims` | Buyer, owner | 2 |
| Garages | `GET /api/garages`, `POST /api/bookings`, `PATCH /api/bookings/:id` | Garage, buyer | 2 |
| Provider (simulated) | `GET /api/provider/queue`, `PATCH /api/provider/applications/:id` | Provider | 2 |
| AI | `POST /api/ai/extract`, `POST /api/ai/check`, `GET /api/ai/flags/:id`, `PATCH /api/ai/flags/:id` | Owner and admin | 3 |

The finance calculator runs only deterministic formulas on the server and returns its assumptions with every result, matching the concept document's AI boundary. Every status change appends to `statusHistory` and writes an `auditLogs` entry.

## Execution plan

The 14-week schedule is an assumption; compress or stretch the bands to fit your term. Do not start a phase until its gate is met.

&#91;embedded content: roadmap · 5 phases, 5 gates\]

Tasks by phase, in build order:

**Phase 0: Setup**

- [ ] Create the Atlas project, database user and a `motosheba` database; copy the connection string into the host's environment settings as `MONGODB_URI`
- [ ] Create the repo with `/public` (HTML pages), `/api` (functions) and `/lib` (helpers)
- [ ] Write `lib/db.js`, `lib/auth.js`, `lib/validate.js` and a `GET /api/health` route
- [ ] Build the shared page shell: navbar, footer, Tailwind and Alpine script tags, a small `api.js` fetch wrapper

**Phase 1: Marketplace foundation**

- [ ] Register, login, logout and role guards (JWT in an httpOnly cookie, passwords hashed with bcrypt)
- [ ] Seller and dealer profiles with a verification status
- [ ] Listing create and edit with image upload, then listing search, filters and paging
- [ ] Compare page for up to three listings
- [ ] Inquiry and reservation flows with a visible status timeline
- [ ] Admin screens: verification queue, listing moderation, audit log

**Phase 2: Finance and insurance**

- [ ] Loan calculator with shown formula and assumptions (server-side)
- [ ] Provider directory seeded with clearly labeled simulated lenders and insurers
- [ ] Application form with document checklist, signed-link upload and status tracking
- [ ] Insurance quote request, policy comparison and claim-document preparation
- [ ] Garage profiles, service packages, booking and garage finance inquiry
- [ ] Simulated provider console that updates application status

**Phase 3: AI assistance**

- [ ] `POST /api/ai/extract`: OCR or model extraction of fields from an uploaded document, stored in `aiFlags`
- [ ] Cross-document checks (name, chassis and amount mismatches) that raise flags, not verdicts
- [ ] Duplicate listing and image detection (hash match first)
- [ ] Evidence-linked summary and a reviewer screen to confirm or dismiss each flag
- [ ] Track extraction accuracy and false-positive rate for the success measures

**Phase 4: Integration readiness and hardening**

- [ ] Provider adapter interface so a real insurer, lender or payment gateway can replace a simulator
- [ ] Rate limiting, input validation review and role-access test pass
- [ ] Replace the Tailwind CDN with a built stylesheet
- [ ] Seed demo data and rehearse the final demo

## Risks, testing and launch checklist

The biggest technical risks come from the serverless and CDN choices; the biggest product risks are the ones the concept document already names.

| Risk | Mitigation |
| --- | --- |
| Tailwind CDN ships the full runtime and is meant for development | Acceptable for the prototype; switch to the Tailwind CLI build before any production launch |
| Serverless functions open too many Atlas connections | Cache one `MongoClient` outside the handler; set a small `maxPoolSize`; stay within the Atlas free-tier connection limit |
| Atlas rejects dynamic serverless IPs | Allow `0.0.0.0/0` in Atlas network access and rely on a strong database user password; tighten if the host offers fixed IPs |
| Secrets leak into front-end code | Keep `MONGODB_URI`, `JWT_SECRET` and AI keys in environment variables only; never in HTML or Alpine state |
| Page guards are bypassed in the browser | Alpine guards are for display only; every API route re-checks the JWT and role |
| AI flags read as accusations or approvals | Label flags "for human review"; never show an internal estimate as a credit score, approval or verified ownership |
| Lender and insurer APIs are unavailable | Ship simulated providers marked as simulations; build Phase 4 behind a provider adapter interface |
| Sensitive documents mishandled | Consent before upload, short-lived signed links, `expiresAt` retention, audit log on every read |
| Legal and licensing gaps | Review commissions, insurance distribution, payments and data protection before production, as the concept document requires |

**Testing.** Unit-test the loan and fee formulas; integration-test each API route against a separate Atlas test database; test every route as each role to confirm access limits; run a manual walkthrough per role at the end of each phase; check pages at phone and laptop widths.

**Launch checklist**

- [ ] Production Atlas cluster, database user and backups configured
- [ ] All secrets set in the host's environment settings
- [ ] Indexes created and confirmed by running the main search queries
- [ ] Tailwind CDN replaced with a built stylesheet
- [ ] Simulated providers visibly labeled on every page that shows them
- [ ] Admin account created and audit log reviewed
- [ ] Legal and compliance review signed off
- [ ] Success measures from the concept document wired to simple admin counts
