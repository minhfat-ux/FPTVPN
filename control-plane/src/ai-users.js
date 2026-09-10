/**
 * MeetFlow AI user view for the admin dashboard.
 *
 * Pure functions: the route handlers feed in the four data sources (registry,
 * entitlements, payment orders, Firebase users) and get back merged rows plus
 * dashboard stats. Keeping this free of I/O means the merge rules — who counts
 * as "Pro", what "expiring" means, how revenue is attributed — live in one
 * place that can be tested without a server.
 *
 * The MeetFlow Pro entitlement is email-keyed, and so is everything else here,
 * so the email is the join key across all four sources.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 7;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function daysLeftUntil(expiresAt, now) {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now;
  return Number.isFinite(ms) ? Math.ceil(ms / DAY_MS) : null;
}

/** Derives the subscription state of one entitlement at time `now`. */
export function entitlementState(entitlement, now = Date.now()) {
  if (!entitlement) {
    return { status: "none", active: false, plan: null, expiresAt: null, lifetime: false, daysLeft: null };
  }
  const lifetime = !entitlement.expiresAt;
  const left = daysLeftUntil(entitlement.expiresAt, now);
  if (lifetime) {
    return {
      status: "lifetime", active: true, plan: entitlement.plan ?? null,
      expiresAt: null, lifetime: true, daysLeft: null,
      grantedAt: entitlement.grantedAt ?? null, orderCode: entitlement.orderCode ?? null,
    };
  }
  if (left === null || left <= 0) {
    return {
      status: "expired", active: false, plan: entitlement.plan ?? null,
      expiresAt: entitlement.expiresAt ?? null, lifetime: false, daysLeft: left,
      grantedAt: entitlement.grantedAt ?? null, orderCode: entitlement.orderCode ?? null,
    };
  }
  return {
    status: left <= EXPIRING_DAYS ? "expiring" : "active",
    active: true,
    plan: entitlement.plan ?? null,
    expiresAt: entitlement.expiresAt ?? null,
    lifetime: false,
    daysLeft: left,
    grantedAt: entitlement.grantedAt ?? null,
    orderCode: entitlement.orderCode ?? null,
  };
}

/** Play/App Store product id -> plan id (mirrors the server's mapping). */
export function planFromProduct(productId) {
  const id = String(productId ?? "").toLowerCase();
  if (id.includes("year") || id.includes("annual")) return "yearly";
  if (id.includes("month")) return "monthly";
  if (id.includes("pass") || id.includes("30")) return "pass30";
  return null;
}

/** Localized plan label lookup is the caller's job; this only needs amounts. */
function planAmount(prices, plan) {
  const entry = prices?.[plan];
  return Number(entry?.amount ?? entry ?? 0) || 0;
}

function planDays(prices, plan) {
  const entry = prices?.[plan];
  return Number(entry?.days ?? 0) || 0;
}

/**
 * Merges the sources into one row per email.
 *
 * `prices` maps plan id -> { amount, days } so revenue can be attributed to the
 * plan that was bought at the time of the order.
 */
export function buildUserRows({
  registry = [],
  entitlements = [],
  orders = [],
  firebaseUsers = [],
  storePurchases = [],
  prices = {},
  now = Date.now(),
} = {}) {
  const rows = new Map();
  const touchRow = (email) => {
    const key = normalizeEmail(email);
    if (!key) return null;
    let row = rows.get(key);
    if (!row) {
      row = {
        email: key,
        sources: [],
        firstSeen: null,
        lastSeen: null,
        seenCount: 0,
        platform: null,
        appVersion: null,
        note: null,
        inRegistry: false,
        inFirebase: false,
        store: [],
        seenDates: [],
        firstSeenFallback: null,
        lastSeenFallback: null,
        entitlement: null,
        orders: { count: 0, paid: 0, pending: 0, amount: 0, lastOrderCode: null, lastPaidAt: null, methods: [] },
        firebase: null,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const entry of registry) {
    const row = touchRow(entry.email);
    if (!row) continue;
    row.inRegistry = true;
    row.firstSeen = entry.firstSeen ?? null;
    row.lastSeen = entry.lastSeen ?? null;
    row.seenCount = Number(entry.seenCount ?? 0);
    row.platform = entry.platform ?? null;
    row.appVersion = entry.appVersion ?? null;
    row.note = entry.note ?? null;
    row.sources = Array.isArray(entry.sources) ? [...entry.sources] : [];
  }

  for (const entry of entitlements) {
    if (entry.product && entry.product !== "meetflow-pro") continue;
    const row = touchRow(entry.email);
    if (!row) continue;
    row.entitlement = entry;
    if (!row.sources.includes("pro")) row.sources.push("pro");
    // Fallback activity dates: with no registry/Firebase row we still know when
    // the plan was granted, and that is when we first heard from this account.
    if (entry.grantedAt) row.seenDates.push(entry.grantedAt);
    for (const item of Array.isArray(entry.history) ? entry.history : []) {
      if (item?.at) row.seenDates.push(item.at);
    }
  }

  for (const order of orders) {
    const row = touchRow(order.email);
    if (!row) continue;
    row.orders.count += 1;
    if (order.paidAt) {
      row.orders.paid += 1;
      row.orders.amount += planAmount(prices, order.plan);
      if (!row.orders.lastPaidAt || String(order.paidAt) > String(row.orders.lastPaidAt)) {
        row.orders.lastPaidAt = order.paidAt;
      }
    } else {
      row.orders.pending += 1;
    }
    row.orders.lastOrderCode = order.orderCode ?? row.orders.lastOrderCode;
    if (order.createdAt) row.seenDates.push(order.createdAt);
    if (order.paidAt) row.seenDates.push(order.paidAt);
    const method = order.method ?? "bankqr";
    if (!row.orders.methods.includes(method)) row.orders.methods.push(method);
    if (!row.sources.includes("purchase")) row.sources.push("purchase");
  }

  for (const user of firebaseUsers) {
    const row = touchRow(user.email);
    if (!row) continue;
    row.inFirebase = true;
    row.firebase = {
      uid: user.uid,
      created: user.created ?? null,
      lastSignIn: user.lastSignIn ?? null,
      emailVerified: Boolean(user.emailVerified),
      disabled: Boolean(user.disabled),
      provider: user.provider ?? null,
      displayName: user.displayName ?? null,
    };
    if (!row.sources.includes("firebase")) row.sources.push("firebase");
    // Firebase knows the true signup + sign-in time — prefer it for the row.
    if (user.created && (!row.firstSeen || String(user.created) < String(row.firstSeen))) {
      row.firstSeen = user.created;
    }
    if (user.lastSignIn && (!row.lastSeen || String(user.lastSignIn) > String(row.lastSeen))) {
      row.lastSeen = user.lastSignIn;
    }
  }

  // Store purchases carry the buyer's email when the app knew it, otherwise the
  // Firebase uid (or the obfuscated account id Play stored for us) — try both.
  const byUid = new Map();
  for (const row of rows.values()) {
    if (row.firebase?.uid) byUid.set(row.firebase.uid, row);
  }
  for (const purchase of storePurchases) {
    const key = normalizeEmail(purchase.email);
    let target = key ? rows.get(key) : null;
    if (!target && purchase.uid && byUid.has(purchase.uid)) target = byUid.get(purchase.uid);
    if (!target && purchase.obfuscatedAccountId && byUid.has(purchase.obfuscatedAccountId)) {
      target = byUid.get(purchase.obfuscatedAccountId);
    }
    if (!target) continue;
    target.store.push({
      tokenId: purchase.tokenId,
      platform: purchase.platform ?? "android",
      productId: purchase.productId ?? null,
      plan: purchase.plan ?? planFromProduct(purchase.productId),
      expiresAt: purchase.expiresAt ?? null,
      verified: Boolean(purchase.verified),
      active: Boolean(purchase.active),
      autoRenewing: purchase.autoRenewing ?? null,
      orderId: purchase.orderId ?? null,
      state: purchase.state ?? null,
      reportedAt: purchase.lastReportedAt ?? null,
      verifyError: purchase.verifyError ?? null,
    });
    if (!target.sources.includes("store")) target.sources.push("store");
    if (purchase.lastReportedAt) {
      if (!target.lastSeen || String(purchase.lastReportedAt) > String(target.lastSeen)) {
        target.lastSeen = purchase.lastReportedAt;
      }
      if (!target.firstSeen) target.firstSeen = target.lastSeen;
    }
  }

  const list = [];
  for (const row of rows.values()) {
    // Only the registry and Firebase know real signup/activity times; when a
    // user is known purely from payments, fall back to the order timestamps so
    // the dashboard never shows an empty "first seen / last active".
    if (!row.firstSeen && row.seenDates.length) {
      row.firstSeen = row.seenDates.reduce((min, d) => (String(d) < String(min) ? d : min));
    }
    if (!row.lastSeen && row.seenDates.length) {
      row.lastSeen = row.seenDates.reduce((max, d) => (String(d) > String(max) ? d : max));
    }
    const state = entitlementState(row.entitlement, now);
    const history = Array.isArray(row.entitlement?.history) ? row.entitlement.history : [];
    const lastGrant = history.length ? history[history.length - 1] : null;
    list.push({
      email: row.email,
      sources: row.sources,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      seenCount: row.seenCount,
      platform: row.platform,
      appVersion: row.appVersion,
      note: row.note,
      inRegistry: row.inRegistry,
      inFirebase: row.inFirebase,
      firebase: row.firebase,
      pro: {
        ...state,
        grantCount: history.length,
        lastGrantAt: lastGrant?.at ?? row.entitlement?.grantedAt ?? null,
        lastGrantPlan: lastGrant?.plan ?? null,
        lang: row.entitlement?.lang ?? null,
        productId: row.entitlement?.productId ?? null,
        history: history.slice(-20).reverse(),
      },
      orders: row.orders,
      store: row.store,
    });
  }

  list.sort((a, b) => String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? "")));
  return list;
}

/** Applies the dashboard filters (search box, status/source selects, sort). */
export function filterRows(rows, { q = "", status = "all", source = "all", sort = "recent" } = {}) {
  const needle = String(q ?? "").trim().toLowerCase();
  let out = rows.filter((row) => {
    if (needle && !row.email.includes(needle)) return false;
    if (status && status !== "all" && row.pro.status !== status) return false;
    if (source && source !== "all") {
      if (source === "paid" && row.orders.paid === 0) return false;
      if (source === "app" && !row.inRegistry) return false;
      if (source === "firebase" && !row.inFirebase) return false;
      if (source === "noorders" && row.orders.count !== 0) return false;
    }
    return true;
  });

  const byTime = (value) => (value ? Date.parse(value) || 0 : 0);
  if (sort === "newest") out = out.sort((a, b) => byTime(b.firstSeen) - byTime(a.firstSeen));
  else if (sort === "expiry") {
    out = out.sort((a, b) => {
      const av = a.pro.expiresAt ? Date.parse(a.pro.expiresAt) : Number.MAX_SAFE_INTEGER;
      const bv = b.pro.expiresAt ? Date.parse(b.pro.expiresAt) : Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
  } else if (sort === "revenue") out = out.sort((a, b) => b.orders.amount - a.orders.amount);
  else if (sort === "email") out = out.sort((a, b) => a.email.localeCompare(b.email));
  else out = out.sort((a, b) => byTime(b.lastSeen) - byTime(a.lastSeen));

  return out;
}

function monthKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(count, now) {
  const keys = [];
  const d = new Date(now);
  d.setUTCDate(1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    keys.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Dashboard totals for the AI Users tab. */
export function computeStats({ rows = [], orders = [], firebase = {}, store = null, now = Date.now(), prices = {} } = {}) {
  const stats = {
    total: rows.length,
    proActive: 0,
    proLifetime: 0,
    proExpiring: 0,
    proExpired: 0,
    noPro: 0,
    newLast30: 0,
    paidUsers: 0,
    revenue: 0,
    ordersPaid: 0,
    ordersPending: 0,
    renewalsDue: 0,
    byPlan: {},
    byMethod: {},
    byStatus: {},
    series: [],
    // Store purchases (Google Play / App Store) reported by the apps.
    storePurchases: 0,
    storeVerified: 0,
    storeActive: 0,
    storeLinkedUsers: 0,
    firebase: {
      configured: Boolean(firebase.configured),
      error: firebase.error ?? null,
      count: firebase.count ?? 0,
      disabled: 0,
      unverified: 0,
      linked: 0,
      // Firebase also holds anonymous accounts (the apps sign in anonymously),
      // which have no email and therefore cannot be a row in this view.
      anonymous: 0,
    },
  };

  const cutoff30 = now - 30 * DAY_MS;
  const months = lastMonths(6, now);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const series = months.map((month) => ({ month, revenue: 0, orders: 0, newUsers: 0 }));

  for (const row of rows) {
    if (row.pro.status === "lifetime") stats.proLifetime += 1;
    else if (row.pro.status === "active") stats.proActive += 1;
    else if (row.pro.status === "expiring") stats.proExpiring += 1;
    else if (row.pro.status === "expired") stats.proExpired += 1;
    else stats.noPro += 1;

    stats.byStatus[row.pro.status] = (stats.byStatus[row.pro.status] ?? 0) + 1;
    if (row.store.length) {
      stats.storeLinkedUsers += 1;
      if (row.store.some((p) => p.verified && p.active)) stats.storeActive += 1;
    }
    if (row.orders.paid > 0) stats.paidUsers += 1;
    if (row.firstSeen && Date.parse(row.firstSeen) >= cutoff30) stats.newLast30 += 1;
    if (row.inFirebase) {
      stats.firebase.linked += 1;
      if (row.firebase?.disabled) stats.firebase.disabled += 1;
      if (row.firebase && !row.firebase.emailVerified) stats.firebase.unverified += 1;
    }
    const first = row.firstSeen ? monthKey(row.firstSeen) : null;
    if (first && monthIndex.has(first)) series[monthIndex.get(first)].newUsers += 1;
  }

  for (const order of orders) {
    if (!order.paidAt) {
      stats.ordersPending += 1;
      continue;
    }
    stats.ordersPaid += 1;
    const amount = Number(prices?.[order.plan]?.amount ?? prices?.[order.plan] ?? 0) || 0;
    stats.revenue += amount;
    const plan = order.plan ?? "unknown";
    stats.byPlan[plan] = (stats.byPlan[plan] ?? 0) + 1;
    const method = order.method ?? "bankqr";
    stats.byMethod[method] = (stats.byMethod[method] ?? 0) + 1;
    const key = monthKey(order.paidAt);
    if (key && monthIndex.has(key)) {
      series[monthIndex.get(key)].revenue += amount;
      series[monthIndex.get(key)].orders += 1;
    }
  }

  stats.firebase.anonymous = Math.max(0, stats.firebase.count - stats.firebase.linked);
  if (store) {
    stats.storePurchases = store.total ?? 0;
    stats.storeVerified = store.verified ?? 0;
    stats.storeActive = Math.max(stats.storeActive, store.active ?? 0);
  }

  // Active subscriptions expiring inside the reminder window.
  stats.renewalsDue = rows.filter((row) => row.pro.status === "expiring").length;
  stats.series = series;
  return stats;
}

const CSV_COLUMNS = [
  ["email", (r) => r.email],
  ["status", (r) => r.pro.status],
  ["plan", (r) => r.pro.plan ?? ""],
  ["expires_at", (r) => r.pro.expiresAt ?? (r.pro.lifetime ? "lifetime" : "")],
  ["days_left", (r) => (r.pro.daysLeft ?? "")],
  ["granted_at", (r) => r.pro.grantedAt ?? ""],
  ["grants", (r) => r.pro.grantCount],
  ["orders", (r) => r.orders.count],
  ["paid_orders", (r) => r.orders.paid],
  ["amount_paid", (r) => r.orders.amount],
  ["first_seen", (r) => r.firstSeen ?? ""],
  ["last_seen", (r) => r.lastSeen ?? ""],
  ["sources", (r) => r.sources.join("|")],
  ["platform", (r) => r.platform ?? ""],
  ["firebase_uid", (r) => r.firebase?.uid ?? ""],
];

/** CSV export of the current view (opens fine in Excel/Sheets). */
export function rowsToCsv(rows) {
  const escape = (value) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.map(([name]) => name).join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(([, get]) => escape(get(row))).join(","));
  }
  return `${lines.join("\n")}\n`;
}
