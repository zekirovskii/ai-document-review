grant usage on schema public to service_role;

grant select
on table public.organization_members,
  public.documents,
  public.analyses
to service_role;
