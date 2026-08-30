alter table public.processing_jobs
  add column next_attempt_at timestamptz;

create index processing_jobs_retry_claim_idx
  on public.processing_jobs(status, next_attempt_at, created_at);

create or replace function public.enforce_document_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'QUEUED' then
      raise exception 'New documents must start with QUEUED status';
    end if;

    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'QUEUED' and new.status = 'PROCESSING' then
    return new;
  end if;

  if old.status = 'PROCESSING' and new.status = 'QUEUED' then
    if exists (
      select 1
      from public.processing_jobs as job
      where job.document_id = new.id
        and job.organization_id = new.organization_id
        and job.status = 'QUEUED'
        and job.next_attempt_at is not null
        and job.claimed_at is null
        and job.claimed_by is null
    ) then
      return new;
    end if;
  end if;

  if old.status = 'PROCESSING'
    and new.status in ('REVIEW_REQUIRED', 'FAILED') then
    return new;
  end if;

  if old.status = 'REVIEW_REQUIRED' and new.status = 'APPROVED' then
    return new;
  end if;

  raise exception 'Invalid document status transition: % -> %', old.status, new.status;
end;
$$;

create or replace function public.claim_next_processing_job(p_claimed_by text)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_job public.processing_jobs;
begin
  if p_claimed_by is null or char_length(trim(p_claimed_by)) = 0 then
    raise exception 'A worker identifier is required to claim a processing job';
  end if;

  select job.*
  into claimed_job
  from public.processing_jobs as job
  join public.documents as doc
    on doc.id = job.document_id
    and doc.organization_id = job.organization_id
  where job.status = 'QUEUED'
    and doc.status = 'QUEUED'
    and (job.next_attempt_at is null or job.next_attempt_at <= now())
  order by job.next_attempt_at nulls first, job.created_at
  for update of job, doc skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.processing_jobs
  set
    status = 'PROCESSING',
    claimed_at = now(),
    claimed_by = p_claimed_by,
    attempts = attempts + 1,
    next_attempt_at = null
  where id = claimed_job.id
  returning * into claimed_job;

  update public.documents
  set status = 'PROCESSING'
  where id = claimed_job.document_id
    and organization_id = claimed_job.organization_id;

  return claimed_job;
end;
$$;

create function public.retry_processing_job(p_job_id uuid, p_reason text, p_next_attempt_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_job public.processing_jobs;
begin
  if p_next_attempt_at is null then
    raise exception 'A next attempt time is required';
  end if;

  select job.*
  into active_job
  from public.processing_jobs as job
  where job.id = p_job_id
    and job.status = 'PROCESSING'
  for update;

  if not found then
    raise exception 'Processing job is not active';
  end if;

  if not exists (
    select 1
    from public.documents as document
    where document.id = active_job.document_id
      and document.organization_id = active_job.organization_id
      and document.status = 'PROCESSING'
  ) then
    raise exception 'Document is not processing';
  end if;

  update public.processing_jobs
  set
    status = 'QUEUED',
    claimed_at = null,
    claimed_by = null,
    last_error = left(p_reason, 120),
    next_attempt_at = p_next_attempt_at
  where id = active_job.id;

  update public.documents
  set status = 'QUEUED'
  where id = active_job.document_id
    and organization_id = active_job.organization_id
    and status = 'PROCESSING';

  insert into public.audit_logs (organization_id, document_id, action, metadata)
  values (
    active_job.organization_id,
    active_job.document_id,
    'PROCESSING_RETRY_SCHEDULED',
    jsonb_build_object(
      'jobId', active_job.id,
      'attempt', active_job.attempts,
      'nextAttemptAt', p_next_attempt_at,
      'reason', left(p_reason, 120)
    )
  );
end;
$$;

revoke all on function public.retry_processing_job(uuid, text, timestamptz) from public;
grant execute on function public.retry_processing_job(uuid, text, timestamptz) to service_role;
