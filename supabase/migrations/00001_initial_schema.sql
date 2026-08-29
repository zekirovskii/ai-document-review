create extension if not exists pgcrypto;

create type public.document_status as enum (
  'QUEUED',
  'PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'FAILED'
);

create type public.processing_job_status as enum (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

create type public.analysis_document_type as enum (
  'contract',
  'invoice',
  'report',
  'other'
);

create type public.analysis_risk_level as enum (
  'low',
  'medium',
  'high'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  original_filename text not null check (char_length(trim(original_filename)) > 0),
  storage_path text not null unique check (char_length(trim(storage_path)) > 0),
  mime_type text not null check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size > 0),
  status public.document_status not null default 'QUEUED',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, uploaded_by)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_type public.analysis_document_type not null,
  language text not null check (char_length(trim(language)) > 0),
  summary text not null check (char_length(trim(summary)) > 0),
  risk_level public.analysis_risk_level not null,
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents(id, organization_id)
    on delete cascade
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status public.processing_job_status not null default 'QUEUED',
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'QUEUED' and claimed_at is null and claimed_by is null)
    or (status <> 'QUEUED' and claimed_at is not null and claimed_by is not null)
  ),
  foreign key (document_id, organization_id)
    references public.documents(id, organization_id)
    on delete cascade
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents(id, organization_id)
    on delete restrict
);

create index organization_members_user_id_idx
  on public.organization_members(user_id);

create index documents_organization_id_created_at_idx
  on public.documents(organization_id, created_at desc);

create index documents_status_idx
  on public.documents(status);

create index processing_jobs_status_created_at_idx
  on public.processing_jobs(status, created_at);

create index audit_logs_organization_id_created_at_idx
  on public.audit_logs(organization_id, created_at desc);

create index audit_logs_document_id_idx
  on public.audit_logs(document_id);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger analyses_set_updated_at
before update on public.analyses
for each row execute function public.set_updated_at();

create trigger processing_jobs_set_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();
