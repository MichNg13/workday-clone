-- =============================================================================
-- Reference data: leave policy, claim categories, settings, MOM public holidays
-- Replace the default entitlements and claim limits with your contract and
-- finance policy figures (HR > Policies in the app).
-- =============================================================================

insert into public.leave_types
  (code, name, default_days, track_balance, is_paid, prorate_for_joiners, allow_half_day, requires_document,
   document_label, counts_toward_code, requires_exhausted_code, min_notice_days, allow_backdate, color, sort_order)
values
  ('HL',  'Hospitalisation Leave', 60, true,  true,  false, false, true,  'Hospitalisation letter / MC no.', null, null, 0, true,  '#7b4ae2', 30),
  ('AL',  'Annual Leave',          14, true,  true,  true,  true,  false, null,                              null, null, 7, false, '#0875e1', 10),
  ('SL',  'Sick Leave (Outpatient)', 14, true, true, false, true,  true,  'MC number',                       'HL', null, 0, true,  '#e0457b', 20),
  ('CCL', 'Childcare Leave',        6, true,  true,  false, true,  false, null,                              null, null, 3, false, '#14a37f', 40),
  ('CPL', 'Compassionate Leave',    3, true,  true,  false, false, false, null,                              null, null, 0, true,  '#6b7785', 50),
  ('NPL', 'No-pay Leave',           0, false, false, false, true,  false, null,                              null, 'AL', 7, false, '#c27c0e', 60);

insert into public.claim_categories (code, name, per_line_limit, requires_receipt, gl_code, sort_order) values
  ('TRANSPORT', 'Local transport (taxi, parking, ERP)', 50.00,   true,  '6100', 10),
  ('MEALS',     'Overtime meals',                       20.00,   true,  '6110', 20),
  ('ENTERTAIN', 'Client entertainment',                 150.00,  true,  '6120', 30),
  ('TRAVEL',    'Overseas travel',                      2000.00, true,  '6130', 40),
  ('TRAINING',  'Training & courses',                   500.00,  true,  '6140', 50),
  ('TELCO',     'Mobile & internet',                    80.00,   true,  '6150', 60),
  ('OFFICE',    'Office supplies',                      100.00,  true,  '6160', 70),
  ('MILEAGE',   'Private car mileage',                  null,    false, '6170', 80),
  ('OTHERS',    'Others',                               100.00,  true,  '6190', 90);

insert into public.app_settings (key, value, description) values
  ('reminder_after_working_days', '1', 'Remind the approver after this many working days pending'),
  ('escalate_after_working_days', '2', 'Escalate to the approver''s manager after this many working days pending'),
  ('decision_target_working_days', '2', 'Service level for decisions'),
  ('late_claim_days', '90', 'Expense lines older than this are flagged as late');

-- MOM gazetted public holidays (in-lieu Mondays included)
insert into public.public_holidays (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-17', 'Chinese New Year'),
  ('2026-02-18', 'Chinese New Year'),
  ('2026-03-21', 'Hari Raya Puasa'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-01', 'Labour Day'),
  ('2026-05-27', 'Hari Raya Haji'),
  ('2026-05-31', 'Vesak Day'),
  ('2026-06-01', 'Vesak Day (in lieu)'),
  ('2026-08-09', 'National Day'),
  ('2026-08-10', 'National Day (in lieu)'),
  ('2026-11-08', 'Deepavali'),
  ('2026-11-09', 'Deepavali (in lieu)'),
  ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-02-06', 'Chinese New Year'),
  ('2027-02-07', 'Chinese New Year'),
  ('2027-02-08', 'Chinese New Year (in lieu)'),
  ('2027-03-10', 'Hari Raya Puasa'),
  ('2027-03-26', 'Good Friday'),
  ('2027-05-01', 'Labour Day'),
  ('2027-05-17', 'Hari Raya Haji'),
  ('2027-05-20', 'Vesak Day'),
  ('2027-08-09', 'National Day'),
  ('2027-10-28', 'Deepavali'),
  ('2027-12-25', 'Christmas Day');
