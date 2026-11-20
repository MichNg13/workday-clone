import Link from 'next/link';
import { monthBounds, shiftMonth, monthLabel } from '@/lib/format';

export function AbsenceCalendar({
  month, people, absences, holidays, basePath,
}: {
  month: string;
  people: { id: string; full_name: string; department?: string | null }[];
  absences: any[];
  holidays: { holiday_date: string; name: string }[];
  basePath: string;
}) {
  const { year, monthIndex, lastDay } = monthBounds(month);
  const dates = Array.from({ length: lastDay }, (_, i) => {
    const d = new Date(Date.UTC(year, monthIndex, i + 1));
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    return { iso, day: i + 1, dow, weekend: dow === 0 || dow === 6, holiday: holidays.find((h) => h.holiday_date === iso) };
  });
  const byPerson = new Map<string, any[]>();
  absences.forEach((a) => byPerson.set(a.employee_id, [...(byPerson.get(a.employee_id) ?? []), a]));
  const clashDays = new Set(
    dates.filter((d) => absences.filter((a) => a.start_date <= d.iso && a.end_date >= d.iso && !d.weekend && !d.holiday).length >= 2).map((d) => d.iso),
  );

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <Link className="btn btn-secondary" href={`${basePath}?month=${shiftMonth(month, -1)}`}>‹</Link>
        <strong>{monthLabel(month)}</strong>
        <Link className="btn btn-secondary" href={`${basePath}?month=${shiftMonth(month, 1)}`}>›</Link>
        <span className="legend">
          <i className="lg approved" /> Approved <i className="lg pending" /> Pending <i className="lg clash" /> 2+ people away
        </span>
      </div>
      <div className="table-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="cal-name">Worker</th>
              {dates.map((d) => (
                <th key={d.iso} className={`${d.weekend ? 'we' : ''} ${d.holiday ? 'ph' : ''} ${clashDays.has(d.iso) ? 'clashday' : ''}`} title={d.holiday?.name}>
                  <span>{'SMTWTFS'[d.dow]}</span>
                  {d.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td className="cal-name">{p.full_name}{p.department && <span className="muted small"> · {p.department}</span>}</td>
                {dates.map((d) => {
                  const a = (byPerson.get(p.id) ?? []).find((x) => x.start_date <= d.iso && x.end_date >= d.iso);
                  const show = a && !d.weekend && !d.holiday;
                  return (
                    <td key={d.iso} className={`${d.weekend ? 'we' : ''} ${d.holiday ? 'ph' : ''}`}>
                      {show && (
                        <span
                          className={`cal-cell ${a.status} ${a.day_part !== 'full' ? 'half' : ''}`}
                          style={{ background: a.status === 'approved' ? a.color : undefined, borderColor: a.color }}
                          title={`${p.full_name}: ${a.leave_type_name} (${a.status})${a.day_part !== 'full' ? ' ' + a.day_part.toUpperCase() : ''}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
