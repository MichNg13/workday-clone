import { ACTION_LABEL, fmtDateTime } from '@/lib/format';

export function Timeline({ events }: { events: any[] }) {
  if (!events.length) return <p className="muted">No history yet.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`tl-${e.action}`}>
          <div className="tl-dot" />
          <div>
            <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>
            {e.actor?.full_name ? <> by {e.actor.full_name}</> : e.action === 'reminded' || e.action === 'escalated' ? <> (automatic)</> : null}
            {e.action === 'escalated' && e.details?.working_days && <> after {e.details.working_days} working days</>}
            {e.details?.payment_reference && <> · ref {e.details.payment_reference}</>}
            <div className="muted small">{fmtDateTime(e.created_at)}</div>
            {e.remark && <blockquote>{e.remark}</blockquote>}
          </div>
        </li>
      ))}
    </ol>
  );
}
