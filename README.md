# Project Overview

GOATECH AI Document Review Platform is a multi-tenant PDF review application. Users authenticate with Supabase, upload a PDF for their organization, and receive an asynchronously generated structured analysis. A human reviewer can correct the analysis and approve the document.

The core implementation uses local deterministic, rule-based analysis. An optional Gemini provider is available as a bonus integration and always falls back to the deterministic provider when its request or output fails validation.

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
        AnalysisProvider
           ├─ Gemini (optional)
           └─ deterministic default / fallback
                           │ Zod validation
                           ▼
                    REVIEW_REQUIRED
                           │ human edit / approval
                           ▼
                       APPROVED
```

# Features

- Supabase Auth with server-verified Bearer tokens and organization-scoped access.
- Private PDF upload, asynchronous processing, structured analysis, human review, and approval.
- Atomic PostgreSQL job lifecycle with bounded retries and safe stale-job recovery.
- Optional Gemini analysis with deterministic fallback; deterministic analysis remains the core default.

# Technology Stack

- Next.js 15 and React 19 web application
- Express and TypeScript API; Node.js TypeScript worker
- Supabase Auth, PostgreSQL, private Storage, and SQL RPCs
- pnpm workspace, Zod, Vitest, GitHub Actions, Railway, and Docker

# Repository Structure

```text
apps/web       Next.js browser application
apps/api       Express API
apps/worker    background job processor
packages/shared shared Zod contracts and types
supabase/migrations ordered database, RLS, Storage, and RPC migrations
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
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
UPLOAD_RATE_LIMIT_MAX_REQUESTS=10
MUTATION_RATE_LIMIT_MAX_REQUESTS=60
READINESS_TIMEOUT_MS=3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`PORT` takes precedence over `API_PORT`; Railway provides `PORT` automatically. `SUPABASE_ANON_KEY` is not used by the current API. The rate-limit variables are server-only API settings and default to the values shown when omitted.

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
WORKER_MAX_ATTEMPTS=3
WORKER_RETRY_BASE_DELAY_MS=5000
WORKER_RETRY_MAX_DELAY_MS=60000
WORKER_HEARTBEAT_INTERVAL_MS=60000
LOG_LEVEL=info
ANALYSIS_PROVIDER=deterministic
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_INPUT_CHARS=120000
```

`ANALYSIS_PROVIDER` defaults to `deterministic`, which requires no Gemini configuration and keeps analysis local to application logic. Set it to `gemini` only in the worker after configuring a Gemini API key. `GEMINI_MAX_INPUT_CHARS` caps the extracted-text sent in one request; input is deterministically truncated to the first 120,000 characters, rather than chunked.

Retry settings are Worker-only and default to three total attempts, a five-second base delay, and a 60-second delay cap.

Service-role credentials and `GEMINI_API_KEY` must never be exposed to browser code or placed in `NEXT_PUBLIC_*` variables.

`LOG_LEVEL` is optional for both API and Worker and defaults to `info`. Supported values are `debug`, `info`, `warn`, and `error`.

Optional observability settings:

```env
# API: cap the safe dependency readiness check.
READINESS_TIMEOUT_MS=3000
# Worker: emit one lifecycle heartbeat log at this interval.
WORKER_HEARTBEAT_INTERVAL_MS=60000
```

# Railway Deployment

The production deployment has three Railway services:

- Web: <https://web-production-c4c7c.up.railway.app>
- API: <https://api-production-d637c.up.railway.app>
- Worker: no public domain; it runs continuously as a background service

Verified health endpoint: <https://api-production-d637c.up.railway.app/health>

The API listens on Railway's `PORT`. The web service is built with the public API URL, and the API's `CORS_ORIGIN` is configured for the deployed web origin. The worker has no public listener. Configure Railway's API healthcheck as `/health`; it is intentionally independent of Supabase so a short dependency outage does not restart a healthy API process. Use `/ready` as a diagnostic dependency check instead.

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

# Document Lifecycle

```text
QUEUED → PROCESSING → REVIEW_REQUIRED → APPROVED
                 └→ FAILED

retryable processing failure → scheduled retry → QUEUED → later PROCESSING
```

The worker increments an attempt count during each atomic claim. Retryable infrastructure failures use deterministic exponential backoff, capped at `WORKER_RETRY_MAX_DELAY_MS`; after `WORKER_MAX_ATTEMPTS`, the job and document become `FAILED`.

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

# PDF Upload & Private Storage

The authenticated API accepts one multipart PDF, validates MIME type, `%PDF-` signature, size, and a normalized safe filename, then uploads it to the private `documents` bucket. It generates the path server-side as `<organization_id>/<document_id>/<safe_filename>` and creates the `QUEUED` document, job, and upload audit record through one restricted RPC. Browser clients receive no public Storage URL.

# Background Processing

The upload HTTP request stores the PDF and creates a `QUEUED` document and processing job; it does not extract or analyze content inline.

The worker continuously polls the PostgreSQL-backed queue. `claim_next_processing_job` uses `FOR UPDATE SKIP LOCKED` to claim one queued job safely when multiple worker instances are present. It atomically moves both the job and document to processing and records claim metadata.

Completion and failure are persisted through restricted database RPCs. A document-processing failure is handled per job so the worker continues polling. Jobs left in `PROCESSING` beyond `WORKER_STALE_PROCESSING_MS` (default five minutes) are marked `FAILED` by the stale-job recovery RPC.

# Retry & Job Handling

The worker reuses the existing processing job for bounded retries. Transient infrastructure failures currently classified as retryable are `STORAGE_DOWNLOAD_FAILED` and `ANALYSIS_PERSISTENCE_FAILED`; PDF extraction errors, no extractable text, and invalid analysis output fail immediately. Gemini request failures still use their existing deterministic fallback and do not trigger a retry when that fallback succeeds.

Each atomic claim increments `attempts`. Before the configured maximum, retryable failures are returned to `QUEUED` with `next_attempt_at` set using deterministic exponential backoff: `min(WORKER_RETRY_BASE_DELAY_MS * 2^(attempt - 1), WORKER_RETRY_MAX_DELAY_MS)`. Claims continue to use `FOR UPDATE SKIP LOCKED` and only select scheduled jobs whose next attempt is due. At the maximum attempt, the existing final failure RPC marks the document/job `FAILED`. Retry scheduling records a safe `PROCESSING_RETRY_SCHEDULED` audit event.

This is intentionally simple: there is no dead-letter queue, distributed queue broker, or jittered/adaptive backoff. Stale `PROCESSING` jobs continue to use the existing final stale-recovery failure path rather than retrying indefinitely.

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

The core `DeterministicAnalysisProvider` uses local rules for document type, language, risk keywords, summary, and flags. It remains the default provider and is always available.

# Gemini Bonus Provider

The optional bonus `GeminiAnalysisProvider` uses Google's official `@google/genai` Node.js SDK with the stable `gemini-2.5-flash` default model. This model supports structured output and is a practical price/performance choice for text analysis. The provider requests JSON structured output with the exact required fields, parses it, and then validates it with the same shared `analysisOutputSchema`; model structured output does not replace application validation. The worker validates the final provider result again immediately before persistence.

When `ANALYSIS_PROVIDER=gemini`, a Gemini request, parsing, or Zod-validation failure logs only a high-level warning and runs the deterministic provider instead. A successful fallback proceeds normally to `REVIEW_REQUIRED`; only a failure on both paths follows the existing controlled failure flow. There is no unbounded Gemini retry behavior.

Gemini mode sends only the bounded extracted document text to Google's Gemini API. It does not send Supabase credentials, auth tokens, organization membership data, storage URLs, or raw document/model output to logs. Use deterministic mode where document text must remain within application-controlled processing.

## Enabling Gemini on Railway

Do not add Gemini variables to the Web or API Railway services. Add these variables only to the Worker service, then redeploy that Worker service:

```env
ANALYSIS_PROVIDER=gemini
GEMINI_API_KEY=<secret>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_INPUT_CHARS=120000
```

The Worker fails startup with a clear configuration error if Gemini mode is selected without `GEMINI_API_KEY`. Unknown provider values also fail startup. No database migration is needed because Gemini uses the existing analysis contract and tables.

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
- `GEMINI_API_KEY` is Worker-only and never enters browser configuration or logs.
- RLS and explicit API organization filters provide defense in depth.
- Browser clients have no broad direct table-write or Storage-object policies.
- Storage paths are generated server-side from the resolved organization and generated document UUID.
- PDF signature and size checks happen before Storage upload.
- API routes use in-memory, IP-based rate limits as application-level abuse protection: 120 protected requests/minute, 10 PDF uploads/minute, and 60 review/approval mutations/minute by default. `/health` is not rate limited.
- The API trusts exactly one Railway reverse-proxy hop so Express's standard client-IP handling is available to the rate limiter. Limit-exceeded requests return the standard `429` JSON error with `RATE_LIMITED`; no package-default HTML/text response is exposed.
- `SECURITY DEFINER` functions use a fixed `search_path`; sensitive RPC execution is restricted to `service_role`.
- API errors use controlled JSON responses, and cross-tenant lookups use `404`.

# Rate Limiting

The API applies in-memory, IP-based limits after authentication: 120 protected requests per minute, 10 uploads per minute, and 60 review/approval mutations per minute by default. Each API instance maintains its own counters. `/health` and `/ready` remain public operational endpoints and are not rate limited.

# API Endpoints

All endpoints except the public liveness and readiness checks require a verified Supabase Bearer token and a resolved organization membership.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Unauthenticated service health check. |
| `GET` | `/ready` | Unauthenticated dependency readiness check; verifies safe PostgreSQL RPC reachability. |
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

Final validation covers 26 API tests, 44 Worker tests, and 3 shared-contract tests (73 total). The Web package has no dedicated automated test files.

Coverage includes authentication, tenant scoping, PDF validation and queue creation, lifecycle handling, review/approval validation, deterministic analysis, Gemini fallback, extraction, atomic claims, retries, rate limits, structured logging, readiness, and worker heartbeat behavior. Gemini tests mock the SDK boundary and never call the external API or require an API key.

API tests also cover health-check bypass, general/upload/mutation limits, standardized `429` responses, proxy configuration, and preservation of unauthenticated request handling. Rate limiters are created per Express app instance so test state is isolated.

# Continuous Integration

GitHub Actions validates every push to `main` and every pull request targeting `main`. The validation-only workflow runs `lint`, `typecheck`, `test`, and `build` with Node.js 22, Corepack, and a frozen pnpm lockfile. It uses only fake public build-time placeholders for Next.js; it requires no production Supabase, Railway, or Gemini secrets. Railway deployment remains separate and is not performed by CI.

# Docker

Portable production images are available at the repository root:

```bash
docker build -f Dockerfile.api -t goatech-api .
docker build -f Dockerfile.worker -t goatech-worker .
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=public-placeholder \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 \
  -f Dockerfile.web -t goatech-web .
```

Run API and Worker with their normal runtime variables, never image-baked secrets:

```bash
docker run --rm -p 3001:3001 --env-file apps/api/.env goatech-api
docker run --rm --env-file apps/worker/.env goatech-worker
docker run --rm -p 3000:3000 -e PORT=3000 goatech-web
```

The Web image receives only `NEXT_PUBLIC_*` configuration at build time. API and Worker receive Supabase and Gemini credentials only at runtime. Docker is a portable option; the validated live deployment remains the three-service Railway deployment.

# Structured Logging

The API and Worker emit machine-readable JSON logs suitable for Railway, including timestamp, level, service, and message. API logs assign or reuse `x-request-id`, return it to callers, and record safe request completion fields. Worker logs record concise job lifecycle context, such as worker/job/document IDs and analysis-provider outcomes. `LOG_LEVEL=info` is the default; set it on the API and Worker Railway services if a different level is needed.

Logs intentionally exclude authorization headers, cookies, request bodies, PDF text, raw Gemini output, Gemini API keys, and Supabase credentials. This is structured application logging, not a full monitoring or observability platform. Deployments remain separate: redeploy API and Worker to enable the change; the Web service is unchanged.

## Observability

`/health` is a cheap API liveness check: it does not authenticate, call Supabase, or contact Gemini. `/ready` is a separate public dependency check that confirms API configuration was loaded at startup and performs a non-mutating, restricted PostgreSQL RPC with a short timeout. Its client response reports only `ok` or `failed`; detailed database errors stay out of responses.

API JSON logs include request IDs, method, path, status code, and duration. Worker JSON logs include job/retry and Gemini fallback lifecycle categories, plus one configurable heartbeat per minute by default with safe worker state timestamps and the selected provider. Railway log filtering can use fields such as `service`, `requestId`, `errorCode`, `jobId`, `attempt`, and `nextAttemptAt`.

There is no external metrics backend, tracing platform, alerting, or persisted metrics in this deployment.

# Technical Decisions

- pnpm workspaces keep web, API, worker, and shared contracts in one repository.
- Express keeps the assessment API small and explicit.
- Supabase supplies the required PostgreSQL, Auth, and private Storage services.
- PostgreSQL-backed jobs avoid an additional Redis dependency.
- `FOR UPDATE SKIP LOCKED` provides concurrency-safe worker claims.
- A deterministic analyzer establishes the required core flow; Gemini is an optional provider behind the same analysis boundary with deterministic fallback.
- `express-rate-limit` provides lightweight per-instance, IP-based limits at the HTTP API boundary with modern `RateLimit` headers.
- Shared Zod contracts validate analysis at worker, API, and persistence boundaries.
- Database RPCs keep document/job/audit transitions atomic.
- Private Storage is server-mediated rather than exposed to browser clients.
- Node 22 is used for compatibility with the current Supabase client.
- Separate Node 22 Docker images keep the workspace portable without changing Railway behavior.

# Known Limitations

- OCR is not implemented; scanned/image-only PDFs fail with a controlled extraction error.
- Gemini input is bounded by truncation; advanced chunking, RAG, and embeddings are not implemented.
- Retry backoff is bounded and database-backed, but there is no dead-letter queue or distributed queue broker.
- There is lightweight service readiness and heartbeat logging, but no external metrics, tracing, or alerting platform.
- Durable request-level upload idempotency is not implemented.
- Rate limits use in-memory counters. If the API runs multiple Railway replicas, each replica maintains separate counters; limits are not globally distributed.
- Organization switching and multi-membership selection are not implemented.
- The web package does not yet have dedicated automated test files.

# Production Improvements

- Add OCR for scanned PDFs.
- Add a dead-letter queue or broker if more advanced retry routing is required.
- Use a shared store such as Redis if globally consistent limits are needed across multiple API replicas.
- Add distributed metrics, tracing, and alerting.
- Add deeper frontend end-to-end test coverage.

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
- Readiness: <https://api-production-d637c.up.railway.app/ready>
- Demo Users: listed above
