// Who may sign in to the app. Emails compare case-insensitively.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowlist(raw: string): string[] {
  return raw
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

export function isEmailAllowed(email: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(normalizeEmail(email));
}
