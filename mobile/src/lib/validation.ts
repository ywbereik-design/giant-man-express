// Deliberately permissive — just enough to catch obvious typos client-side
// before round-tripping to the backend's authoritative z.string().email()
// check. Shared so every form asking for an email address validates it the
// same way.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
