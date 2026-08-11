// Deliberately permissive — just enough to catch obvious typos client-side
// before round-tripping to the backend's authoritative z.string().email()
// check. Shared so every form asking for an email address validates it the
// same way.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Mirrors the backend's PHONE_PATTERN (see backend/src/lib/constants.ts) —
// loose on purpose, just enough to catch a dispatcher typing something
// that clearly isn't a phone number before it reaches the driver's Call/
// WhatsApp buttons downstream.
export function isValidPhone(value: string): boolean {
  return /^[\d+()\-.\s]{7,20}$/.test(value);
}

// Mirrors the backend's DATE_ONLY_PATTERN — a plain calendar date
// (YYYY-MM-DD), no time component, used for driver license expiry.
export function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
