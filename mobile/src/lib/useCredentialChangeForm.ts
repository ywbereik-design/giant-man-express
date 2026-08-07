import { useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export interface UseCredentialChangeFormOptions {
  endpoint: string;
  // Maps the hook's generic current/next field values to whatever body
  // shape the target endpoint actually expects (e.g. { currentPassword,
  // newPassword } vs { currentPin, newPin }) — the one place the
  // password/PIN request shapes are still allowed to differ.
  buildBody: (values: { current: string; next: string }) => Record<string, string>;
  // Field-specific format rule for the new value (min length, digit pattern,
  // etc). Return an error message to reject it, or null if it's valid.
  validateNext: (next: string) => string | null;
  missingMessage: string;
  mismatchMessage: string;
  errorFallback: string;
}

// Shared open/close, reset, validate, submit-with-updateToken, success/error
// state machine behind ChangePasswordCard and ChangePinCard — those two
// components were otherwise identical apart from field labels, the new-value
// validation rule, and the request body shape, all of which are supplied
// here rather than duplicated.
export function useCredentialChangeForm(opts: UseCredentialChangeFormOptions) {
  const { updateToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function toggleOpen() {
    setOpen((o) => !o);
    reset();
    setSuccess(false);
  }

  async function submit() {
    setError(null);
    setSuccess(false);
    if (!current || !next) {
      setError(opts.missingMessage);
      return;
    }
    const validationError = opts.validateNext(next);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (next !== confirm) {
      setError(opts.mismatchMessage);
      return;
    }
    setSaving(true);
    try {
      // The server bumps this account's tokenVersion on a successful change,
      // which invalidates every previously-issued token — including the one
      // this very request used — so the fresh token it returns must replace
      // the stored one, or the next request would fail as if logged out.
      const res = await api.patch<{ ok: true; token: string }>(opts.endpoint, opts.buildBody({ current, next }));
      await updateToken(res.token);
      reset();
      setOpen(false);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : opts.errorFallback);
    } finally {
      setSaving(false);
    }
  }

  return { open, current, setCurrent, next, setNext, confirm, setConfirm, error, success, saving, toggleOpen, submit };
}
