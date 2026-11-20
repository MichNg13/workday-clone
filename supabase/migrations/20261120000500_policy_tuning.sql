-- Advisor fixes: one SELECT policy per table (write policies split by action) + FK indexes

do $$
declare t text; p text; roles text;
begin
  for t, p, roles in values
    ('departments',        'hr manage departments',           $r$'hr'$r$),
    ('leave_types',        'hr manage leave types',           $r$'hr'$r$),
    ('public_holidays',    'hr manage holidays',              $r$'hr'$r$),
    ('claim_categories',   'finance manage claim categories', $r$'finance', 'hr'$r$),
    ('app_settings',       'hr manage settings',              $r$'hr'$r$),
    ('leave_entitlements', 'hr manage entitlements',          $r$'hr'$r$)
  loop
    execute format('drop policy %I on public.%I', p, t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_role(%s)))', p || ' (insert)', t, roles);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_role(%s))) with check ((select public.has_role(%s)))', p || ' (update)', t, roles, roles);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_role(%s)))', p || ' (delete)', t, roles);
  end loop;
end $$;

create index if not exists departments_head_idx on public.departments (head_id);
create index if not exists leave_entitlements_type_idx on public.leave_entitlements (leave_type_code);
create index if not exists leave_entitlements_updated_by_idx on public.leave_entitlements (updated_by);
create index if not exists leave_types_counts_toward_idx on public.leave_types (counts_toward_code);
create index if not exists leave_types_requires_exhausted_idx on public.leave_types (requires_exhausted_code);
