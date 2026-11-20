-- =============================================================================
-- Row Level Security, function grants, storage bucket, scheduled jobs
-- =============================================================================

alter table public.departments        enable row level security;
alter table public.employees          enable row level security;
alter table public.leave_types        enable row level security;
alter table public.public_holidays    enable row level security;
alter table public.claim_categories   enable row level security;
alter table public.app_settings       enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.leave_requests     enable row level security;
alter table public.claims             enable row level security;
alter table public.claim_lines        enable row level security;
alter table public.audit_log          enable row level security;
alter table public.notifications      enable row level security;
alter table public.reference_counters enable row level security;  -- internal only: no policies

-- Nothing is readable without signing in
revoke all on all tables in schema public from anon;

-- ---------- Directory & reference data: readable by all signed-in staff ------
create policy "staff read departments" on public.departments for select to authenticated using (true);
create policy "hr manage departments" on public.departments for all to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));

create policy "staff read directory" on public.employees for select to authenticated using (true);
create policy "hr insert workers" on public.employees for insert to authenticated with check ((select public.has_role('hr')));
create policy "hr update workers" on public.employees for update to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));
create policy "hr delete workers" on public.employees for delete to authenticated using ((select public.has_role('hr')));

create policy "staff read leave types" on public.leave_types for select to authenticated using (true);
create policy "hr manage leave types" on public.leave_types for all to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));

create policy "staff read holidays" on public.public_holidays for select to authenticated using (true);
create policy "hr manage holidays" on public.public_holidays for all to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));

create policy "staff read claim categories" on public.claim_categories for select to authenticated using (true);
create policy "finance manage claim categories" on public.claim_categories for all to authenticated
  using ((select public.has_role('finance', 'hr'))) with check ((select public.has_role('finance', 'hr')));

create policy "staff read settings" on public.app_settings for select to authenticated using (true);
create policy "hr manage settings" on public.app_settings for all to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));

-- ---------- Entitlements (Master Leave Record) -------------------------------
create policy "read own, team or all (HR)" on public.leave_entitlements for select to authenticated using (
  employee_id = (select public.current_employee_id())
  or (select public.has_role('hr', 'office_manager', 'director'))
  or public.manages((select public.current_employee_id()), employee_id)
);
create policy "hr manage entitlements" on public.leave_entitlements for all to authenticated
  using ((select public.has_role('hr'))) with check ((select public.has_role('hr')));

-- ---------- Leave requests: read-only through RLS, written only via functions -
create policy "read own, assigned, team or all (HR)" on public.leave_requests for select to authenticated using (
  employee_id = (select public.current_employee_id())
  or approver_id = (select public.current_employee_id())
  or escalated_to_id = (select public.current_employee_id())
  or (select public.has_role('hr', 'office_manager', 'director'))
  or public.manages((select public.current_employee_id()), employee_id)
);

-- ---------- Claims ------------------------------------------------------------
create policy "read own, assigned or all (Finance)" on public.claims for select to authenticated using (
  employee_id = (select public.current_employee_id())
  or approver_id = (select public.current_employee_id())
  or escalated_to_id = (select public.current_employee_id())
  or (select public.has_role('finance', 'director'))
);
create policy "read lines of visible claims" on public.claim_lines for select to authenticated using (
  exists (select 1 from public.claims c where c.id = claim_id)
);

-- ---------- Audit trail: visible when the underlying record is visible -------
create policy "read audit of visible records" on public.audit_log for select to authenticated using (
  case entity_type
    when 'leave' then exists (select 1 from public.leave_requests r where r.id = entity_id)
    when 'claim' then exists (select 1 from public.claims c where c.id = entity_id)
    when 'entitlement' then entity_id = (select public.current_employee_id()) or (select public.has_role('hr'))
    else (select public.has_role('hr'))
  end
);

-- ---------- Notifications: own only; only read_at can change -----------------
create policy "read own notifications" on public.notifications for select to authenticated
  using (recipient_id = (select public.current_employee_id()));
create policy "mark own notifications" on public.notifications for update to authenticated
  using (recipient_id = (select public.current_employee_id()))
  with check (recipient_id = (select public.current_employee_id()));
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Workflow tables are never written directly by clients
revoke insert, update, delete on public.leave_requests, public.claims, public.claim_lines, public.audit_log,
  public.reference_counters from authenticated;

-- ---------- Function grants ---------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default: lock everything down, then open
-- only the client-facing RPCs to signed-in users.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.sg_today(),
  public.current_employee_id(),
  public.has_role(text[]),
  public.manages(uuid, uuid),
  public.working_days(date, date),
  public.preview_leave(text, date, date, public.day_part, text),
  public.submit_leave_request(text, date, date, public.day_part, text, text, text),
  public.decide_leave_request(uuid, text, text),
  public.cancel_leave_request(uuid, text),
  public.preview_claim(text, jsonb, boolean),
  public.submit_claim(text, text, jsonb, boolean),
  public.resubmit_claim(uuid, text, text, jsonb, boolean),
  public.decide_claim(uuid, text, text),
  public.pay_claim(uuid, text, date, text),
  public.return_claim(uuid, text),
  public.cancel_claim(uuid),
  public.team_absences(date, date),
  public.hr_monthly_report(date),
  public.generate_entitlements(int),
  public.update_my_profile(text, text),
  public.mark_notifications_read(bigint[])
to authenticated;

grant select on public.leave_balances to authenticated;

-- ---------- Storage: private bucket for MCs and receipts ---------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_view_attachment(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    split_part(p_path, '/', 1) = public.current_employee_id()::text
    or public.has_role('hr', 'finance', 'office_manager')
    or exists (select 1 from public.leave_requests r
               where r.attachment_path = p_path
                 and public.current_employee_id() in (r.approver_id, r.escalated_to_id))
    or exists (select 1 from public.claim_lines l join public.claims c on c.id = l.claim_id
               where l.attachment_path = p_path
                 and public.current_employee_id() in (c.approver_id, c.escalated_to_id))
$$;
revoke execute on function public.can_view_attachment(text) from public, anon;
grant execute on function public.can_view_attachment(text) to authenticated;

create policy "upload own attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = (select public.current_employee_id())::text
);
create policy "read permitted attachments" on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and public.can_view_attachment(name)
);

-- ---------- Scheduled reminders / escalation ---------------------------------
create extension if not exists pg_cron;
select cron.schedule('approval-reminders', '0 * * * 1-5', $$select public.process_approval_reminders()$$);
