create function public.enforce_document_status_transition()
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

create trigger documents_enforce_status_transition
before insert or update of status on public.documents
for each row execute function public.enforce_document_status_transition();
