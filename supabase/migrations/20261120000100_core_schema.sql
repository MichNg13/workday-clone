-- =============================================================================
-- Workday Clone — Leave & Claims
-- Core schema: organisation, policy reference data, leave, claims, audit, inbox
-- =============================================================================

-- ---------- Enums -------------------------------------------------------------
create type public.app_role as enum (
  'employee',        -- every worker
  'director',        -- approves Department Heads' requests; top of the chain
  'hr',              -- entitlements, holidays, Master Leave Record, reports
  'office_manager',  -- live leave tracker, notified on approvals
  'finance',         -- pays or returns approved claims
  'admin'            -- full access
);

create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- 'approved' = approved by Department Head => "Submitted to Finance"
create type public.claim_status as enum ('pending', 'approved', 'rejected', 'returned', 'paid', 'cancelled');

create type public.day_part as enum ('full', 'am', 'pm');

-- ---------- Organisation -----------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  head_id     uuid,                       -- FK added after employees exists
  created_at  timestamptz not null default now()
);

create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users(id) on delete set null,
  employee_no      text not null unique,
  full_name        text not null,
  preferred_name   text,
  email            text not null,
  job_title        text not null default 'Staff',
  department_id    uuid references public.departments(id) on delete set null,
  manager_id       uuid references public.employees(id) on delete set null,
  role             public.app_role not null default 'employee',
  hire_date        date not null default current_date,
  termination_date date,
  work_location    text default 'Singapore',
  phone            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint employees_not_own_manager check (manager_id is null or manager_id <> id)
);
create unique index employees_email_key on public.employees (lower(email));
create index employees_manager_idx on public.employees (manager_id);
create index employees_department_idx on public.employees (department_id);

alter table public.departments
  add constraint departments_head_fk foreign key (head_id) references public.employees(id) on delete set null;

-- ---------- Policy reference data --------------------------------------------
create table public.leave_types (
  code                   text primary key,             -- AL, SL, HL, CCL, CPL, NPL
  name                   text not null,
  default_days           numeric(5,1) not null default 0,
  track_balance          boolean not null default true, -- false => no balance check (e.g. unpaid)
  is_paid                boolean not null default true,
  prorate_for_joiners    boolean not null default false,
  allow_half_day         boolean not null default true,
  requires_document      boolean not null default false,
  document_label         text,                          -- e.g. 'MC number'
  counts_toward_code     text references public.leave_types(code), -- SL counts toward HL cap
  requires_exhausted_code text references public.leave_types(code), -- NPL only after AL exhausted
  min_notice_days        int not null default 0,        -- short-notice flag threshold (calendar days)
  allow_backdate         boolean not null default false,
  color                  text not null default '#0875e1',
  sort_order             int not null default 100,
  is_active              boolean not null default true
);

create table public.public_holidays (
  holiday_date date primary key,
  name         text not null,
  source       text not null default 'MOM'
);

create table public.claim_categories (
  code             text primary key,
  name             text not null,
  per_line_limit   numeric(12,2),                 -- over-limit is a FLAG for the approver, not a block
  requires_receipt boolean not null default true,
  gl_code          text,
  sort_order       int not null default 100,
  is_active        boolean not null default true
);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text
);

-- ---------- Leave ------------------------------------------------------------
-- Contract entitlement per worker / leave type / year (HR-editable).
create table public.leave_entitlements (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  leave_type_code text not null references public.leave_types(code),
  year            int  not null,
  entitled_days   numeric(5,1) not null default 0,
  carried_forward numeric(5,1) not null default 0,
  adjustment      numeric(5,1) not null default 0,
  note            text,
  updated_by      uuid references public.employees(id),
  updated_at      timestamptz not null default now(),
  unique (employee_id, leave_type_code, year)
);
create index leave_entitlements_year_idx on public.leave_entitlements (year);

create table public.leave_requests (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,                     -- LV-2026-0001
  employee_id      uuid not null references public.employees(id) on delete cascade,
  leave_type_code  text not null references public.leave_types(code),
  start_date       date not null,
  end_date         date not null,
  day_part         public.day_part not null default 'full',
  days             numeric(5,1) not null check (days > 0),
  reason           text,
  document_ref     text,                                     -- MC no.
  attachment_path  text,                                     -- storage: attachments/<employee_id>/...
  status           public.leave_status not null default 'pending',
  approver_id      uuid references public.employees(id),
  escalated_to_id  uuid references public.employees(id),
  reminder_sent_at timestamptz,
  escalated_at     timestamptz,
  flags            jsonb not null default '{}'::jsonb,       -- short_notice, clash, balance_after ...
  submitted_at     timestamptz not null default now(),
  decided_by       uuid references public.employees(id),
  decided_at       timestamptz,
  decision_remark  text,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leave_dates_order check (end_date >= start_date),
  constraint leave_same_year check (extract(year from start_date) = extract(year from end_date)),
  constraint leave_half_day_single check (day_part = 'full' or start_date = end_date)
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_approver_idx on public.leave_requests (approver_id) where status = 'pending';
create index leave_requests_escalated_idx on public.leave_requests (escalated_to_id) where status = 'pending';
create index leave_requests_dates_idx on public.leave_requests (start_date, end_date);
create index leave_requests_type_idx on public.leave_requests (leave_type_code);
create index leave_requests_decided_by_idx on public.leave_requests (decided_by);

-- ---------- Claims -----------------------------------------------------------
create table public.claims (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,                    -- CL-2026-0001
  employee_id       uuid not null references public.employees(id) on delete cascade,
  title             text not null,
  purpose           text,
  total_amount      numeric(12,2) not null default 0,
  currency          text not null default 'SGD',
  status            public.claim_status not null default 'pending',
  approver_id       uuid references public.employees(id),
  escalated_to_id   uuid references public.employees(id),
  reminder_sent_at  timestamptz,
  escalated_at      timestamptz,
  declaration_at    timestamptz not null,                    -- staff declaration accepted
  flags             jsonb not null default '{}'::jsonb,      -- over_limit, late_submission, duplicate_receipt
  submitted_at      timestamptz not null default now(),
  decided_by        uuid references public.employees(id),
  decided_at        timestamptz,
  decision_remark   text,
  finance_by        uuid references public.employees(id),
  finance_at        timestamptz,
  paid_date         date,
  payment_reference text,
  payroll_period    text,                                    -- e.g. 2026-11
  return_remark     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint claims_paid_requires_ref check (status <> 'paid' or (payment_reference is not null and paid_date is not null))
);
create index claims_employee_idx on public.claims (employee_id, submitted_at desc);
create index claims_approver_idx on public.claims (approver_id) where status = 'pending';
create index claims_escalated_idx on public.claims (escalated_to_id) where status = 'pending';
create index claims_status_idx on public.claims (status);
create index claims_decided_by_idx on public.claims (decided_by);
create index claims_finance_by_idx on public.claims (finance_by);

create table public.claim_lines (
  id               uuid primary key default gen_random_uuid(),
  claim_id         uuid not null references public.claims(id) on delete cascade,
  line_no          int not null,
  expense_date     date not null,
  category_code    text not null references public.claim_categories(code),
  description      text not null,
  amount           numeric(12,2) not null check (amount > 0),
  receipt_no       text,
  attachment_path  text,
  unique (claim_id, line_no)
);
create index claim_lines_category_idx on public.claim_lines (category_code);
create index claim_lines_receipt_idx on public.claim_lines (receipt_no);

-- ---------- Audit trail & inbox ---------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('leave', 'claim', 'employee', 'entitlement', 'holiday')),
  entity_id   uuid,
  reference   text,
  action      text not null,               -- submitted, approved, rejected, reminded, escalated, paid ...
  actor_id    uuid references public.employees(id),
  from_status text,
  to_status   text,
  remark      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at);
create index audit_log_actor_idx on public.audit_log (actor_id);

create table public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.employees(id) on delete cascade,
  kind         text not null,              -- approval_request, decision, reminder, escalation, payment, info
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- Running counters for human-readable references (LV-2026-0001 / CL-2026-0001)
create table public.reference_counters (
  prefix text not null,
  year   int  not null,
  last   int  not null default 0,
  primary key (prefix, year)
);

-- ---------- updated_at triggers ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();
create trigger leave_requests_touch before update on public.leave_requests
  for each row execute function public.touch_updated_at();
create trigger claims_touch before update on public.claims
  for each row execute function public.touch_updated_at();
create trigger leave_entitlements_touch before update on public.leave_entitlements
  for each row execute function public.touch_updated_at();
