import { Tabs } from '@/components/ui';

export function HrTabs({ current }: { current: string }) {
  return (
    <Tabs current={current} items={[
      { key: 'record', label: 'Master Leave Record', href: '/hr' },
      { key: 'tracker', label: 'Leave Tracker', href: '/hr/tracker' },
      { key: 'reports', label: 'Monthly Report', href: '/hr/reports' },
      { key: 'policies', label: 'Policies & Holidays', href: '/hr/policies' },
    ]} />
  );
}
