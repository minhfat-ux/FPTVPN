// Pure device-limit rule (FR: max N active devices per account).
//
// block when: activeCount > max
//          OR (!isOwnDevice AND activeCount >= max)
//
// A device that already belongs to this user (and is not revoked) is exempt, so
// only a genuinely NEW device can push the account over the cap. An account that
// is already over the cap (e.g. devices added before this rule) is always
// blocked until it logs some out.
export function deviceLimitDecision({ activeCount, isOwnDevice, max }) {
  const blocked = activeCount > max || (!isOwnDevice && activeCount >= max);
  return { blocked, code: blocked ? "device_limit_reached" : null };
}
