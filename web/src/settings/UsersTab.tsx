import { useCallback, useEffect, useState } from "react";
import { Coins, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { requestCreditsRefresh } from "../state/credits";
import { useAuth, useToast } from "../state/store";
import { ConfirmDialog, EmptyState, Field, Modal, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { CreditRequestsCard } from "./CreditRequestsCard";
import type { Role, User } from "../types";

type AdminUser = User & {
  conversationCount: number;
  creditBalance: number;
  /** Tổng credit đã tiêu thụ (burn). */
  creditBurned: number;
  creditGranted: number;
  creditEntries: number;
  creditLastAt: string | null;
};

type SortKey = "burned" | "balance" | "created";

const EMPTY_FORM = { email: "", password: "", name: "", role: "user" as Role };
const DEFAULT_GRANT = "100000";
const DATE_STYLE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

/** Settings → Người dùng. */
export function UsersTab() {
  const { user: currentUser } = useAuth();
  const { push } = useToast();
  const { t, n, d } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [grantForm, setGrantForm] = useState({ amount: DEFAULT_GRANT, note: "" });
  const [granting, setGranting] = useState(false);
  // Chủ dự án 2026-09-20: cần thấy ai burn nhiều nhất ⇒ mặc định sắp theo burn giảm dần.
  const [sort, setSort] = useState<SortKey>("burned");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api.adminUsers()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.users.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.deleteUser(removing.id);
      setUsers((current) => current.filter((item) => item.id !== removing.id));
      push(t("settings.users.removed", { email: removing.email }), "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.users.removeFailed"), "error");
    } finally {
      setDeleting(false);
    }
  };

  const create = async () => {
    if (!form.email.trim() || !form.password) {
      push(t("settings.users.createMissing"), "error");
      return;
    }
    setCreating(true);
    try {
      await api.createUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        role: form.role,
      });
      push(t("settings.users.created", { email: form.email.trim() }), "success");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.users.createFailed"), "error");
    } finally {
      setCreating(false);
    }
  };

  const openGrant = (target: AdminUser) => {
    setGrantFor(target);
    setGrantForm({ amount: DEFAULT_GRANT, note: "" });
  };

  const grant = async () => {
    if (!grantFor) return;
    const amount = Math.trunc(Number(grantForm.amount));
    if (!Number.isFinite(amount) || amount === 0) {
      push(t("settings.users.grantInvalid"), "error");
      return;
    }
    setGranting(true);
    try {
      const result = await api.grantCredits({
        userId: grantFor.id,
        amount,
        note: grantForm.note.trim() || undefined,
      });
      push(t("settings.users.granted", { email: grantFor.email, balance: n(result.balance) }), "success");
      if (grantFor.id === currentUser?.id) requestCreditsRefresh();
      setGrantFor(null);
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.users.grantFailed"), "error");
    } finally {
      setGranting(false);
    }
  };

  const sorted = [...users].sort((a, b) => {
    if (sort === "burned") return b.creditBurned - a.creditBurned;
    if (sort === "balance") return b.creditBalance - a.creditBalance;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  const burnedTotal = users.reduce((sum, item) => sum + item.creditBurned, 0);

  return (
    <div className="stack gap-3">
      <CreditRequestsCard />

      <div className="row">
        <div className="grow">
          <div className="card-title">{t("settings.users.cardTitle")}</div>
          <div className="card-desc">{t("settings.users.cardDesc")}</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {t("common.reload")}
        </button>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> {t("settings.users.createButton")}
        </button>
      </div>

      <div className="hint">{t("settings.users.hint")}</div>
      {!loading && users.length > 0 && (
        <div className="hint">
          {t("settings.users.burnedSummary", { total: n(burnedTotal), users: n(users.length) })}
        </div>
      )}

      {loading && <Spinner label={t("settings.users.loading")} />}

      {!loading && !users.length && (
        <EmptyState
          icon="👥"
          title={t("settings.users.emptyTitle")}
          hint={t("settings.users.emptyHint")}
        />
      )}

      {!loading && users.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("settings.users.colEmail")}</th>
                <th>{t("settings.users.colName")}</th>
                <th>{t("settings.users.colRole")}</th>
                <th>{t("settings.users.colConversations")}</th>
                <th>
                  <button
                    className="th-sort"
                    type="button"
                    onClick={() => setSort("burned")}
                    title={t("settings.users.burnedHint")}
                  >
                    {t("settings.users.colBurned")} {sort === "burned" ? "↓" : ""}
                  </button>
                </th>
                <th>
                  <button className="th-sort" type="button" onClick={() => setSort("balance")}>
                    {t("settings.users.colCredit")} {sort === "balance" ? "↓" : ""}
                  </button>
                </th>
                <th>{t("settings.users.colCreatedAt")}</th>
                <th aria-label={t("settings.users.colActions")} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const self = item.id === currentUser?.id;
                return (
                  <tr key={item.id}>
                    <td className="mono">
                      {item.email}
                      {self && <span className="badge badge-accent badge-inline">{t("settings.users.selfBadge")}</span>}
                    </td>
                    <td>{item.name ?? <span className="faint">—</span>}</td>
                    <td>
                      <span className={`badge ${item.role === "admin" ? "badge-accent" : ""}`}>
                        {item.role === "admin" ? t("common.admin") : t("common.user")}
                      </span>
                    </td>
                    <td>{n(item.conversationCount)}</td>
                    <td className="nowrap bold" title={t("settings.users.burnedTitle", {
                      granted: n(item.creditGranted),
                      entries: n(item.creditEntries),
                    })}>
                      {n(item.creditBurned)}
                    </td>
                    <td className="nowrap">
                      <span className={item.creditBalance <= 0 ? "credit-danger bold" : undefined}>
                        {n(item.creditBalance)}
                      </span>
                    </td>
                    <td className="nowrap">{d(item.createdAt, DATE_STYLE) || "—"}</td>
                    <td>
                      <div className="row gap-2">
                        <button
                          className="btn btn-sm nowrap"
                          type="button"
                          onClick={() => openGrant(item)}
                          title={t("settings.users.grantTitleFor", { email: item.email })}
                        >
                          <Coins size={14} /> {t("settings.users.grantButton")}
                        </button>
                        {!self && (
                          <button
                            className="btn btn-sm btn-danger nowrap"
                            type="button"
                            onClick={() => setRemoving(item)}
                            title={t("settings.users.deleteTitleFor", { email: item.email })}
                          >
                            <Trash2 size={14} /> {t("common.delete")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        title={t("settings.users.createTitle")}
        description={t("settings.users.createDesc")}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn" type="button" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" type="button" onClick={create} disabled={creating}>
              {creating ? t("settings.users.creating") : t("settings.users.createSubmit")}
            </button>
          </>
        }
      >
        <Field label={t("settings.users.fieldEmail")}>
          <input
            className="input"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder={t("settings.users.emailPlaceholder")}
          />
        </Field>
        <Field label={t("settings.users.fieldPassword")} hint={t("settings.users.passwordHint")}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>
        <Field label={t("settings.users.fieldName")}>
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t("settings.users.namePlaceholder")}
          />
        </Field>
        <Field label={t("settings.users.fieldRole")} hint={t("settings.users.roleHint")}>
          <select
            className="select"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
          >
            <option value="user">{t("common.user")}</option>
            <option value="admin">{t("common.admin")}</option>
          </select>
        </Field>
      </Modal>

      <Modal
        open={Boolean(grantFor)}
        title={t("settings.users.grantTitle")}
        description={t("settings.users.grantDesc")}
        onClose={() => setGrantFor(null)}
        footer={
          <>
            <button className="btn" type="button" onClick={() => setGrantFor(null)} disabled={granting}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" type="button" onClick={grant} disabled={granting}>
              {granting ? t("settings.users.granting") : t("settings.users.grantSubmit")}
            </button>
          </>
        }
      >
        <Field label={t("settings.users.fieldUser")}>
          <input className="input" value={grantFor?.email ?? ""} readOnly />
        </Field>
        <Field label={t("settings.users.fieldAmount")} hint={t("settings.users.amountHint")}>
          <input
            className="input w-num"
            type="number"
            step={1}
            value={grantForm.amount}
            onChange={(event) => setGrantForm({ ...grantForm, amount: event.target.value })}
          />
        </Field>
        <Field label={t("settings.users.fieldNote")} hint={t("settings.users.noteHint")}>
          <input
            className="input"
            value={grantForm.note}
            onChange={(event) => setGrantForm({ ...grantForm, note: event.target.value })}
            placeholder={t("settings.users.notePlaceholder")}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("settings.users.deleteTitle")}
        message={t("settings.users.deleteMessage", {
          email: removing?.email ?? "",
          count: n(removing?.conversationCount ?? 0),
        })}
        busy={deleting}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}
