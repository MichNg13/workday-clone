import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Role = 'employee' | 'director' | 'hr' | 'office_manager' | 'finance' | 'admin';

export interface Me {
  id: string;
  user_id: string;
  employee_no: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  job_title: string;
  role: Role;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  hire_date: string;
  phone: string | null;
  work_location: string | null;
  reports: number;
  isHR: boolean;
  isFinance: boolean;
  isOfficeManager: boolean;
  isDirector: boolean;
  isManager: boolean;
  canSeeHR: boolean;
}

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getMe = cache(async (): Promise<Me | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('employees')
    .select('*, department:department_id(name), manager:manager_id(full_name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  const { count } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', data.id)
    .eq('is_active', true);
  const role = data.role as Role;
  const admin = role === 'admin';
  const me: Me = {
    ...data,
    department_name: data.department?.name ?? null,
    manager_name: data.manager?.full_name ?? null,
    reports: count ?? 0,
    isHR: admin || role === 'hr',
    isFinance: admin || role === 'finance',
    isOfficeManager: admin || role === 'office_manager',
    isDirector: admin || role === 'director',
    isManager: (count ?? 0) > 0,
    canSeeHR: admin || ['hr', 'office_manager', 'director'].includes(role),
  };
  return me;
});

/** For pages inside the app shell: guarantees a linked worker record. */
export async function requireMe(): Promise<Me> {
  const user = await getUser();
  if (!user) redirect('/login');
  const me = await getMe();
  if (!me) redirect('/not-linked');
  return me;
}

export function firstName(me: Pick<Me, 'preferred_name' | 'full_name'>) {
  return me.preferred_name || me.full_name.split(' ')[0];
}
