# Project Overview

GOATECH AI Document Review Platform is a multi-tenant PDF review application. Users authenticate with Supabase, upload a PDF for their organization, and receive an asynchronously generated, deterministic structured analysis. A human reviewer can correct the analysis and approve the document.

The core implementation intentionally uses rule-based analysis rather than a real LLM.

# Architecture

This repository is a pnpm workspace:

- `apps/web` — Next.js frontend
- `apps/api` — Express and TypeScript backend API
- `apps/worker` — Node.js background worker
- `packages/shared` — shared Zod schemas and TypeScript types
- `supabase/migrations` — PostgreSQL schema, RLS, Storage, lifecycle, job, and review RPC migrations

```text
Browser → Supabase Auth → Next.js web
                           │ Bearer token
                           ▼
                       Express API ──→ Supabase PostgreSQL / private Storage
                           │
Upload → QUEUED document + job
                           │
                           ▼
                    Railway worker
                           │
              text PDF extraction (pdf-parse)
                           │
             deterministic rule-based analysis
                           │ Zod validation
                           ▼
                    REVIEW_REQUIRED
                           │ human edit / approval
                           ▼
                       APPROVED
```

# Local Setup

Prerequisites:

- Node.js 22 or newer (`.nvmrc` pins `22.20.0`)
- pnpm via Corepack
- A Supabase project
- A Supabase CLI login for migrations

Create local environment files from the templates. Never commit the resulting `.env` files.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env

corepack enable
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Run the services in separate terminals:

```bash
corepack pnpm --filter @goatech/api dev
corepack pnpm --filter @goatech/web dev
corepack pnpm --filter @goatech/worker dev
```

Apply database migrations to a linked Supabase project:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

## Environment Variables

API (`apps/api/.env` locally; Railway Variables in production):

```env
NODE_ENV=development
API_PORT=3001
MAX_PDF_SIZE_BYTES=10485760
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`PORT` takes precedence over `API_PORT`; Railway provides `PORT` automatically. `SUPABASE_ANON_KEY` is not used by the current API.

Web (`apps/web/.env.local` locally; Railway Variables at build time in production):

```env
NODE_ENV=development
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Worker (`apps/worker/.env` locally; Railway Variables in production):

```env
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WORKER_ID=local-worker-1
WORKER_POLL_INTERVAL_MS=2000
WORKER_STALE_PROCESSING_MS=300000
```

Service-role credentials must never be exposed to browser code or placed in `NEXT_PUBLIC_*` variables.

# Live Deployment

The production deployment has three Railway services:

- Web: <https://web-production-c4c7c.up.railway.app>
- API: <https://api-production-d637c.up.railway.app>
- Worker: no public domain; it runs continuously as a background service

Verified health endpoint: <https://api-production-d637c.up.railway.app/health>

The API listens on Railway's `PORT`. The web service is built with the public API URL, and the API's `CORS_ORIGIN` is configured for the deployed web origin. The worker has no public listener.

# Database Model

The PostgreSQL schema uses UUID primary keys and these entities:

- `organizations` — tenant records
- `organization_members` — organization/user memberships
- `documents` — uploaded PDF metadata, Storage path, lifecycle status, and failure reason
- `analyses` — one structured analysis per document
- `processing_jobs` — background job state, claims, attempts, and errors
- `audit_logs` — organization-scoped lifecycle and review events

Document statuses are `QUEUED`, `PROCESSING`, `REVIEW_REQUIRED`, `APPROVED`, and `FAILED`. Processing jobs use separate `QUEUED`, `PROCESSING`, `COMPLETED`, and `FAILED` states.

Composite document/organization foreign keys keep analyses, jobs, and audit records within the same tenant. Indexes support organization document listing, queued-job selection, and audit lookups.

# Tenant Isolation

Tenant isolation is enforced in depth:

- The API verifies the Supabase Bearer token.
- The API derives the organization from `organization_members`; it never accepts `organization_id` from client input.
- API document and analysis queries explicitly filter by the resolved organization.
- RLS is enabled for organizations, memberships, documents, analyses, processing jobs, and audit logs.
- The membership helper is `SECURITY DEFINER` with a fixed empty `search_path`, avoiding recursive membership RLS evaluation.
- Cross-tenant or missing document lookups return `404` without exposing existence.
- Private Storage paths use `<organization_id>/<document_id>/<safe_filename>`.

The core assessment flow supports exactly one membership per demo user. Missing or multiple memberships are rejected with a controlled `403`; organization switching is not implemented.

# Background Processing

The upload HTTP request stores the PDF and creates a `QUEUED` document and processing job; it does not extract or analyze content inline.

The worker continuously polls the PostgreSQL-backed queue. `claim_next_processing_job` uses `FOR UPDATE SKIP LOCKED` to claim one queued job safely when multiple worker instances are present. It atomically moves both the job and document to processing and records claim metadata.

Completion and failure are persisted through restricted database RPCs. A document-processing failure is handled per job so the worker continues polling. Jobs left in `PROCESSING` beyond `WORKER_STALE_PROCESSING_MS` (default five minutes) are marked `FAILED` by the stale-job recovery RPC.

# PDF Extraction

The worker uses `pdf-parse` for text-based PDFs with selectable text. OCR is not implemented, so scanned or image-only PDFs cannot be processed. Missing meaningful extracted text and extraction errors result in a controlled `FAILED` state.

The API validates one PDF upload per request using MIME type, `%PDF-` signature, a safe normalized filename, and a configured size limit. The default maximum is 10 MiB; this is a project technical choice rather than an assessment requirement.

# Structured Analysis & Validation

The required analysis contract is shared by API and worker code:

```ts
{
  documentType: "contract" | "invoice" | "report" | "other",
  language: string,
  summary: string,
  riskLevel: "low" | "medium" | "high",
  flags: string[]
}
```

The current worker uses a deterministic rule-based analyzer for document type, language, risk keywords, summary, and flags. Its output is always validated by the shared Zod schema before persistence. Invalid output is not persisted and processing fails safely.

# Human Review & Approval

Documents in `REVIEW_REQUIRED` expose editable analysis fields:

- Document Type
- Language
- Summary
- Risk Level
- Flags

Edits are validated by the shared Zod schema and are only permitted in `REVIEW_REQUIRED`. Approval is limited to `REVIEW_REQUIRED → APPROVED`. The API revalidates persisted analysis before approval, and approved documents become read-only in the UI. Database lifecycle triggers and review RPCs enforce the same lifecycle boundaries server-side.

# Security

- Supabase Auth handles authentication.
- The backend verifies Bearer tokens independently.
- PDFs live in the private `documents` Supabase Storage bucket; there are no public document URLs.
- Service-role keys exist only in API/worker server configuration.
- RLS and explicit API organization filters provide defense in depth.
- Browser clients have no broad direct table-write or Storage-object policies.
- Storage paths are generated server-side from the resolved organization and generated document UUID.
- PDF signature and size checks happen before Storage upload.
- `SECURITY DEFINER` functions use a fixed `search_path`; sensitive RPC execution is restricted to `service_role`.
- API errors use controlled JSON responses, and cross-tenant lookups use `404`.

# API Endpoints

All endpoints except health require a verified Supabase Bearer token and a resolved organization membership.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Unauthenticated service health check. |
| `GET` | `/documents` | List documents in the caller's organization. |
| `POST` | `/documents` | Validate, privately store, and queue one PDF. |
| `GET` | `/documents/:id` | Return one same-tenant document and validated analysis. |
| `PATCH` | `/documents/:id/analysis` | Update analysis during `REVIEW_REQUIRED`. |
| `POST` | `/documents/:id/approve` | Approve a `REVIEW_REQUIRED` document. |

# Audit Trail

The current core flow records these events:

- `DOCUMENT_UPLOADED`
- `ANALYSIS_COMPLETED`
- `ANALYSIS_EDITED`
- `DOCUMENT_APPROVED`
- `DOCUMENT_FAILED`

Metadata records identifiers and limited operational details such as file size, job ID, failure reason, or user ID. It does not store raw PDF content or secrets. There is no `PROCESSING_STARTED` audit event in the current implementation.

# Testing

Vitest covers shared schema/status contracts, API behavior, and focused worker pipeline boundaries. The API suite covers health, CORS preflight, missing and invalid authentication, membership denial, organization-scoped listing and document lookup, PDF validation, and queue creation. It also verifies Railway `PORT` precedence.

Worker tests cover deterministic analysis classification/language/risk output, PDF extraction wrapper outcomes, shared-schema rejection, success and failure persistence paths, atomic-claim RPC invocation, and polling resilience. The current suite contains 3 shared-schema tests, 11 API tests, and 26 worker tests. The web package has no dedicated test files yet; build, typecheck, and manual production flow verification cover its current core integration.

# Technical Decisions

- pnpm workspaces keep web, API, worker, and shared contracts in one repository.
- Express keeps the assessment API small and explicit.
- Supabase supplies the required PostgreSQL, Auth, and private Storage services.
- PostgreSQL-backed jobs avoid an additional Redis dependency.
- `FOR UPDATE SKIP LOCKED` provides concurrency-safe worker claims.
- A deterministic analyzer establishes the required core flow; an LLM is a future enhancement.
- Shared Zod contracts validate analysis at worker, API, and persistence boundaries.
- Database RPCs keep document/job/audit transitions atomic.
- Private Storage is server-mediated rather than exposed to browser clients.
- Node 22 is used for compatibility with the current Supabase client.

# Known Limitations

- OCR is not implemented; scanned/image-only PDFs fail with a controlled extraction error.
- A real LLM/Gemini provider is not integrated.
- Analysis is intentionally simple and deterministic.
- There is no advanced retry/backoff or dead-letter queue.
- There is no advanced observability, monitoring, or operational alerting.
- Durable request-level upload idempotency is not implemented.
- Organization switching and multi-membership selection are not implemented.
- The web package does not yet have dedicated automated test files.

# Production Improvements

- Add a Gemini or other LLM provider behind the existing analysis boundary.
- Add OCR for scanned PDFs.
- Add retry/backoff, dead-letter handling, and idempotent upload requests.
- Add rate limiting.
- Add CI/CD, structured logs, metrics, and alerting.
- Expand API, worker, and frontend test coverage.

# Demo Users

These are intentionally limited assessment demo credentials.

| Organization | Email | Password |
| --- | --- | --- |
| Anatolia | `yusuf.demo@example.com` | `Demo1234!` |
| Northstar | `emma.demo@example.com` | `Demo1234!` |

# Submission Links

- Git Repository: <https://github.com/zekirovskii/goatech-ai-document-review>
- Live Application: <https://web-production-c4c7c.up.railway.app>
- Backend API: <https://api-production-d637c.up.railway.app>
- Health: <https://api-production-d637c.up.railway.app/health>
- Demo Users: listed above
