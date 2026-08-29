create function public.complete_processing_job(p_job_id uuid, p_document_type public.analysis_document_type, p_language text, p_summary text, p_risk_level public.analysis_risk_level, p_flags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id = p_job_id and status = 'PROCESSING' for update;
  if not found then raise exception 'Processing job is not active'; end if;
  if not exists (select 1 from public.documents where id = job.document_id and organization_id = job.organization_id and status = 'PROCESSING') then raise exception 'Document is not processing'; end if;
  insert into public.analyses (document_id, organization_id, document_type, language, summary, risk_level, flags) values (job.document_id, job.organization_id, p_document_type, p_language, p_summary, p_risk_level, p_flags);
  update public.documents set status = 'REVIEW_REQUIRED' where id = job.document_id;
  update public.processing_jobs set status = 'COMPLETED' where id = job.id;
  insert into public.audit_logs (organization_id, document_id, action, metadata) values (job.organization_id, job.document_id, 'ANALYSIS_COMPLETED', jsonb_build_object('jobId', job.id));
end; $$;

create function public.fail_processing_job(p_job_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id = p_job_id and status = 'PROCESSING' for update;
  if not found then raise exception 'Processing job is not active'; end if;
  update public.documents set status = 'FAILED', failure_reason = left(p_reason, 120) where id = job.document_id and status = 'PROCESSING';
  update public.processing_jobs set status = 'FAILED', last_error = left(p_reason, 120) where id = job.id;
  insert into public.audit_logs (organization_id, document_id, action, metadata) values (job.organization_id, job.document_id, 'DOCUMENT_FAILED', jsonb_build_object('jobId', job.id, 'reason', left(p_reason, 120)));
end; $$;

revoke all on function public.complete_processing_job(uuid, public.analysis_document_type, text, text, public.analysis_risk_level, jsonb) from public;
revoke all on function public.fail_processing_job(uuid, text) from public;
grant execute on function public.complete_processing_job(uuid, public.analysis_document_type, text, text, public.analysis_risk_level, jsonb) to service_role;
grant execute on function public.fail_processing_job(uuid, text) to service_role;
