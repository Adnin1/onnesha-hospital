begin;

drop policy if exists rls_roles on public.roles;
drop policy if exists rls_role_permissions on public.role_permissions;

create or replace function public.get_current_user_permissions(p_org_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_effective_org uuid;
  v_is_super boolean := false;
  v_has_membership boolean := false;
  v_roles text[] := array[]::text[];
  v_perms text[] := array[]::text[];
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', '401 Unauthorized');
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_caller_id
  limit 1;

  if v_profile.id is null or v_profile.is_active is false then
    return jsonb_build_object('success', false, 'error', '403 Forbidden: inactive or missing profile');
  end if;

  v_is_super := (
    v_profile.is_super_admin is true
    or lower(trim(replace(coalesce(v_profile.role, ''), ' ', '_'))) = 'super_admin'
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = v_caller_id
        and ur.is_active is not false
        and lower(trim(replace(r.name, ' ', '_'))) = 'super_admin'
    )
  );

  v_effective_org := coalesce(
    p_org_id,
    private.get_current_org_id(),
    v_profile.active_organization_id,
    v_profile.organization_id
  );

  if v_effective_org is null then
    return jsonb_build_object('success', false, 'error', '403 Forbidden: organization context required');
  end if;

  select (
    v_profile.organization_id = v_effective_org
    or v_profile.active_organization_id = v_effective_org
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = v_caller_id
        and ur.organization_id = v_effective_org
        and ur.is_active is not false
    )
  ) into v_has_membership;

  if not v_is_super and not coalesce(v_has_membership, false) then
    return jsonb_build_object('success', false, 'error', '403 Forbidden: cross-tenant organization context');
  end if;

  select coalesce(array_agg(distinct x.norm_role), array[]::text[])
  into v_roles
  from (
    select lower(trim(replace(r.name, ' ', '_'))) as norm_role
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_caller_id
      and ur.organization_id = v_effective_org
      and ur.is_active is not false
    union
    select lower(trim(replace(v_profile.role, ' ', '_')))
    where v_profile.role is not null
      and trim(v_profile.role) <> ''
      and (
        v_profile.organization_id = v_effective_org
        or v_profile.active_organization_id = v_effective_org
        or v_is_super
      )
  ) x
  where x.norm_role is not null and x.norm_role <> '';

  if v_is_super then
    v_perms := array['*']::text[];
  else
    select coalesce(array_agg(distinct rp.permission_key::text), array[]::text[])
    into v_perms
    from public.role_permissions rp
    where rp.role_id in (
      select ur.role_id
      from public.user_roles ur
      where ur.user_id = v_caller_id
        and ur.organization_id = v_effective_org
        and ur.is_active is not false
      union
      select r.id
      from public.roles r
      where r.organization_id = v_effective_org
        and lower(trim(replace(r.name, ' ', '_'))) = any(v_roles)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'authoritative', true,
    'user_id', v_caller_id,
    'organization_id', v_effective_org,
    'is_super_admin', v_is_super,
    'roles', v_roles,
    'permissions', v_perms
  );
end;
$$;

revoke all on function public.get_current_user_permissions(uuid) from public;
revoke all on function public.get_current_user_permissions(uuid) from anon;
grant execute on function public.get_current_user_permissions(uuid) to authenticated, service_role;

create or replace function public.is_org_admin_or_has_permission(p_org_id uuid, p_perm_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_super boolean := false;
  v_has_membership boolean := false;
begin
  if v_caller_id is null or p_org_id is null or p_perm_key is null then
    return false;
  end if;

  select * into v_profile from public.profiles p where p.id = v_caller_id limit 1;
  if v_profile.id is null or v_profile.is_active is false then return false; end if;

  v_is_super := (
    v_profile.is_super_admin is true
    or lower(trim(replace(coalesce(v_profile.role, ''), ' ', '_'))) = 'super_admin'
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = v_caller_id
        and ur.is_active is not false
        and lower(trim(replace(r.name, ' ', '_'))) = 'super_admin'
    )
  );

  if v_is_super then return true; end if;

  select (
    v_profile.organization_id = p_org_id
    or v_profile.active_organization_id = p_org_id
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_caller_id
        and ur.organization_id = p_org_id
        and ur.is_active is not false
    )
  ) into v_has_membership;

  if not coalesce(v_has_membership, false) then return false; end if;

  return exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_caller_id
      and ur.organization_id = p_org_id
      and ur.is_active is not false
      and lower(trim(replace(r.name, ' ', '_'))) in ('admin', 'hospital_administrator')
  )
  or exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = v_caller_id
      and ur.organization_id = p_org_id
      and ur.is_active is not false
      and (rp.permission_key::text = p_perm_key or rp.permission_key::text = '*')
  )
  or exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.organization_id = p_org_id
      and lower(trim(replace(r.name, ' ', '_'))) = lower(trim(replace(coalesce(v_profile.role, ''), ' ', '_')))
      and (rp.permission_key::text = p_perm_key or rp.permission_key::text = '*')
      and (v_profile.organization_id = p_org_id or v_profile.active_organization_id = p_org_id)
  );
end;
$$;

revoke all on function public.is_org_admin_or_has_permission(uuid, text) from public;
revoke all on function public.is_org_admin_or_has_permission(uuid, text) from anon;
grant execute on function public.is_org_admin_or_has_permission(uuid, text) to authenticated, service_role;

drop policy if exists ref_agents_select on public.referral_agents;
create policy ref_agents_select on public.referral_agents
for select to authenticated, service_role
using (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'referral.view')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.create')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.assign')
    or public.is_org_admin_or_has_permission(organization_id, 'billing.view')
    or public.is_org_admin_or_has_permission(organization_id, 'billing.create')
    or public.is_org_admin_or_has_permission(organization_id, 'patients.view')
  )
);

drop policy if exists ref_agents_insert on public.referral_agents;
create policy ref_agents_insert on public.referral_agents
for insert to authenticated, service_role
with check (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'referral.create')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.assign')
    or public.is_org_admin_or_has_permission(organization_id, 'billing.create')
  )
);

drop policy if exists ref_agents_update on public.referral_agents;
create policy ref_agents_update on public.referral_agents
for update to authenticated, service_role
using (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'referral.edit')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.create')
  )
)
with check (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'referral.edit')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    or public.is_org_admin_or_has_permission(organization_id, 'referral.create')
  )
);

drop policy if exists rls_expenses_select on public.expenses;
create policy rls_expenses_select on public.expenses
for select to authenticated, service_role
using (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'expenses.view')
    or public.is_org_admin_or_has_permission(organization_id, 'expenses.manage')
    or public.is_org_admin_or_has_permission(organization_id, 'expenses.create')
    or public.is_org_admin_or_has_permission(organization_id, 'accounting.view')
  )
);

drop policy if exists rls_expenses_insert on public.expenses;
create policy rls_expenses_insert on public.expenses
for insert to authenticated, service_role
with check (
  organization_id = coalesce(
    private.get_current_org_id(),
    (select p.active_organization_id from public.profiles p where p.id = auth.uid()),
    (select p.organization_id from public.profiles p where p.id = auth.uid())
  )
  and (
    public.is_org_admin_or_has_permission(organization_id, 'expenses.create')
    or public.is_org_admin_or_has_permission(organization_id, 'expenses.manage')
  )
);

drop policy if exists referral_agents_select on public.referral_agents;
drop policy if exists referral_agents_insert on public.referral_agents;
drop policy if exists referral_agents_update on public.referral_agents;
drop policy if exists referral_agents_delete on public.referral_agents;

commit;
