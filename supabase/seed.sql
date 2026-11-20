-- =============================================================================
-- DEMO DATA — 10 sample workers in 5 departments (incl. a July 2026 joiner),
-- leave history, pending approvals and claims at each stage.
-- Every demo account signs in with the password:  Workday#Demo2026
-- Delete these accounts (Supabase > Authentication) before real use.
-- =============================================================================
do $$
declare
  d_mgt uuid; d_ops uuid; d_sal uuid; d_hr uuid; d_fin uuid;
  e_grace uuid; e_mei uuid; e_daniel uuid; e_ahmad uuid; e_rajesh uuid;
  e_priya uuid; e_sarah uuid; e_nurul uuid; e_kevin uuid; e_wei uuid;
  v_id uuid; v_ref text;
  u record;
begin
  insert into public.departments (code, name) values ('MGT', 'Management') returning id into d_mgt;
  insert into public.departments (code, name) values ('OPS', 'Operations') returning id into d_ops;
  insert into public.departments (code, name) values ('SAL', 'Sales') returning id into d_sal;
  insert into public.departments (code, name) values ('HR',  'Human Resources') returning id into d_hr;
  insert into public.departments (code, name) values ('FIN', 'Finance') returning id into d_fin;

  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1001', 'Grace Tan', 'grace.tan@example.com', 'Managing Director', d_mgt, null, 'director', '2015-03-02')
  returning id into e_grace;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1002', 'Wong Mei Ling', 'meiling.wong@example.com', 'Head of Operations', d_ops, e_grace, 'employee', '2017-06-01')
  returning id into e_mei;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1003', 'Daniel Lim', 'daniel.lim@example.com', 'Operations Executive', d_ops, e_mei, 'employee', '2021-02-01')
  returning id into e_daniel;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1004', 'Ahmad Rahman', 'ahmad.rahman@example.com', 'Operations Executive', d_ops, e_mei, 'employee', '2020-09-14')
  returning id into e_ahmad;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1005', 'Rajesh Kumar', 'rajesh.kumar@example.com', 'Head of Sales', d_sal, e_grace, 'employee', '2018-01-08')
  returning id into e_rajesh;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1006', 'Priya Nair', 'priya.nair@example.com', 'Sales Executive', d_sal, e_rajesh, 'employee', '2026-07-01')
  returning id into e_priya;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1007', 'Sarah Chen', 'sarah.chen@example.com', 'HR Manager', d_hr, e_grace, 'hr', '2016-04-18')
  returning id into e_sarah;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1008', 'Nurul Huda', 'nurul.huda@example.com', 'Office Manager', d_hr, e_sarah, 'office_manager', '2019-11-04')
  returning id into e_nurul;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1009', 'Kevin Ong', 'kevin.ong@example.com', 'Finance Manager', d_fin, e_grace, 'finance', '2017-10-02')
  returning id into e_kevin;
  insert into public.employees (employee_no, full_name, email, job_title, department_id, manager_id, role, hire_date)
  values ('E1010', 'Tan Wei Jie', 'weijie.tan@example.com', 'Accounts Executive', d_fin, e_kevin, 'finance', '2022-05-16')
  returning id into e_wei;

  update public.departments set head_id = e_grace  where id = d_mgt;
  update public.departments set head_id = e_mei    where id = d_ops;
  update public.departments set head_id = e_rajesh where id = d_sal;
  update public.departments set head_id = e_sarah  where id = d_hr;
  update public.departments set head_id = e_kevin  where id = d_fin;

  -- 2027 entitlements too, so next-year requests work immediately
  perform public.ensure_entitlements(id, 2027) from public.employees;

  -- Demo sign-ins (linked to the worker records by the on_auth_user_created trigger)
  for u in select id as emp_id, email, full_name from public.employees loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('Workday#Demo2026', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;

  -- ---------- Leave history (approved) ----------
  -- Daniel: 4 days AL in March -> 10 of 14 left
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, decided_by, decided_at)
  values (v_ref, e_daniel, 'AL', '2026-03-09', '2026-03-12', 4, 'Family trip to Penang', 'approved',
          e_mei, '2026-02-20 09:12+08', e_mei, '2026-02-20 15:40+08') returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_daniel, null, 'pending');
  perform public.log_audit('leave', v_id, v_ref, 'approved', e_mei, 'pending', 'approved');

  -- Ahmad: 2 days sick leave -> SL 12 of 14, HL cap 58 of 60
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, document_ref,
                                     status, approver_id, submitted_at, decided_by, decided_at)
  values (v_ref, e_ahmad, 'SL', '2026-06-15', '2026-06-16', 2, 'Fever', 'MC-88231', 'approved',
          e_mei, '2026-06-15 08:05+08', e_mei, '2026-06-15 11:20+08') returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_ahmad, null, 'pending');
  perform public.log_audit('leave', v_id, v_ref, 'approved', e_mei, 'pending', 'approved');

  -- Priya (joined Jul 2026, AL pro-rated to 7): 4 days -> 3 of 7 left
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, decided_by, decided_at)
  values (v_ref, e_priya, 'AL', '2026-08-11', '2026-08-14', 4, 'National Day long weekend', 'approved',
          e_rajesh, '2026-07-24 10:00+08', e_rajesh, '2026-07-24 17:30+08') returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_priya, null, 'pending');
  perform public.log_audit('leave', v_id, v_ref, 'approved', e_rajesh, 'pending', 'approved');

  -- A Department Head's own leave goes to the Director
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, decided_by, decided_at)
  values (v_ref, e_mei, 'AL', '2026-04-06', '2026-04-08', 3, 'Personal', 'approved',
          e_grace, '2026-03-16 09:00+08', e_grace, '2026-03-16 12:15+08') returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_mei, null, 'pending');
  perform public.log_audit('leave', v_id, v_ref, 'approved', e_grace, 'pending', 'approved');

  -- ---------- Pending approvals (inbox demo) ----------
  -- Daniel: year-end leave, submitted 3 working days ago -> reminder + escalation on next cron run
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, flags)
  values (v_ref, e_daniel, 'AL', '2026-12-21', '2026-12-24', 4, 'Year-end holiday', 'pending', e_mei, '2026-11-17 10:00+08',
          jsonb_build_object('balance_before', 10, 'balance_after', 6, 'entitled', 14)) returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_daniel, null, 'pending');
  perform public.notify(e_mei, 'approval_request', 'Daniel Lim requested Annual Leave', v_ref || ' · 21 Dec to 24 Dec 2026 · 4 day(s)', '/inbox');

  -- Ahmad: overlaps Daniel -> clash flag shown to Mei Ling
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, flags)
  values (v_ref, e_ahmad, 'AL', '2026-12-22', '2026-12-23', 2, 'Moving house', 'pending', e_mei, now() - interval '2 hours',
          jsonb_build_object('balance_before', 14, 'balance_after', 12, 'entitled', 14,
            'clash', jsonb_build_array(jsonb_build_object('name', 'Daniel Lim', 'reference', 'LV-2026-0005', 'status', 'pending',
                                                          'start_date', '2026-12-21', 'end_date', '2026-12-24')))) returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_ahmad, null, 'pending');
  perform public.notify(e_mei, 'approval_request', 'Ahmad Rahman requested Annual Leave', v_ref || ' · 22 Dec to 23 Dec 2026 · 2 day(s)', '/inbox');

  -- Rajesh (Head of Sales) -> Director
  v_ref := public.next_reference('LV', 2026);
  insert into public.leave_requests (reference, employee_id, leave_type_code, start_date, end_date, days, reason, status,
                                     approver_id, submitted_at, flags)
  values (v_ref, e_rajesh, 'AL', '2026-12-28', '2026-12-31', 4, 'Year-end with family', 'pending', e_grace, now() - interval '1 hour',
          jsonb_build_object('balance_before', 14, 'balance_after', 10, 'entitled', 14)) returning id into v_id;
  perform public.log_audit('leave', v_id, v_ref, 'submitted', e_rajesh, null, 'pending');
  perform public.notify(e_grace, 'approval_request', 'Rajesh Kumar requested Annual Leave', v_ref || ' · 28 Dec to 31 Dec 2026 · 4 day(s)', '/inbox');

  -- ---------- Claims ----------
  -- Priya: 3-line claim SGD 140.30 pending with Rajesh
  v_ref := public.next_reference('CL', 2026);
  insert into public.claims (reference, employee_id, title, purpose, total_amount, status, approver_id, declaration_at, submitted_at, flags)
  values (v_ref, e_priya, 'Client visit – Jurong Island', 'Quarterly review with Petrochem Pte Ltd', 140.30, 'pending', e_rajesh,
          now() - interval '3 hours', now() - interval '3 hours', '{}') returning id into v_id;
  insert into public.claim_lines (claim_id, line_no, expense_date, category_code, description, amount, receipt_no) values
    (v_id, 1, '2026-11-16', 'TRANSPORT', 'Taxi to client site', 32.50, 'GRAB-A8812'),
    (v_id, 2, '2026-11-16', 'ENTERTAIN', 'Lunch with client (3 pax)', 86.00, 'INV-30419'),
    (v_id, 3, '2026-11-16', 'TRANSPORT', 'Parking at client site', 21.80, 'PK-55190');
  perform public.log_audit('claim', v_id, v_ref, 'submitted', e_priya, null, 'pending');
  perform public.notify(e_rajesh, 'approval_request', 'Priya Nair submitted an expense claim', v_ref || ' · SGD 140.30', '/inbox');

  -- Daniel: approved, waiting in Finance's payment queue
  v_ref := public.next_reference('CL', 2026);
  insert into public.claims (reference, employee_id, title, purpose, total_amount, status, approver_id, declaration_at,
                             submitted_at, decided_by, decided_at, flags)
  values (v_ref, e_daniel, 'Forklift safety refresher', 'Mandatory WSH course', 245.00, 'approved', e_mei,
          '2026-11-10 09:00+08', '2026-11-10 09:00+08', e_mei, '2026-11-10 16:00+08', '{}') returning id into v_id;
  insert into public.claim_lines (claim_id, line_no, expense_date, category_code, description, amount, receipt_no) values
    (v_id, 1, '2026-11-06', 'TRAINING', 'WSH forklift refresher course fee', 245.00, 'WSH-2026-1187');
  perform public.log_audit('claim', v_id, v_ref, 'submitted', e_daniel, null, 'pending');
  perform public.log_audit('claim', v_id, v_ref, 'approved', e_mei, 'pending', 'submitted_to_finance');

  -- Ahmad: paid in October payroll
  v_ref := public.next_reference('CL', 2026);
  insert into public.claims (reference, employee_id, title, total_amount, status, approver_id, declaration_at, submitted_at,
                             decided_by, decided_at, finance_by, finance_at, paid_date, payment_reference, payroll_period, flags)
  values (v_ref, e_ahmad, 'Overtime meals – stock take', 36.40, 'paid', e_mei, '2026-10-02 18:00+08', '2026-10-02 18:00+08',
          e_mei, '2026-10-03 09:30+08', e_kevin, '2026-10-24 11:00+08', '2026-10-25', 'PAYROLL-2026-10', '2026-10', '{}')
  returning id into v_id;
  insert into public.claim_lines (claim_id, line_no, expense_date, category_code, description, amount, receipt_no) values
    (v_id, 1, '2026-09-30', 'MEALS', 'Dinner – stock take night 1', 18.20, 'KF-10021'),
    (v_id, 2, '2026-10-01', 'MEALS', 'Dinner – stock take night 2', 18.20, 'KF-10044');
  perform public.log_audit('claim', v_id, v_ref, 'submitted', e_ahmad, null, 'pending');
  perform public.log_audit('claim', v_id, v_ref, 'approved', e_mei, 'pending', 'submitted_to_finance');
  perform public.log_audit('claim', v_id, v_ref, 'paid', e_kevin, 'submitted_to_finance', 'paid', null,
                           '{"payment_reference":"PAYROLL-2026-10"}');
end $$;
