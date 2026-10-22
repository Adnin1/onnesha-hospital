begin;

create or replace function public.has_permission(perm_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_caller_id is null or perm_code is null then return false; end if;

  select coalesce(p.active_organization_id, p.organization_id)
  into v_org_id
  from public.profiles p
  where p.id = v_caller_id and p.is_active is not false
  limit 1;

  if v_org_id is null then return false; end if;
  return public.is_org_admin_or_has_permission(v_org_id, perm_code);
end;
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated, service_role;

create or replace function public.search_referral_agents_for_billing(
  p_org_id uuid,
  p_query text default null
)
returns table(
  id uuid,
  agent_code character varying,
  full_name character varying,
  agent_type character varying,
  phone character varying,
  commission_rate_percent numeric,
  is_commission_eligible boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calling_user uuid := auth.uid();
  v_active_org uuid;
  v_is_super boolean := false;
  v_authorized boolean := false;
begin
  if v_calling_user is null then
    raise exception '401 Unauthorized' using errcode = '42501';
  end if;

  select coalesce(p.active_organization_id, p.organization_id),
         coalesce(p.is_super_admin, false)
  into v_active_org, v_is_super
  from public.profiles p
  where p.id = v_calling_user and p.is_active is not false
  limit 1;

  if v_active_org is null or (v_active_org <> p_org_id and not v_is_super) then
    raise exception '403 Forbidden: Organization mismatch' using errcode = '42501';
  end if;

  v_authorized :=
    public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    or public.is_org_admin_or_has_permission(p_org_id, 'billing.edit')
    or public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
    or public.is_org_admin_or_has_permission(p_org_id, 'billing.view')
    or public.is_org_admin_or_has_permission(p_org_id, 'referral.view')
    or public.is_org_admin_or_has_permission(p_org_id, 'referral.assign')
    or public.is_org_admin_or_has_permission(p_org_id, 'referral.create')
    or public.is_org_admin_or_has_permission(p_org_id, 'referral.manage')
    or public.is_org_admin_or_has_permission(p_org_id, 'patients.create');

  if v_authorized is not true then
    raise exception '403 Forbidden: Caller lacks configured referral/billing authority'
      using errcode = '42501';
  end if;

  return query
  select ra.id, ra.agent_code, ra.full_name, ra.agent_type, ra.phone,
         ra.commission_rate_percent, ra.is_commission_eligible
  from public.referral_agents ra
  where ra.organization_id = p_org_id
    and ra.is_active = true
    and ra.archived_at is null
    and (
      p_query is null
      or btrim(p_query) = ''
      or ra.agent_code ilike '%' || btrim(p_query) || '%'
      or ra.full_name ilike '%' || btrim(p_query) || '%'
      or ra.phone ilike '%' || btrim(p_query) || '%'
    )
  order by ra.full_name asc
  limit 50;
end;
$$;

revoke all on function public.search_referral_agents_for_billing(uuid, text) from public;
revoke all on function public.search_referral_agents_for_billing(uuid, text) from anon;
grant execute on function public.search_referral_agents_for_billing(uuid, text) to authenticated, service_role;

revoke all privileges on table public.roles from anon;
revoke all privileges on table public.role_permissions from anon;
revoke all privileges on table public.expenses from anon;

commit;
