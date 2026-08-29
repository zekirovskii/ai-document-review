create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.documents enable row level security;
alter table public.analyses enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Organization members can view their organizations"
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy "Users can view their own memberships"
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

create policy "Organization members can view documents"
on public.documents
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "Organization members can view analyses"
on public.analyses
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "Organization members can view audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_organization_member(organization_id));
