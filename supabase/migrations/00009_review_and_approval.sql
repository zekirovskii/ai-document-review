create function public.update_review_analysis(p_document_id uuid, p_organization_id uuid, p_user_id uuid, p_document_type public.analysis_document_type, p_language text, p_summary text, p_risk_level public.analysis_risk_level, p_flags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.documents where id = p_document_id and organization_id = p_organization_id and status = 'REVIEW_REQUIRED') then raise exception 'Document is not reviewable'; end if;
  update public.analyses set document_type=p_document_type, language=p_language, summary=p_summary, risk_level=p_risk_level, flags=p_flags, updated_at=now() where document_id=p_document_id and organization_id=p_organization_id;
  if not found then raise exception 'Analysis does not exist'; end if;
  insert into public.audit_logs (organization_id,document_id,user_id,action,metadata) values (p_organization_id,p_document_id,p_user_id,'ANALYSIS_EDITED',jsonb_build_object('userId',p_user_id));
end; $$;

create function public.approve_document(p_document_id uuid, p_organization_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.documents where id=p_document_id and organization_id=p_organization_id and status='REVIEW_REQUIRED') then raise exception 'Document is not reviewable'; end if;
  if not exists (select 1 from public.analyses where document_id=p_document_id and organization_id=p_organization_id) then raise exception 'Analysis does not exist'; end if;
  update public.documents set status='APPROVED' where id=p_document_id and organization_id=p_organization_id;
  insert into public.audit_logs (organization_id,document_id,user_id,action,metadata) values (p_organization_id,p_document_id,p_user_id,'DOCUMENT_APPROVED',jsonb_build_object('userId',p_user_id));
end; $$;

revoke all on function public.update_review_analysis(uuid,uuid,uuid,public.analysis_document_type,text,text,public.analysis_risk_level,jsonb) from public;
revoke all on function public.approve_document(uuid,uuid,uuid) from public;
grant execute on function public.update_review_analysis(uuid,uuid,uuid,public.analysis_document_type,text,text,public.analysis_risk_level,jsonb) to service_role;
grant execute on function public.approve_document(uuid,uuid,uuid) to service_role;
