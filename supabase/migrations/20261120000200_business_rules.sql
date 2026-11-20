-- =============================================================================
-- Business rules: helpers, validation, routing, approvals, balances, claims,
-- payments, reminders/escalation, reports.
-- All state changes to leave_requests / claims go through these functions,
-- so every invalid entry is blocked server-side with a clear message and
-- every change is written to the audit trail.
-- =============================================================================

-- ---------- Helpers -----------------------------------------------------------
create or replace function public.sg_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Singapore')::date
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and is_active
$$;

-- has_role('hr','finance') -> true if the signed-in worker has any of the roles (admin always true)
create or replace function public.has_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid() and is_active
      and (role::text = any (p_roles) or role = 'admin')
  )
$$;

-- true if p_manager is anywhere above p_employee in the reporting line
create or replace function public.manages(p_manager uuid, p_employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select e.manager_id, 1 as depth from public.employees e where e.id = p_employee
    union all
    select e.manager_id, c.depth + 1
    from public.employees e join chain c on e.id = c.manager_id
    where c.depth < 20
  )
  select p_manager is not null and exists (select 1 from chain where manager_id = p_manager)
$$;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default)
$$;

-- Working days between two dates (inclusive), excluding Sat/Sun and gazetted public holidays.
create or replace function public.working_days(p_start date, p_end date)
returns int language sql stable set search_path = public as $$
  select count(*)::int
  from generate_series(p_start, p_end, interval '1 day') as d
  where extract(isodow from d) < 6
    and not exists (select 1 from public.public_holidays h where h.holiday_date = d::date)
$$;

create or replace function public.next_reference(p_prefix text, p_year int)
returns text language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.reference_counters (prefix, year, last) values (p_prefix, p_year, 1)
  on conflict (prefix, year) do update set last = public.reference_counters.last + 1
  returning last into v_n;
  return p_prefix || '-' || p_year || '-' || lpad(v_n::text, 4, '0');
end $$;

create or replace function public.log_audit(
  p_entity_type text, p_entity_id uuid, p_reference text, p_action text, p_actor uuid,
  p_from text default null, p_to text default null, p_remark text default null,
  p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (entity_type, entity_id, reference, action, actor_id, from_status, to_status, remark, details)
  values (p_entity_type, p_entity_id, p_reference, p_action, p_actor, p_from, p_to, p_remark, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public.notify(
  p_recipient uuid, p_kind text, p_title text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_id, kind, title, body, link)
  select p_recipient, p_kind, p_title, p_body, p_link where p_recipient is not null;
$$;

create or replace function public.notify_roles(
  p_roles text[], p_kind text, p_title text, p_body text default null, p_link text default null,
  p_exclude uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_id, kind, title, body, link)
  select e.id, p_kind, p_title, p_body, p_link
  from public.employees e
  where e.is_active and e.role::text = any (p_roles)
    and (p_exclude is null or e.id <> p_exclude);
$$;

-- Approver routing: line manager -> otherwise a Director -> otherwise HR/admin.
-- Nobody ever approves their own request.
create or replace function public.route_approver(p_employee uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select m.id into v_id
  from public.employees e join public.employees m on m.id = e.manager_id
  where e.id = p_employee and m.is_active and m.id <> p_employee;
  if v_id is not null then return v_id; end if;

  select id into v_id from public.employees
  where role = 'director' and is_active and id <> p_employee
  order by hire_date, full_name limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from public.employees
  where role in ('admin', 'hr') and is_active and id <> p_employee
  order by (role = 'admin') desc, hire_date limit 1;
  return v_id;
end $$;

-- ---------- Entitlements & balances ------------------------------------------
-- Contract entitlement for the year, pro-rated by completed months for joiners
-- (e.g. 14 days AL, joined 1 Jul 2026 -> 6 months -> 7 days).
create or replace function public.prorated_entitlement(p_employee uuid, p_type text, p_year int)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_hire date; v_t public.leave_types; v_months int;
begin
  select hire_date into v_hire from public.employees where id = p_employee;
  select * into v_t from public.leave_types where code = p_type;
  if v_hire is null or v_t.code is null then return 0; end if;
  if v_hire > make_date(p_year, 12, 31) then return 0; end if;
  if not v_t.prorate_for_joiners or v_hire <= make_date(p_year, 1, 1) then return v_t.default_days; end if;
  v_months := 12 - extract(month from v_hire)::int + 1;
  if extract(day from v_hire) > 1 then v_months := v_months - 1; end if;  -- first month not completed
  return round(v_t.default_days * greatest(v_months, 0) / 12.0);
end $$;

create or replace function public.ensure_entitlements(p_employee uuid, p_year int)
returns void language sql security definer set search_path = public as $$
  insert into public.leave_entitlements (employee_id, leave_type_code, year, entitled_days, note)
  select p_employee, t.code, p_year, public.prorated_entitlement(p_employee, t.code, p_year),
         case when t.prorate_for_joiners and e.hire_date > make_date(p_year, 1, 1)
              then 'Pro-rated from hire date ' || to_char(e.hire_date, 'DD Mon YYYY') end
  from public.leave_types t
  cross join public.employees e
  where e.id = p_employee and t.track_balance and t.is_active
  on conflict (employee_id, leave_type_code, year) do nothing;
$$;

-- HR: generate entitlements for every active worker for a year (e.g. roll over to 2027)
create or replace function public.generate_entitlements(p_year int)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  if not public.has_role('hr') then raise exception 'Only HR can generate entitlements.'; end if;
  for r in select id from public.employees where is_active loop
    perform public.ensure_entitlements(r.id, p_year);
    v_count := v_count + 1;
  end loop;
  perform public.log_audit('entitlement', null, null, 'generated', public.current_employee_id(),
                           null, null, 'Entitlements generated for ' || p_year, jsonb_build_object('workers', v_count));
  return v_count;
end $$;

-- Balance = contract entitlement - approved - pending - linked usage
-- (linked usage: e.g. sick leave days count toward the hospitalisation cap)
create or replace function public.leave_balance(p_employee uuid, p_type text, p_year int, p_exclude uuid default null)
returns table (entitled numeric, taken numeric, pending numeric, linked numeric, available numeric)
language sql stable security definer set search_path = public as $$
  with ent as (
    select coalesce(
      (select en.entitled_days + en.carried_forward + en.adjustment
         from public.leave_entitlements en
        where en.employee_id = p_employee and en.leave_type_code = p_type and en.year = p_year),
      public.prorated_entitlement(p_employee, p_type, p_year)) as e
  ), own as (
    select coalesce(sum(days) filter (where status = 'approved'), 0) as t,
           coalesce(sum(days) filter (where status = 'pending'), 0)  as p
    from public.leave_requests
    where employee_id = p_employee and leave_type_code = p_type
      and extract(year from start_date) = p_year
      and (p_exclude is null or id <> p_exclude)
  ), lnk as (
    select coalesce(sum(r.days), 0) as l
    from public.leave_requests r join public.leave_types lt on lt.code = r.leave_type_code
    where lt.counts_toward_code = p_type and r.employee_id = p_employee
      and r.status in ('approved', 'pending')
      and extract(year from r.start_date) = p_year
      and (p_exclude is null or r.id <> p_exclude)
  )
  select ent.e, own.t, own.p, lnk.l, ent.e - own.t - own.p - lnk.l from ent, own, lnk
$$;

-- Master Leave Record (RLS of the caller applies: staff see their own, managers their team, HR everyone)
create view public.leave_balances with (security_invoker = true) as
select
  en.id                          as entitlement_id,
  en.employee_id,
  en.leave_type_code,
  en.year,
  en.entitled_days,
  en.carried_forward,
  en.adjustment,
  en.entitled_days + en.carried_forward + en.adjustment as entitled,
  coalesce(own.taken, 0)         as taken,
  coalesce(own.pending, 0)       as pending,
  coalesce(lnk.linked, 0)        as linked,
  en.entitled_days + en.carried_forward + en.adjustment
    - coalesce(own.taken, 0) - coalesce(own.pending, 0) - coalesce(lnk.linked, 0) as available,
  en.note
from public.leave_entitlements en
left join lateral (
  select sum(r.days) filter (where r.status = 'approved') as taken,
         sum(r.days) filter (where r.status = 'pending')  as pending
  from public.leave_requests r
  where r.employee_id = en.employee_id and r.leave_type_code = en.leave_type_code
    and extract(year from r.start_date) = en.year
) own on true
left join lateral (
  select sum(r.days) as linked
  from public.leave_requests r join public.leave_types lt on lt.code = r.leave_type_code
  where lt.counts_toward_code = en.leave_type_code and r.employee_id = en.employee_id
    and r.status in ('approved', 'pending') and extract(year from r.start_date) = en.year
) lnk on true;

-- ---------- Leave validation --------------------------------------------------
create or replace function public.validate_leave(
  p_employee uuid, p_type text, p_start date, p_end date,
  p_part public.day_part default 'full', p_document text default null, p_exclude uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp      public.employees;
  v_type     public.leave_types;
  v_errors   text[] := '{}';
  v_flags    jsonb  := '{}'::jsonb;
  v_days     numeric := 0;
  v_year     int;
  v_bal      record;
  v_cap      record;
  v_ex       record;
  v_overlap  text;
  v_clash    jsonb;
  v_today    date := public.sg_today();
  v_approver uuid;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or not v_emp.is_active then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Worker record not found or inactive.'));
  end if;

  select * into v_type from public.leave_types where code = p_type and is_active;
  if v_type.code is null then
    v_errors := array_append(v_errors, 'Choose a valid leave type.');
  end if;

  if p_start is null or p_end is null then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(array_append(v_errors, 'Start and end dates are required.')));
  end if;
  if p_end < p_start then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(array_append(v_errors, 'End date cannot be before the start date.')));
  end if;
  if extract(year from p_start) <> extract(year from p_end) then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(array_append(v_errors,
      'Leave cannot run across two calendar years. Submit one application for each year.')));
  end if;
  v_year := extract(year from p_start)::int;

  if p_part <> 'full' then
    if p_start <> p_end then
      v_errors := array_append(v_errors, 'A half day must start and end on the same date.');
    elsif v_type.code is not null and not v_type.allow_half_day then
      v_errors := array_append(v_errors, format('%s cannot be taken as a half day.', v_type.name));
    end if;
  end if;

  v_days := public.working_days(p_start, p_end);
  if p_part <> 'full' and v_days > 0 then v_days := 0.5; end if;
  if v_days = 0 then
    v_errors := array_append(v_errors, 'The selected dates fall only on weekends or public holidays, so no leave is needed.');
  end if;

  if p_start < v_emp.hire_date then
    v_errors := array_append(v_errors, format('Leave cannot start before your hire date (%s).', to_char(v_emp.hire_date, 'DD Mon YYYY')));
  end if;

  if v_type.code is not null and not v_type.allow_backdate and p_start < v_today then
    v_errors := array_append(v_errors, format('%s cannot be backdated. Ask HR to record past leave.', v_type.name));
  end if;

  if v_type.requires_document and coalesce(btrim(p_document), '') = '' then
    v_errors := array_append(v_errors, format('%s is required for %s.', coalesce(v_type.document_label, 'A supporting document'), v_type.name));
  end if;

  -- Overlap with the worker's own pending/approved leave (AM + PM on the same day is allowed)
  select string_agg(r.reference, ', ' order by r.start_date) into v_overlap
  from public.leave_requests r
  where r.employee_id = p_employee and r.status in ('pending', 'approved')
    and (p_exclude is null or r.id <> p_exclude)
    and r.start_date <= p_end and r.end_date >= p_start
    and not (r.day_part <> 'full' and p_part <> 'full' and r.day_part <> p_part);
  if v_overlap is not null then
    v_errors := array_append(v_errors, format('You already have leave on these dates (%s).', v_overlap));
  end if;

  if v_type.code is not null and v_type.track_balance then
    perform public.ensure_entitlements(p_employee, v_year);
    select * into v_bal from public.leave_balance(p_employee, p_type, v_year, p_exclude);
    v_flags := v_flags || jsonb_build_object('balance_before', v_bal.available, 'balance_after', v_bal.available - v_days,
                                             'entitled', v_bal.entitled);
    if v_days > v_bal.available then
      v_errors := array_append(v_errors, format('Not enough %s: %s day(s) requested but only %s available for %s.',
        v_type.name, v_days, greatest(v_bal.available, 0), v_year));
    end if;
    if v_type.counts_toward_code is not null then
      select * into v_cap from public.leave_balance(p_employee, v_type.counts_toward_code, v_year, p_exclude);
      if v_days > v_cap.available then
        v_errors := array_append(v_errors, format('This would exceed the %s cap: only %s day(s) left (%s counts toward it).',
          (select name from public.leave_types where code = v_type.counts_toward_code), greatest(v_cap.available, 0), v_type.name));
      end if;
    end if;
  end if;

  if v_type.requires_exhausted_code is not null then
    select * into v_ex from public.leave_balance(p_employee, v_type.requires_exhausted_code, v_year, p_exclude);
    if v_ex.available > 0 then
      v_errors := array_append(v_errors, format('Use your remaining %s (%s day(s)) before applying for %s.',
        (select name from public.leave_types where code = v_type.requires_exhausted_code), v_ex.available, v_type.name));
    end if;
  end if;

  -- Flags shown to the approver (not blocks)
  if v_type.min_notice_days > 0 and p_start >= v_today and (p_start - v_today) < v_type.min_notice_days then
    v_flags := v_flags || jsonb_build_object('short_notice', true, 'notice_days', p_start - v_today,
                                             'required_notice_days', v_type.min_notice_days);
  end if;

  select jsonb_agg(jsonb_build_object('name', e.full_name, 'reference', r.reference, 'status', r.status,
                                      'start_date', r.start_date, 'end_date', r.end_date) order by r.start_date)
    into v_clash
  from public.leave_requests r join public.employees e on e.id = r.employee_id
  where r.status in ('approved', 'pending') and r.employee_id <> p_employee
    and (p_exclude is null or r.id <> p_exclude)
    and r.start_date <= p_end and r.end_date >= p_start
    and (e.department_id = v_emp.department_id or (v_emp.manager_id is not null and e.manager_id = v_emp.manager_id));
  if v_clash is not null then
    v_flags := v_flags || jsonb_build_object('clash', v_clash);
  end if;

  v_approver := public.route_approver(p_employee);

  return jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'errors', to_jsonb(v_errors),
    'flags', v_flags,
    'days', v_days,
    'year', v_year,
    'approver_id', v_approver,
    'approver_name', (select full_name from public.employees where id = v_approver));
end $$;

-- Live preview for the request form (no data written except missing entitlement rows)
create or replace function public.preview_leave(
  p_type text, p_start date, p_end date, p_part public.day_part default 'full', p_document text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_employee_id();
begin
  if v_me is null then raise exception 'Your sign-in is not linked to a worker record. Ask HR to add you.'; end if;
  return public.validate_leave(v_me, p_type, p_start, p_end, p_part, p_document, null);
end $$;

create or replace function public.raise_validation(p_result jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not coalesce((p_result ->> 'ok')::boolean, false) then
    raise exception '%', (select string_agg(x, ' ') from jsonb_array_elements_text(p_result -> 'errors') as x)
      using errcode = 'P0001';
  end if;
end $$;

-- ---------- Leave workflow ----------------------------------------------------
create or replace function public.submit_leave_request(
  p_type text, p_start date, p_end date, p_part public.day_part default 'full',
  p_reason text default null, p_document text default null, p_attachment_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_employee_id();
  v_res jsonb;
  v_id  uuid;
  v_ref text;
  v_name text;
  v_type_name text;
begin
  if v_me is null then raise exception 'Your sign-in is not linked to a worker record. Ask HR to add you.'; end if;
  v_res := public.validate_leave(v_me, p_type, p_start, p_end, p_part, p_document, null);
  perform public.raise_validation(v_res);

  v_ref := public.next_reference('LV', extract(year from p_start)::int);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, day_part, days,
                                     reason, document_ref, attachment_path, status, approver_id, flags)
  values (v_ref, v_me, p_type, p_start, p_end, p_part, (v_res ->> 'days')::numeric,
          nullif(btrim(p_reason), ''), nullif(btrim(p_document), ''), p_attachment_path, 'pending',
          (v_res ->> 'approver_id')::uuid, v_res -> 'flags')
  returning id into v_id;

  select full_name into v_name from public.employees where id = v_me;
  select name into v_type_name from public.leave_types where code = p_type;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', v_me, null, 'pending', nullif(btrim(p_reason), ''),
                           jsonb_build_object('days', v_res -> 'days', 'flags', v_res -> 'flags'));
  perform public.notify((v_res ->> 'approver_id')::uuid, 'approval_request',
    format('%s requested %s', v_name, v_type_name),
    format('%s · %s to %s · %s day(s)', v_ref, to_char(p_start, 'DD Mon'), to_char(p_end, 'DD Mon YYYY'), v_res ->> 'days'),
    '/inbox');

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'pending', 'approver_name', v_res -> 'approver_name');
end $$;

create or replace function public.decide_leave_request(p_id uuid, p_decision text, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_employee_id();
  v_req public.leave_requests;
  v_res jsonb;
  v_new public.leave_status;
  v_emp_name text;
  v_type_name text;
begin
  if v_me is null then raise exception 'Your sign-in is not linked to a worker record.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject.'; end if;

  select * into v_req from public.leave_requests where id = p_id for update;
  if v_req.id is null then raise exception 'Leave request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This request is already %.', v_req.status; end if;
  if v_req.employee_id = v_me then raise exception 'You cannot approve or reject your own request.'; end if;
  if v_me is distinct from v_req.approver_id and v_me is distinct from v_req.escalated_to_id and not public.has_role('admin') then
    raise exception 'Only the assigned approver can decide this request.';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_remark), '') = '' then
    raise exception 'Add a remark explaining why the request is rejected.';
  end if;

  if p_decision = 'approve' then
    -- Re-check against the latest balance and leave records (excluding this request)
    v_res := public.validate_leave(v_req.employee_id, v_req.leave_type_code, v_req.start_date, v_req.end_date,
                                   v_req.day_part, coalesce(v_req.document_ref, 'n/a'), v_req.id);
    -- backdating rule applies at submission only
    v_res := jsonb_set(v_res, '{errors}', coalesce((
      select jsonb_agg(x) from jsonb_array_elements_text(v_res -> 'errors') x where x not like '%cannot be backdated%'), '[]'::jsonb));
    v_res := jsonb_set(v_res, '{ok}', to_jsonb(jsonb_array_length(v_res -> 'errors') = 0));
    perform public.raise_validation(v_res);
    v_new := 'approved';
  else
    v_new := 'rejected';
  end if;

  update public.leave_requests
     set status = v_new, decided_by = v_me, decided_at = now(), decision_remark = nullif(btrim(p_remark), ''),
         flags = case when v_new = 'approved' then flags || (v_res -> 'flags') else flags end
   where id = p_id;

  perform public.log_audit('leave', p_id, v_req.reference, p_decision || 'd', v_me, 'pending', v_new::text, nullif(btrim(p_remark), ''));

  select full_name into v_emp_name from public.employees where id = v_req.employee_id;
  select name into v_type_name from public.leave_types where code = v_req.leave_type_code;
  perform public.notify(v_req.employee_id, 'decision',
    format('Your %s was %s', v_type_name, v_new),
    format('%s · %s to %s%s', v_req.reference, to_char(v_req.start_date, 'DD Mon'), to_char(v_req.end_date, 'DD Mon YYYY'),
           coalesce(' · "' || nullif(btrim(p_remark), '') || '"', '')),
    '/time-off/' || p_id);
  if v_new = 'approved' then
    perform public.notify_roles(array['office_manager', 'hr'], 'info',
      format('Leave approved: %s', v_emp_name),
      format('%s · %s · %s to %s · %s day(s). Leave record updated automatically.', v_req.reference, v_type_name,
             to_char(v_req.start_date, 'DD Mon'), to_char(v_req.end_date, 'DD Mon YYYY'), v_req.days),
      '/hr/tracker', v_req.employee_id);
  end if;
  if v_req.escalated_to_id is not null then
    perform public.notify(case when v_me = v_req.approver_id then v_req.escalated_to_id else v_req.approver_id end,
      'info', format('%s was %s', v_req.reference, v_new), null, '/time-off/' || p_id);
  end if;

  return jsonb_build_object('id', p_id, 'reference', v_req.reference, 'status', v_new);
end $$;

create or replace function public.cancel_leave_request(p_id uuid, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_employee_id();
  v_req public.leave_requests;
begin
  select * into v_req from public.leave_requests where id = p_id for update;
  if v_req.id is null then raise exception 'Leave request not found.'; end if;
  if v_req.employee_id <> v_me and not public.has_role('hr') then raise exception 'You can only cancel your own leave.'; end if;
  if v_req.status not in ('pending', 'approved') then raise exception 'This request is already %.', v_req.status; end if;
  if v_req.status = 'approved' and v_req.start_date <= public.sg_today() and not public.has_role('hr') then
    raise exception 'Leave that has already started can only be changed by HR.';
  end if;

  update public.leave_requests set status = 'cancelled', cancelled_at = now(),
         decision_remark = coalesce(decision_remark, nullif(btrim(p_remark), ''))
   where id = p_id;
  perform public.log_audit('leave', p_id, v_req.reference, 'cancelled', v_me, v_req.status::text, 'cancelled', nullif(btrim(p_remark), ''));
  perform public.notify(v_req.approver_id, 'info', format('%s was cancelled', v_req.reference),
                        'The balance has been restored automatically.', '/time-off/' || p_id);
  if v_req.status = 'approved' then
    perform public.notify_roles(array['office_manager'], 'info', format('Approved leave cancelled: %s', v_req.reference),
                                null, '/hr/tracker', v_req.employee_id);
  end if;
  return jsonb_build_object('id', p_id, 'reference', v_req.reference, 'status', 'cancelled');
end $$;

-- ---------- Claims ------------------------------------------------------------
-- p_lines: [{expense_date, category_code, description, amount, receipt_no, attachment_path}]
create or replace function public.validate_claim(
  p_employee uuid, p_title text, p_lines jsonb, p_declaration boolean, p_exclude uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_errors text[] := '{}';
  v_over   jsonb  := '[]'::jsonb;
  v_late   jsonb  := '[]'::jsonb;
  v_total  numeric := 0;
  v_today  date := public.sg_today();
  v_late_days int := public.setting_int('late_claim_days', 90);
  v_line   jsonb;
  v_i      int;
  v_date   date;
  v_amt    numeric;
  v_cat    public.claim_categories;
  v_rcpt   text;
  v_seen   text[] := '{}';
  v_dupe   text;
begin
  if coalesce(btrim(p_title), '') = '' then
    v_errors := array_append(v_errors, 'Give the claim a title (e.g. "Client visit – Nov 2026").');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    v_errors := array_append(v_errors, 'Add at least one expense line.');
    p_lines := '[]'::jsonb;
  elsif jsonb_array_length(p_lines) > 30 then
    v_errors := array_append(v_errors, 'A claim can have at most 30 lines.');
  end if;

  for v_line, v_i in select value, ordinality from jsonb_array_elements(p_lines) with ordinality loop
    begin
      v_date := nullif(v_line ->> 'expense_date', '')::date;
    exception when others then v_date := null;
    end;
    begin
      v_amt := round(nullif(v_line ->> 'amount', '')::numeric, 2);
    exception when others then v_amt := null;
    end;
    select * into v_cat from public.claim_categories where code = v_line ->> 'category_code' and is_active;
    v_rcpt := nullif(btrim(v_line ->> 'receipt_no'), '');

    if v_date is null then
      v_errors := array_append(v_errors, format('Line %s: expense date is required.', v_i));
    elsif v_date > v_today then
      v_errors := array_append(v_errors, format('Line %s: expense date cannot be in the future.', v_i));
    elsif v_today - v_date > v_late_days then
      v_late := v_late || jsonb_build_array(v_i);
    end if;
    if v_cat.code is null then
      v_errors := array_append(v_errors, format('Line %s: choose an expense category.', v_i));
    end if;
    if coalesce(btrim(v_line ->> 'description'), '') = '' then
      v_errors := array_append(v_errors, format('Line %s: description is required.', v_i));
    end if;
    if v_amt is null or v_amt <= 0 then
      v_errors := array_append(v_errors, format('Line %s: amount must be greater than 0.', v_i));
    else
      v_total := v_total + v_amt;
      if v_cat.per_line_limit is not null and v_amt > v_cat.per_line_limit then
        v_over := v_over || jsonb_build_array(jsonb_build_object('line', v_i, 'category', v_cat.name,
                                                                 'amount', v_amt, 'limit', v_cat.per_line_limit));
      end if;
    end if;
    if v_cat.requires_receipt and v_rcpt is null then
      v_errors := array_append(v_errors, format('Line %s: receipt number is required for %s.', v_i, v_cat.name));
    end if;
    if v_rcpt is not null then
      if lower(v_rcpt) = any (v_seen) then
        v_errors := array_append(v_errors, format('Line %s: receipt %s appears twice in this claim.', v_i, v_rcpt));
      end if;
      v_seen := array_append(v_seen, lower(v_rcpt));
      v_dupe := null;
      select c.reference into v_dupe
      from public.claim_lines l join public.claims c on c.id = l.claim_id
      where c.employee_id = p_employee and lower(l.receipt_no) = lower(v_rcpt)
        and c.status not in ('cancelled', 'rejected') and (p_exclude is null or c.id <> p_exclude)
      limit 1;
      if v_dupe is not null then
        v_errors := array_append(v_errors, format('Line %s: receipt %s was already claimed in %s.', v_i, v_rcpt, v_dupe));
      end if;
    end if;
  end loop;

  if not coalesce(p_declaration, false) then
    v_errors := array_append(v_errors, 'Tick the declaration to confirm the expenses are genuine, business-related and not claimed elsewhere.');
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'errors', to_jsonb(v_errors),
    'total', v_total,
    'flags', jsonb_strip_nulls(jsonb_build_object(
       'over_limit', case when jsonb_array_length(v_over) > 0 then v_over end,
       'late_lines', case when jsonb_array_length(v_late) > 0 then v_late end)),
    'approver_id', public.route_approver(p_employee),
    'approver_name', (select full_name from public.employees where id = public.route_approver(p_employee)));
end $$;

create or replace function public.preview_claim(p_title text, p_lines jsonb, p_declaration boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_employee_id();
begin
  if v_me is null then raise exception 'Your sign-in is not linked to a worker record. Ask HR to add you.'; end if;
  return public.validate_claim(v_me, p_title, p_lines, p_declaration, null);
end $$;

create or replace function public.write_claim_lines(p_claim uuid, p_lines jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.claim_lines (claim_id, line_no, expense_date, category_code, description, amount, receipt_no, attachment_path)
  select p_claim, l.ordinality, (l.value ->> 'expense_date')::date, l.value ->> 'category_code',
         btrim(l.value ->> 'description'), round((l.value ->> 'amount')::numeric, 2),
         nullif(btrim(l.value ->> 'receipt_no'), ''), nullif(l.value ->> 'attachment_path', '')
  from jsonb_array_elements(p_lines) with ordinality as l;
$$;

create or replace function public.submit_claim(
  p_title text, p_purpose text, p_lines jsonb, p_declaration boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_employee_id();
  v_res jsonb;
  v_id  uuid;
  v_ref text;
  v_name text;
begin
  if v_me is null then raise exception 'Your sign-in is not linked to a worker record. Ask HR to add you.'; end if;
  v_res := public.validate_claim(v_me, p_title, p_lines, p_declaration, null);
  perform public.raise_validation(v_res);

  v_ref := public.next_reference('CL', extract(year from public.sg_today())::int);
  insert into public.claims (reference, employee_id, title, purpose, total_amount, status, approver_id, declaration_at, flags)
  values (v_ref, v_me, btrim(p_title), nullif(btrim(p_purpose), ''), (v_res ->> 'total')::numeric, 'pending',
          (v_res ->> 'approver_id')::uuid, now(), v_res -> 'flags')
  returning id into v_id;
  perform public.write_claim_lines(v_id, p_lines);

  select full_name into v_name from public.employees where id = v_me;
  perform public.log_audit('claim', v_id, v_ref, 'submitted', v_me, null, 'pending', null,
                           jsonb_build_object('total', v_res -> 'total', 'flags', v_res -> 'flags'));
  perform public.notify((v_res ->> 'approver_id')::uuid, 'approval_request',
    format('%s submitted an expense claim', v_name),
    format('%s · %s · SGD %s', v_ref, btrim(p_title), to_char((v_res ->> 'total')::numeric, 'FM999,999,990.00')), '/inbox');
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'pending', 'total', v_res -> 'total');
end $$;

-- Fix and resubmit a claim that was returned by Finance or rejected by the approver
create or replace function public.resubmit_claim(
  p_id uuid, p_title text, p_purpose text, p_lines jsonb, p_declaration boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_employee_id();
  v_c   public.claims;
  v_res jsonb;
begin
  select * into v_c from public.claims where id = p_id for update;
  if v_c.id is null or v_c.employee_id <> v_me then raise exception 'Claim not found.'; end if;
  if v_c.status not in ('returned', 'rejected') then raise exception 'Only returned or rejected claims can be resubmitted.'; end if;
  v_res := public.validate_claim(v_me, p_title, p_lines, p_declaration, p_id);
  perform public.raise_validation(v_res);

  delete from public.claim_lines where claim_id = p_id;
  perform public.write_claim_lines(p_id, p_lines);
  update public.claims
     set title = btrim(p_title), purpose = nullif(btrim(p_purpose), ''), total_amount = (v_res ->> 'total')::numeric,
         status = 'pending', approver_id = (v_res ->> 'approver_id')::uuid, escalated_to_id = null,
         reminder_sent_at = null, escalated_at = null, declaration_at = now(), flags = v_res -> 'flags',
         submitted_at = now(), decided_by = null, decided_at = null
   where id = p_id;
  perform public.log_audit('claim', p_id, v_c.reference, 'resubmitted', v_me, v_c.status::text, 'pending');
  perform public.notify((v_res ->> 'approver_id')::uuid, 'approval_request',
    format('Claim %s resubmitted', v_c.reference), format('SGD %s', to_char((v_res ->> 'total')::numeric, 'FM999,999,990.00')), '/inbox');
  return jsonb_build_object('id', p_id, 'reference', v_c.reference, 'status', 'pending');
end $$;

create or replace function public.decide_claim(p_id uuid, p_decision text, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_c  public.claims;
  v_new public.claim_status;
  v_name text;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject.'; end if;
  select * into v_c from public.claims where id = p_id for update;
  if v_c.id is null then raise exception 'Claim not found.'; end if;
  if v_c.status <> 'pending' then raise exception 'This claim is already %.', v_c.status; end if;
  if v_c.employee_id = v_me then raise exception 'You cannot approve or reject your own claim.'; end if;
  if v_me is distinct from v_c.approver_id and v_me is distinct from v_c.escalated_to_id and not public.has_role('admin') then
    raise exception 'Only the assigned approver can decide this claim.';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_remark), '') = '' then
    raise exception 'Add a remark explaining why the claim is rejected.';
  end if;
  v_new := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  update public.claims set status = v_new, decided_by = v_me, decided_at = now(), decision_remark = nullif(btrim(p_remark), '')
   where id = p_id;
  perform public.log_audit('claim', p_id, v_c.reference, p_decision || 'd', v_me, 'pending',
                           case when v_new = 'approved' then 'submitted_to_finance' else 'rejected' end, nullif(btrim(p_remark), ''));
  perform public.notify(v_c.employee_id, 'decision',
    case when v_new = 'approved' then format('Claim %s approved – sent to Finance', v_c.reference)
         else format('Claim %s rejected', v_c.reference) end,
    nullif(btrim(p_remark), ''), '/expenses/' || p_id);
  if v_new = 'approved' then
    select full_name into v_name from public.employees where id = v_c.employee_id;
    perform public.notify_roles(array['finance'], 'approval_request', format('Claim ready to pay: %s', v_c.reference),
      format('%s · SGD %s', v_name, to_char(v_c.total_amount, 'FM999,999,990.00')), '/finance', v_c.employee_id);
  end if;
  return jsonb_build_object('id', p_id, 'reference', v_c.reference, 'status', v_new);
end $$;

create or replace function public.pay_claim(
  p_id uuid, p_payment_reference text, p_paid_date date default null, p_payroll_period text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_c  public.claims;
  v_date date := coalesce(p_paid_date, public.sg_today());
begin
  if not public.has_role('finance') then raise exception 'Only Finance can mark claims as paid.'; end if;
  select * into v_c from public.claims where id = p_id for update;
  if v_c.id is null then raise exception 'Claim not found.'; end if;
  if v_c.status <> 'approved' then raise exception 'Only approved claims (Submitted to Finance) can be paid. This claim is %.', v_c.status; end if;
  if v_c.employee_id = v_me then raise exception 'You cannot pay your own claim.'; end if;
  if coalesce(btrim(p_payment_reference), '') = '' then raise exception 'Payment reference is required to mark a claim as paid.'; end if;

  update public.claims
     set status = 'paid', finance_by = v_me, finance_at = now(), paid_date = v_date,
         payment_reference = btrim(p_payment_reference),
         payroll_period = coalesce(nullif(btrim(p_payroll_period), ''), to_char(v_date, 'YYYY-MM'))
   where id = p_id;
  perform public.log_audit('claim', p_id, v_c.reference, 'paid', v_me, 'submitted_to_finance', 'paid', null,
                           jsonb_build_object('payment_reference', btrim(p_payment_reference), 'paid_date', v_date));
  perform public.notify(v_c.employee_id, 'payment', format('Claim %s paid', v_c.reference),
    format('SGD %s · ref %s · %s', to_char(v_c.total_amount, 'FM999,999,990.00'), btrim(p_payment_reference), to_char(v_date, 'DD Mon YYYY')),
    '/expenses/' || p_id);
  return jsonb_build_object('id', p_id, 'reference', v_c.reference, 'status', 'paid');
end $$;

create or replace function public.return_claim(p_id uuid, p_remark text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_c  public.claims;
begin
  if not public.has_role('finance') then raise exception 'Only Finance can return claims.'; end if;
  select * into v_c from public.claims where id = p_id for update;
  if v_c.id is null then raise exception 'Claim not found.'; end if;
  if v_c.status <> 'approved' then raise exception 'Only claims submitted to Finance can be returned. This claim is %.', v_c.status; end if;
  if coalesce(btrim(p_remark), '') = '' then raise exception 'Add a remark telling the staff member what to fix.'; end if;
  update public.claims set status = 'returned', finance_by = v_me, finance_at = now(), return_remark = btrim(p_remark) where id = p_id;
  perform public.log_audit('claim', p_id, v_c.reference, 'returned', v_me, 'submitted_to_finance', 'returned', btrim(p_remark));
  perform public.notify(v_c.employee_id, 'decision', format('Claim %s returned by Finance', v_c.reference), btrim(p_remark), '/expenses/' || p_id);
  return jsonb_build_object('id', p_id, 'reference', v_c.reference, 'status', 'returned');
end $$;

create or replace function public.cancel_claim(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_c  public.claims;
begin
  select * into v_c from public.claims where id = p_id for update;
  if v_c.id is null or v_c.employee_id <> v_me then raise exception 'Claim not found.'; end if;
  if v_c.status not in ('pending', 'returned', 'rejected') then raise exception 'This claim is % and can no longer be cancelled.', v_c.status; end if;
  update public.claims set status = 'cancelled' where id = p_id;
  perform public.log_audit('claim', p_id, v_c.reference, 'cancelled', v_me, v_c.status::text, 'cancelled');
  return jsonb_build_object('id', p_id, 'reference', v_c.reference, 'status', 'cancelled');
end $$;

-- ---------- Reminders & escalation (run by pg_cron) --------------------------
-- Remind the approver after N working days; escalate to the approver's manager after M.
create or replace function public.process_approval_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_remind int := public.setting_int('reminder_after_working_days', 1);
  v_escal  int := public.setting_int('escalate_after_working_days', 2);
  v_today  date := public.sg_today();
  r record;
  v_elapsed int;
  v_to uuid;
  v_reminded int := 0;
  v_escalated int := 0;
begin
  for r in
    select 'leave' as kind, id, reference, employee_id, approver_id, escalated_to_id, reminder_sent_at, escalated_at, submitted_at
      from public.leave_requests where status = 'pending'
    union all
    select 'claim', id, reference, employee_id, approver_id, escalated_to_id, reminder_sent_at, escalated_at, submitted_at
      from public.claims where status = 'pending'
  loop
    v_elapsed := public.working_days(((r.submitted_at at time zone 'Asia/Singapore')::date + 1), v_today);

    if v_elapsed >= v_remind and r.reminder_sent_at is null then
      perform public.notify(r.approver_id, 'reminder', format('Reminder: %s is waiting for your decision', r.reference),
        format('Submitted %s working day(s) ago.', v_elapsed), '/inbox');
      if r.kind = 'leave' then update public.leave_requests set reminder_sent_at = now() where id = r.id;
      else update public.claims set reminder_sent_at = now() where id = r.id; end if;
      perform public.log_audit(r.kind, r.id, r.reference, 'reminded', null, 'pending', 'pending', null,
                               jsonb_build_object('working_days', v_elapsed));
      v_reminded := v_reminded + 1;
    end if;

    if v_elapsed >= v_escal and r.escalated_at is null then
      v_to := public.route_approver(r.approver_id);
      if v_to is not null and v_to <> r.employee_id and v_to <> r.approver_id then
        if r.kind = 'leave' then update public.leave_requests set escalated_to_id = v_to, escalated_at = now() where id = r.id;
        else update public.claims set escalated_to_id = v_to, escalated_at = now() where id = r.id; end if;
        perform public.notify(v_to, 'escalation', format('Escalated to you: %s', r.reference),
          format('Pending %s working days with %s. You can decide it from your inbox.', v_elapsed,
                 (select full_name from public.employees where id = r.approver_id)), '/inbox');
        perform public.notify(r.approver_id, 'escalation', format('%s has been escalated', r.reference),
          format('It was pending for %s working days.', v_elapsed), '/inbox');
        perform public.log_audit(r.kind, r.id, r.reference, 'escalated', null, 'pending', 'pending', null,
                                 jsonb_build_object('escalated_to', v_to, 'working_days', v_elapsed));
        v_escalated := v_escalated + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'escalated', v_escalated);
end $$;

-- ---------- Team calendar (clash view without exposing reasons/MC numbers) ---
create or replace function public.team_absences(p_from date, p_to date)
returns table (
  request_id uuid, employee_id uuid, full_name text, department text, leave_type_code text,
  leave_type_name text, color text, start_date date, end_date date, day_part public.day_part,
  days numeric, status public.leave_status)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.employees where id = public.current_employee_id())
  select r.id, e.id, e.full_name, d.name, r.leave_type_code, t.name, t.color, r.start_date, r.end_date, r.day_part, r.days, r.status
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  left join public.departments d on d.id = e.department_id
  join public.leave_types t on t.code = r.leave_type_code
  cross join me
  where r.status in ('approved', 'pending')
    and r.start_date <= p_to and r.end_date >= p_from
    and (
      public.has_role('hr', 'office_manager', 'director')
      or e.department_id = me.department_id
      or e.manager_id = me.id
      or (me.manager_id is not null and e.manager_id = me.manager_id)
      or public.manages(me.id, e.id)
    )
  order by r.start_date, e.full_name
$$;

-- ---------- HR monthly report & KPIs -----------------------------------------
create or replace function public.hr_monthly_report(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v jsonb;
begin
  if not public.has_role('hr', 'office_manager', 'director', 'finance') then
    raise exception 'Reports are available to HR, Office Manager, Finance and Directors.';
  end if;

  with lr as (
    select r.*, e.full_name, d.name as dept, t.name as type_name
    from public.leave_requests r
    join public.employees e on e.id = r.employee_id
    left join public.departments d on d.id = e.department_id
    join public.leave_types t on t.code = r.leave_type_code
  ),
  in_month as (select * from lr where start_date <= v_to and end_date >= v_from),
  submitted as (select * from lr where (submitted_at at time zone 'Asia/Singapore')::date between v_from and v_to),
  decided as (
    select 'leave' as kind, submitted_at, decided_at from public.leave_requests
      where decided_at is not null and (decided_at at time zone 'Asia/Singapore')::date between v_from and v_to
    union all
    select 'claim', submitted_at, decided_at from public.claims
      where decided_at is not null and (decided_at at time zone 'Asia/Singapore')::date between v_from and v_to
  ),
  decided_wd as (
    select kind, public.working_days(((submitted_at at time zone 'Asia/Singapore')::date + 1),
                                     (decided_at at time zone 'Asia/Singapore')::date) as wd,
           extract(epoch from decided_at - submitted_at) / 3600.0 as hours
    from decided
  ),
  sick_edges as (   -- sick leave starting on a Monday or ending on a Friday, last 90 days
    select employee_id, full_name, count(*) as n
    from lr
    where leave_type_code = 'SL' and status = 'approved'
      and start_date between v_to - 90 and v_to
      and (extract(isodow from start_date) = 1 or extract(isodow from end_date) = 5)
    group by employee_id, full_name having count(*) >= 2
  ),
  stale as (
    select reference, full_name, type_name,
           public.working_days(((submitted_at at time zone 'Asia/Singapore')::date + 1), public.sg_today()) as wd
    from lr where status = 'pending'
  ),
  cl as (select * from public.claims where (submitted_at at time zone 'Asia/Singapore')::date between v_from and v_to)
  select jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'leave', jsonb_build_object(
      'submitted', (select count(*) from submitted),
      'approved',  (select count(*) from submitted where status = 'approved'),
      'rejected',  (select count(*) from submitted where status = 'rejected'),
      'pending',   (select count(*) from submitted where status = 'pending'),
      'cancelled', (select count(*) from submitted where status = 'cancelled'),
      'days_on_leave', (select coalesce(sum(
          case when day_part <> 'full' then days
               else public.working_days(greatest(start_date, v_from), least(end_date, v_to)) end), 0)
        from in_month where status = 'approved'),
      'by_type', (select coalesce(jsonb_agg(x order by x ->> 'type'), '[]') from (
          select jsonb_build_object('type', type_name, 'code', leave_type_code, 'requests', count(*), 'days', sum(days)) as x
          from in_month where status = 'approved' group by type_name, leave_type_code) s),
      'by_department', (select coalesce(jsonb_agg(x order by x ->> 'department'), '[]') from (
          select jsonb_build_object('department', coalesce(dept, '—'), 'requests', count(*), 'days', sum(days)) as x
          from in_month where status = 'approved' group by dept) s)
    ),
    'kpi', jsonb_build_object(
      'decided', (select count(*) from decided_wd),
      'within_1_working_day_pct', (select round(100.0 * count(*) filter (where wd <= 1) / nullif(count(*), 0), 1) from decided_wd),
      'within_2_working_days_pct', (select round(100.0 * count(*) filter (where wd <= 2) / nullif(count(*), 0), 1) from decided_wd),
      'avg_hours_to_decision', (select round(avg(hours)::numeric, 1) from decided_wd)
    ),
    'claims', jsonb_build_object(
      'submitted', (select count(*) from cl),
      'submitted_amount', (select coalesce(sum(total_amount), 0) from cl),
      'paid', (select count(*) from cl where status = 'paid'),
      'paid_amount', (select coalesce(sum(total_amount), 0) from cl where status = 'paid'),
      'awaiting_payment', (select count(*) from public.claims where status = 'approved'),
      'awaiting_payment_amount', (select coalesce(sum(total_amount), 0) from public.claims where status = 'approved'),
      'returned', (select count(*) from cl where status = 'returned'),
      'returned_pct', (select round(100.0 * count(*) filter (where status = 'returned') / nullif(count(*), 0), 1) from cl)
    ),
    'patterns', jsonb_build_object(
      'sick_leave_next_to_weekend', (select coalesce(jsonb_agg(jsonb_build_object('name', full_name, 'count', n)), '[]') from sick_edges),
      'pending_over_2_working_days', (select coalesce(jsonb_agg(jsonb_build_object('reference', reference, 'name', full_name, 'type', type_name, 'working_days', wd) order by wd desc), '[]') from stale where wd > 2),
      'approved_clashes', (select coalesce(jsonb_agg(jsonb_build_object('reference', reference, 'name', full_name)), '[]')
                           from in_month where status = 'approved' and flags ? 'clash')
    )
  ) into v;
  return v;
end $$;

-- ---------- Account linking --------------------------------------------------
-- Sign-ups are only accepted for emails HR has registered; the auth user is
-- linked to the worker record automatically (fixes "anyone can pick a name").
create or replace function public.link_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.employees set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null and is_active
  returning id into v_id;
  if v_id is null and not exists (select 1 from public.employees where user_id = new.id) then
    raise exception 'No active worker record exists for %. Ask HR to add you before signing up.', new.email;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_auth_user();

create or replace function public.employee_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end $$;

create trigger employees_before_insert before insert on public.employees
  for each row execute function public.employee_before_insert();

create or replace function public.employee_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_entitlements(new.id, extract(year from public.sg_today())::int);
  perform public.log_audit('employee', new.id, new.employee_no, 'created', public.current_employee_id(), null, null, null,
                           jsonb_build_object('full_name', new.full_name));
  return new;
end $$;

create trigger employees_after_insert after insert on public.employees
  for each row execute function public.employee_after_insert();

create or replace function public.entitlement_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.entitled_days, old.carried_forward, old.adjustment) is distinct from (new.entitled_days, new.carried_forward, new.adjustment) then
    new.updated_by := public.current_employee_id();
    perform public.log_audit('entitlement', new.employee_id, new.leave_type_code || '-' || new.year, 'entitlement_changed',
      public.current_employee_id(), null, null, new.note,
      jsonb_build_object('from', jsonb_build_object('entitled', old.entitled_days, 'carried', old.carried_forward, 'adjustment', old.adjustment),
                         'to',   jsonb_build_object('entitled', new.entitled_days, 'carried', new.carried_forward, 'adjustment', new.adjustment)));
  end if;
  return new;
end $$;

create trigger leave_entitlements_audit before update on public.leave_entitlements
  for each row execute function public.entitlement_audit();

-- Self-service profile fields
create or replace function public.update_my_profile(p_preferred_name text, p_phone text)
returns void language sql security definer set search_path = public as $$
  update public.employees set preferred_name = nullif(btrim(p_preferred_name), ''), phone = nullif(btrim(p_phone), '')
  where id = public.current_employee_id();
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where recipient_id = public.current_employee_id() and read_at is null
    and (p_ids is null or id = any (p_ids));
$$;
