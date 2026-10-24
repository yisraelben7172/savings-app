"use client";

import { useActionState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** A form wired to a server action, with a status line for success or error messages. */
export function ActionForm({ action, children, className, resetOnSuccess }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess ? state?.n : undefined}
    >
      {children}
      {state?.error && (
        <p className="ad-msg err" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="ad-msg ok" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function Submit({ children, className = "btn primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

/** A one-click button for a bound server action (approve, skip, mark read...). */
export function ActButton({
  action,
  children,
  className = "btn",
  confirm,
  title,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      title={title}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {children}
    </button>
  );
}
