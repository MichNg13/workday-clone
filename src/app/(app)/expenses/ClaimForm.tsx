'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type Category = { code: string; name: string; per_line_limit: number | null; requires_receipt: boolean };
type Line = {
  key: string; expense_date: string; category_code: string; description: string; amount: string;
  receipt_no: string; attachment_path: string | null; file?: File | null;
};

const blank = (today: string, cat: string): Line => ({
  key: Math.random().toString(36).slice(2), expense_date: today, category_code: cat, description: '',
  amount: '', receipt_no: '', attachment_path: null, file: null,
});

export function ClaimForm({
  categories, employeeId, today, existing,
}: {
  categories: Category[];
  employeeId: string;
  today: string;
  existing?: { id: string; title: string; purpose: string | null; lines: any[]; remark?: string | null };
}) {
  const router = useRouter();
  const supabase = createClient();
  const first = categories[0]?.code ?? 'OTHERS';
  const [title, setTitle] = useState(existing?.title ?? '');
  const [purpose, setPurpose] = useState(existing?.purpose ?? '');
  const [lines, setLines] = useState<Line[]>(
    existing?.lines?.length
      ? existing.lines.map((l) => ({
          key: l.id, expense_date: l.expense_date, category_code: l.category_code, description: l.description,
          amount: String(l.amount), receipt_no: l.receipt_no ?? '', attachment_path: l.attachment_path, file: null,
        }))
      : [blank(today, first)],
  );
  const [declared, setDeclared] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; errors: string[]; total?: number; flags?: any; approver_name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const payload = (ls: Line[]) =>
    ls.map((l) => ({
      expense_date: l.expense_date, category_code: l.category_code, description: l.description,
      amount: l.amount, receipt_no: l.receipt_no, attachment_path: l.attachment_path,
    }));

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('preview_claim', { p_title: title || 'x', p_lines: payload(lines), p_declaration: true });
      if (id !== seq.current) return;
      setPreview(error ? { ok: false, errors: [error.message] } : data);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, title]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const errors = [
    ...(title.trim() ? [] : ['Give the claim a title.']),
    ...(preview?.errors ?? []).filter((e) => !e.startsWith('Give the claim a title')),
    ...(declared ? [] : ['Tick the declaration before submitting.']),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        lines.map(async (l) => {
          if (!l.file) return l;
          if (l.file.size > 10 * 1024 * 1024) throw new Error(`Receipt "${l.file.name}" is larger than 10 MB.`);
          const safe = l.file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
          const path = `${employeeId}/claims/${crypto.randomUUID()}-${safe}`;
          const up = await supabase.storage.from('attachments').upload(path, l.file, { contentType: l.file.type || undefined });
          if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
          return { ...l, attachment_path: path, file: null };
        }),
      );
      const args = { p_title: title, p_purpose: purpose || null, p_lines: payload(uploaded), p_declaration: declared };
      const { data, error } = existing
        ? await supabase.rpc('resubmit_claim', { p_id: existing.id, ...args })
        : await supabase.rpc('submit_claim', args);
      if (error) throw new Error(error.message);
      router.push(`/expenses/${data.id}?submitted=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the claim.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="claim-form">
      {existing?.remark && <div className="alert alert-warn">Returned with remark: “{existing.remark}”. Fix the lines below and resubmit.</div>}
      <div className="field-row">
        <label className="field grow">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client visit – Nov 2026" maxLength={120} required />
        </label>
        <label className="field grow">
          <span>Business purpose</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Optional" maxLength={240} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="table lines">
          <thead>
            <tr><th>#</th><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount (SGD)</th><th>Receipt no.</th><th>Receipt file</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const cat = categories.find((c) => c.code === l.category_code);
              const over = cat?.per_line_limit != null && Number(l.amount) > Number(cat.per_line_limit);
              return (
                <tr key={l.key}>
                  <td>{i + 1}</td>
                  <td><input type="date" value={l.expense_date} max={today} onChange={(e) => update(l.key, { expense_date: e.target.value })} required /></td>
                  <td>
                    <select value={l.category_code} onChange={(e) => update(l.key, { category_code: e.target.value })}>
                      {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    {cat?.per_line_limit != null && <div className={`small ${over ? 'warn' : 'muted'}`}>Limit {money(cat.per_line_limit)}{over ? ' – over limit, approver will see a flag' : ''}</div>}
                  </td>
                  <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="What was it for?" required /></td>
                  <td className="num"><input type="number" inputMode="decimal" step="0.01" min="0.01" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} required /></td>
                  <td>
                    <input value={l.receipt_no} onChange={(e) => update(l.key, { receipt_no: e.target.value })} placeholder={cat?.requires_receipt ? 'Required' : 'Optional'} />
                  </td>
                  <td>
                    <input type="file" accept="application/pdf,image/*" onChange={(e) => update(l.key, { file: e.target.files?.[0] ?? null })} />
                    {l.attachment_path && !l.file && <div className="small muted">File attached</div>}
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" className="btn-icon" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button type="button" className="btn btn-secondary" onClick={() => setLines((ls) => [...ls, blank(today, first)])} disabled={lines.length >= 30}>+ Add line</button>
              </td>
              <td className="num"><strong>{money(total)}</strong></td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="check">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
        <span>I declare that these expenses were incurred wholly for company business, the receipts are genuine, and I have not claimed them elsewhere.</span>
      </label>

      <div className={`preview ${errors.length ? 'preview-bad' : 'preview-ok'}`} aria-live="polite">
        {errors.length > 0 ? (
          <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <p>Ready to submit · total <strong>{money(preview?.total ?? total)}</strong>{preview?.approver_name ? <> · goes to <strong>{preview.approver_name}</strong></> : null}</p>
        )}
        {Array.isArray(preview?.flags?.over_limit) && <p className="warn">Some lines are over the category limit. You can submit; the approver will decide.</p>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || errors.length > 0}>{busy ? 'Submitting…' : existing ? 'Resubmit claim' : 'Submit claim'}</button>
      </div>
    </form>
  );
}
