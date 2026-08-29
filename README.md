# Project Overview

GOATECH's AI Document Review Platform is a multi-tenant document-review assessment project. Milestone 1 establishes the workspace, shared contracts, and Supabase migrations. Application features are not implemented yet.

# Architecture

The repository is a pnpm workspace with planned services in `apps/web` (Next.js), `apps/api` (Express), and `apps/worker` (Node.js). Shared Zod schemas and TypeScript types live in `packages/shared`. Supabase migrations live in `supabase/migrations`.

# Local Setup

Use Node.js 20 or newer and Corepack:

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Copy each application `.env.example` file to `.env` before a future service needs its configuration. Do not commit `.env` files.

# Live Deployment

TODO: Railway deployment is not configured in Milestone 1.

# Database Model

The migrations define organizations, organization memberships, documents, analyses, processing jobs, and audit logs. Documents use the statuses `QUEUED`, `PROCESSING`, `REVIEW_REQUIRED`, `APPROVED`, and `FAILED`.

# Tenant Isolation

Row Level Security is enabled on application tables. Authenticated users can read an organization and its documents, analyses, and audit logs only when a security-definer membership check confirms that `auth.uid()` belongs to the organization. Users may read only their own membership rows, avoiding recursive membership policies.

# Background Processing

The database provides `claim_next_processing_job(worker_id)`, which locks one queued job and its queued document with `FOR UPDATE SKIP LOCKED`, marks both as processing, and returns the job atomically. A worker process has not been implemented yet.

# PDF Extraction

TODO: PDF extraction is not implemented. OCR is outside the initial scope.

# Structured Analysis & Validation

`packages/shared` defines the required Zod analysis schema: document type, language, summary, risk level, and flags. Persisting or generating analysis output is not implemented yet.

# Security

The `documents` Supabase Storage bucket is private and accepts only `application/pdf` objects up to 10 MiB. Browser storage policies are intentionally absent because planned uploads and downloads go through the backend; no browser client receives direct object access. Service-role credentials appear only in server application environment templates and must never be exposed through `NEXT_PUBLIC_*` variables.

# Technical Decisions

UUIDs are used for all application primary keys. Composite foreign keys keep analyses, processing jobs, and audit logs in the same organization as their document. A database trigger prevents invalid document-status transitions.

# Known Limitations

There is no login flow, API, upload path, worker loop, PDF extraction, deterministic provider, document UI, approval flow, Railway configuration, or migration test environment yet.

# Production Improvements

TODO: Define production deployment, operational monitoring, retry behavior, and other post-core requirements after the core product is complete.
