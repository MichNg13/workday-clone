import { ActionForm, SubmitButton } from './ActionForm';
import { saveWorker } from '@/app/actions/hr';
import { ROLE_LABEL } from '@/lib/format';

export function WorkerForm({ worker, departments, managers }: { worker?: any; departments: any[]; managers: any[] }) {
  return (
    <ActionForm action={saveWorker} className="form-grid two" resetOnSuccess={!worker}>
      {worker && <input type="hidden" name="id" value={worker.id} />}
      <label className="field"><span>Employee no.</span><input name="employee_no" required defaultValue={worker?.employee_no} placeholder="E1011" /></label>
      <label className="field"><span>Full name</span><input name="full_name" required defaultValue={worker?.full_name} /></label>
      <label className="field"><span>Work email (used to sign in)</span><input type="email" name="email" required defaultValue={worker?.email} /></label>
      <label className="field"><span>Job title</span><input name="job_title" defaultValue={worker?.job_title} /></label>
      <label className="field"><span>Department</span>
        <select name="department_id" defaultValue={worker?.department_id ?? ''}>
          <option value="">—</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Manager (approver)</span>
        <select name="manager_id" defaultValue={worker?.manager_id ?? ''}>
          <option value="">— none (routes to Director) —</option>
          {managers.filter((m) => m.id !== worker?.id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </label>
      <label className="field"><span>System role</span>
        <select name="role" defaultValue={worker?.role ?? 'employee'}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="field"><span>Hire date</span><input type="date" name="hire_date" required defaultValue={worker?.hire_date} /></label>
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={worker ? worker.is_active : true} /> <span>Active worker</span></label>
      <div className="form-actions"><SubmitButton>{worker ? 'Save changes' : 'Add worker'}</SubmitButton></div>
    </ActionForm>
  );
}
