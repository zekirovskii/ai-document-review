create function public.create_queued_document(
  p_document_id uuid,
  p_organization_id uuid,
  p_uploaded_by uuid,
  p_original_filename text,
  p_storage_path text,
  p_file_size bigint
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_document public.documents;
begin
  insert into public.documents (id, organization_id, uploaded_by, original_filename, storage_path, mime_type, file_size, status)
  values (p_document_id, p_organization_id, p_uploaded_by, p_original_filename, p_storage_path, 'application/pdf', p_file_size, 'QUEUED')
  returning * into created_document;

  insert into public.processing_jobs (document_id, organization_id, status, attempts)
  values (p_document_id, p_organization_id, 'QUEUED', 0);

  insert into public.audit_logs (organization_id, document_id, user_id, action, metadata)
  values (p_organization_id, p_document_id, p_uploaded_by, 'DOCUMENT_UPLOADED', jsonb_build_object('originalFilename', p_original_filename, 'fileSize', p_file_size));

  return created_document;
end;
$$;

revoke all on function public.create_queued_document(uuid, uuid, uuid, text, text, bigint) from public;
grant execute on function public.create_queued_document(uuid, uuid, uuid, text, text, bigint) to service_role;
