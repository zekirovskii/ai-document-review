create function public.reap_stale_processing_jobs(p_claimed_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_job public.processing_jobs;
  reaped_count integer := 0;
begin
  for stale_job in
    select job.*
    from public.processing_jobs as job
    join public.documents as document
      on document.id = job.document_id
      and document.organization_id = job.organization_id
    where job.status = 'PROCESSING'
      and document.status = 'PROCESSING'
      and job.claimed_at < p_claimed_before
    order by job.claimed_at
    for update of job, document skip locked
  loop
    update public.documents
    set status = 'FAILED', failure_reason = 'PROCESSING_TIMEOUT'
    where id = stale_job.document_id
      and organization_id = stale_job.organization_id
      and status = 'PROCESSING';

    update public.processing_jobs
    set status = 'FAILED', last_error = 'PROCESSING_TIMEOUT'
    where id = stale_job.id
      and status = 'PROCESSING';

    insert into public.audit_logs (organization_id, document_id, action, metadata)
    values (
      stale_job.organization_id,
      stale_job.document_id,
      'DOCUMENT_FAILED',
      jsonb_build_object('jobId', stale_job.id, 'reason', 'PROCESSING_TIMEOUT')
    );

    reaped_count := reaped_count + 1;
  end loop;

  return reaped_count;
end;
$$;

revoke all on function public.reap_stale_processing_jobs(timestamptz) from public;
grant execute on function public.reap_stale_processing_jobs(timestamptz) to service_role;
