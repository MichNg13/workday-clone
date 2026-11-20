'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state?.ok && state.message && <div className="alert alert-success" role="status">{state.message}</div>}
    </form>
  );
}

export function SubmitButton({
  children,
  className = 'btn btn-primary',
  name,
  value,
  pendingText,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  name?: string;
  value?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} name={name} value={value} disabled={pending || disabled}>
      {pending ? pendingText ?? 'Working…' : children}
    </button>
  );
}
