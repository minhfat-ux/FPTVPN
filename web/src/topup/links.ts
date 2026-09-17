/**
 * The server hands out one "buy more tokens" URL (`credits.buyUrl`). When it
 * points back at FlowGpt's own top-up page (`?view=topup`) the button must switch
 * the view in place; any other URL stays an external link.
 */

/** True when `buyUrl` addresses this app's own top-up view. */
export function isInternalTopupUrl(url: string | null | undefined): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    const view = parsed.searchParams.get("view");
    if (view === "topup") return true;
    // Relative links such as `/topup` or `#topup` are the same page.
    return /^\/?topup\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}
