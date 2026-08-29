create function public.claim_next_processing_job(p_claimed_by text)
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
  order by job.created_at
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
    attempts = attempts + 1
  where id = claimed_job.id
  returning * into claimed_job;

  update public.documents
  set status = 'PROCESSING'
  where id = claimed_job.document_id
    and organization_id = claimed_job.organization_id;

  return claimed_job;
end;
$$;

revoke all on function public.claim_next_processing_job(text) from public;
grant execute on function public.claim_next_processing_job(text) to service_role;
