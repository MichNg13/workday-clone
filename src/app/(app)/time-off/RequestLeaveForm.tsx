'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { days, fmtRange, num } from '@/lib/format';

type LeaveType = {
  code: string; name: string; allow_half_day: boolean; requires_document: boolean; document_label: string | null;
  min_notice_days: number; track_balance: boolean; color: string;
};

type Preview = {
  ok: boolean; errors: string[]; days?: number; flags?: any; approver_name?: string | null;
};

export function RequestLeaveForm({ types, employeeId, today }: { types: LeaveType[]; employeeId: string; today: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [type, setType] = useState(types[0]?.code ?? 'AL');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [part, setPart] = useState<'full' | 'am' | 'pm'>('full');
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const t = useMemo(() => types.find((x) => x.code === type), [types, type]);
  const singleDay = start && end && start === end;

  useEffect(() => {
    if (!singleDay && part !== 'full') setPart('full');
  }, [singleDay, part]);

  useEffect(() => {
    if (!start || !end) {
      setPreview(null);
      return;
    }
    const id = ++seq.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('preview_leave', {
        p_type: type, p_start: start, p_end: end, p_part: part, p_document: doc || null,
      });
      if (id !== seq.current) return;
      setChecking(false);
      if (error) setPreview({ ok: false, errors: [error.message] });
      else setPreview(data as Preview);
    }, 250);
    return () => clearTimeout(timer);
  }, [type, start, end, part, doc, supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let attachment: string | null = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Attachment must be 10 MB or smaller.');
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const path = `${employeeId}/leave/${crypto.randomUUID()}-${safe}`;
        const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
        attachment = path;
      }
      const { data, error } = await supabase.rpc('submit_leave_request', {
        p_type: type, p_start: start, p_end: end, p_part: part,
        p_reason: reason || null, p_document: doc || null, p_attachment_path: attachment,
      });
      if (error) throw new Error(error.message);
      router.push(`/time-off/${data.id}?submitted=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the request.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-grid" id="request">
      <label className="field">
        <span>Leave type</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>From</span>
          <input type="date" required value={start} onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end) setEnd(e.target.value); }} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" required value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {t?.allow_half_day && singleDay && (
        <fieldset className="field segmented">
          <span>Duration</span>
          <div>
            {(['full', 'am', 'pm'] as const).map((p) => (
              <label key={p} className={part === p ? 'on' : ''}>
                <input type="radio" name="part" value={p} checked={part === p} onChange={() => setPart(p)} />
                {p === 'full' ? 'Full day' : p === 'am' ? 'Half day (AM)' : 'Half day (PM)'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {t?.requires_document && (
        <label className="field">
          <span>{t.document_label ?? 'Document no.'} <em className="req">required</em></span>
          <input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="e.g. MC-123456" />
        </label>
      )}
      <label className="field">
        <span>Reason / comment</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Optional" />
      </label>
      <label className="field">
        <span>Attachment {t?.requires_document ? '(MC / letter)' : '(optional)'}</span>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>

      <div className={`preview ${preview ? (preview.ok ? 'preview-ok' : 'preview-bad') : ''}`} aria-live="polite">
        {!start || !end ? (
          <p className="muted">Pick dates to see working days, your balance and any team clashes.</p>
        ) : checking && !preview ? (
          <p className="muted">Checking…</p>
        ) : preview ? (
          <>
            {preview.days !== undefined && (
              <p>
                <strong>{days(preview.days)}</strong> ({fmtRange(start, end, part)}), weekends and public holidays excluded.
                {preview.flags?.balance_before !== undefined && (
                  <> Balance after this request: <strong>{num(preview.flags.balance_after)}</strong> of {num(preview.flags.entitled)}.</>
                )}
              </p>
            )}
            {preview.errors.length > 0 && (
              <ul className="errors">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
            {preview.flags?.short_notice && (
              <p className="warn">Short notice: {t?.name} normally needs {preview.flags.required_notice_days} days&apos; notice. You can still submit; your approver will see this flag.</p>
            )}
            {Array.isArray(preview.flags?.clash) && (
              <p className="warn">Team members also away: {preview.flags.clash.map((c: any) => `${c.name} (${fmtRange(c.start_date, c.end_date)})`).join(', ')}.</p>
            )}
            {preview.ok && preview.approver_name && <p className="muted">Will be sent to <strong>{preview.approver_name}</strong> for approval.</p>}
          </>
        ) : null}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || !preview?.ok || checking}>
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
        <span className="muted small">Today is {fmtRange(today, today)}</span>
      </div>
    </form>
  );
}
