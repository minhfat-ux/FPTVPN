// Pure device-limit rule (FR: max N active devices per account).
//
// block when: activeCount > max
//          OR (!isOwnDevice AND activeCount >= max)
//
// A device that already belongs to this user (and is not revoked) is exempt, so
// only a genuinely NEW device can push the account over the cap. An account that
// is already over the cap (e.g. devices added before this rule) is always
// blocked until it logs some out.
//
// Accounts on the exemption list (env DEVICE_LIMIT_EXEMPT_EMAILS) skip the rule
// entirely — see parseExemptEmails/isDeviceLimitExempt below.
export function deviceLimitDecision({ activeCount, isOwnDevice, max, exempt = false }) {
  if (exempt) return { blocked: false, code: null };
  const blocked = activeCount > max || (!isOwnDevice && activeCount >= max);
  return { blocked, code: blocked ? "device_limit_reached" : null };
}

/**
 * Parse the DEVICE_LIMIT_EXEMPT_EMAILS env value. Kept byte-for-byte equivalent
 * to index.js `parseEmailList`: comma-separated, trimmed, lowercased, blanks
 * dropped, so " A@B.com ,, " and "a@b.com" mean the same thing.
 */
export function parseExemptEmails(value) {
  return new Set(String(value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean));
}

/**
 * True when `email` is on the exemption list. Matching is case- and
 * whitespace-insensitive; a missing/empty email is never exempt.
 */
export function isDeviceLimitExempt(email, exemptEmails) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return exemptEmails.has(normalized);
}
