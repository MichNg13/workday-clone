import { IconAlert } from './icons';
import { fmtRange, money, num } from '@/lib/format';

export function LeaveFlags({ flags }: { flags: any }) {
  if (!flags) return null;
  const items: React.ReactNode[] = [];
  if (flags.short_notice) {
    items.push(<li key="sn">Short notice: {flags.notice_days} day(s) ahead (policy asks for {flags.required_notice_days}).</li>);
  }
  if (Array.isArray(flags.clash) && flags.clash.length) {
    items.push(
      <li key="cl">
        Team clash: {flags.clash.map((c: any) => `${c.name} (${fmtRange(c.start_date, c.end_date)}, ${c.status})`).join('; ')}
      </li>,
    );
  }
  if (!items.length) return null;
  return (
    <div className="flags">
      <IconAlert size={16} />
      <ul>{items}</ul>
    </div>
  );
}

export function BalanceLine({ flags }: { flags: any }) {
  if (!flags || flags.balance_before === undefined) return null;
  return (
    <span className="balance-line">
      Balance {num(flags.balance_before)} → <strong>{num(flags.balance_after)}</strong> of {num(flags.entitled)} days
    </span>
  );
}

export function ClaimFlags({ flags }: { flags: any }) {
  if (!flags) return null;
  const items: React.ReactNode[] = [];
  if (Array.isArray(flags.over_limit)) {
    flags.over_limit.forEach((o: any) =>
      items.push(<li key={'o' + o.line}>Line {o.line}: {money(o.amount)} is over the {o.category} limit of {money(o.limit)}.</li>),
    );
  }
  if (Array.isArray(flags.late_lines) && flags.late_lines.length) {
    items.push(<li key="late">Late submission: line(s) {flags.late_lines.join(', ')} are more than 90 days old.</li>);
  }
  if (!items.length) return null;
  return (
    <div className="flags">
      <IconAlert size={16} />
      <ul>{items}</ul>
    </div>
  );
}
