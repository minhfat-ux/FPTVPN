import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { api, ApiError } from "../api/client";
import { EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useToast } from "../state/store";
import type { HubAdminListing, HubSkill, HubSkillKind, HubSkillOrigin } from "../types";
import "./hub.css";

const toNumber = (value: string): number => {
  const parsed = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const asVnd = (value: number): string => `${Math.max(0, Math.trunc(value || 0)).toLocaleString("vi-VN")} đ`;

/**
 * Console → Chợ kỹ năng → "Giá & phân loại".
 *
 * Hai việc, trên cùng một bảng vì chúng luôn đi với nhau:
 *   1. Phân loại: hình thức (chuyên gia / kỹ năng) và nguồn gốc (mình tự làm / clone về).
 *   2. Đặt giá: chỉ mục "mình tự làm" mới đặt được — mục clone về khoá ở giá 0, vì bán lại nội
 *      dung nguồn ngoài là tái phân phối thương mại (docs/CONTENT-POLICY.md §3.1). Server cũng
 *      chặn lần nữa, nên UI chỉ đang hiện trước điều server sẽ từ chối.
 */
export function HubPricingPanel() {
  const { t, n } = useI18n();
  const { push } = useToast();
  const [listing, setListing] = useState<HubAdminListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Giá đang gõ, theo id — chỉ giữ mục đã sửa để ô nhập không nhảy khi tải lại. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | HubSkillKind>("all");
  const [origin, setOrigin] = useState<"all" | HubSkillOrigin>("all");
  const [query, setQuery] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadFailed = t("hub.pricing.loadFailed");

  const load = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (!options.quiet) setLoading(true);
      try {
        setListing(await api.adminHub());
        setError(null);
        if (!options.quiet) setDraft({});
      } catch (err) {
        setError(err instanceof ApiError ? err.message : loadFailed);
      } finally {
        setLoading(false);
      }
    },
    [loadFailed],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const items = listing?.items ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((skill) => {
      if (kind !== "all" && skill.kind !== kind) return false;
      if (origin !== "all" && skill.origin !== origin) return false;
      if (!q) return true;
      return `${skill.name} ${skill.slug} ${skill.category}`.toLowerCase().includes(q);
    });
  }, [items, kind, origin, query]);

  const ownCount = items.filter((skill) => skill.origin === "own").length;
  const cloneCount = items.length - ownCount;
  const bulkTargets = filtered.filter((skill) => skill.sellable).length;

  const priceValue = (skill: HubSkill): string => draft[skill.id] ?? String(skill.priceVnd ?? 0);

  /** Lưu giá của MỘT mục. Server từ chối nếu mục là clone về — hiện nguyên văn lý do. */
  const savePrice = async (skill: HubSkill) => {
    const next = toNumber(priceValue(skill));
    if (next === skill.priceVnd) {
      push(t("hub.pricing.noChanges"), "info");
      return;
    }
    setSavingId(skill.id);
    try {
      await api.updateHubSkill(skill.id, { priceVnd: next });
      await load({ quiet: true });
      setDraft((current) => {
        const copy = { ...current };
        delete copy[skill.id];
        return copy;
      });
      push(t("hub.pricing.saved", { name: skill.name, price: asVnd(next) }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("hub.pricing.saveFailed"), "error");
    } finally {
      setSavingId(null);
    }
  };

  /** Đổi phân loại của MỘT mục (hình thức hoặc nguồn gốc). */
  const changeClassification = async (
    skill: HubSkill,
    patch: { kind?: HubSkillKind; origin?: HubSkillOrigin },
  ) => {
    setBusyRowId(skill.id);
    try {
      await api.updateHubSkill(skill.id, patch);
      await load({ quiet: true });
      push(t("hub.pricing.classified", { name: skill.name }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("hub.pricing.classifyFailed"), "error");
    } finally {
      setBusyRowId(null);
    }
  };

  /** Đặt cùng một giá cho cả nhóm đang lọc; mục clone về bị bỏ qua và báo lại số lượng. */
  const applyBulk = async () => {
    const value = toNumber(bulk);
    if (!value) {
      push(t("hub.pricing.bulkNeedsValue"), "error");
      return;
    }
    const targets = filtered.filter((skill) => skill.sellable);
    if (!targets.length) {
      push(t("hub.pricing.bulkNothing"), "info");
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const skill of targets) {
      try {
        await api.updateHubSkill(skill.id, { priceVnd: value });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    await load({ quiet: true });
    setBulkBusy(false);
    push(
      t("hub.pricing.bulkDone", { ok, skipped: filtered.length - targets.length, failed }),
      failed ? "error" : "success",
    );
  };

  const kindLabel = (skill: HubSkill): string =>
    listing?.kindLabels?.[skill.kind] ?? (skill.kind === "expert" ? t("hub.form.kindExpert") : t("hub.form.kindSkill"));
  const originLabel = (skill: HubSkill): string =>
    listing?.originLabels?.[skill.origin] ?? (skill.origin === "own" ? t("hub.form.originOwn") : t("hub.form.originClone"));

  return (
    <div className="card pricing-panel">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">{t("hub.pricing.title")}</div>
          <div className="card-desc">{t("hub.pricing.description")}</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={() => void load()} disabled={loading || bulkBusy}>
          <RefreshCw size={14} /> {t("hub.pricing.refresh")}
        </button>
      </div>

      <div className="pricing-toolbar">
        <select className="select" value={kind} onChange={(event) => setKind(event.target.value as "all" | HubSkillKind)}>
          <option value="all">{t("hub.pricing.filterKind")}: {t("hub.pricing.all")}</option>
          <option value="expert">{t("hub.form.kindExpert")}</option>
          <option value="skill">{t("hub.form.kindSkill")}</option>
        </select>
        <select
          className="select"
          value={origin}
          onChange={(event) => setOrigin(event.target.value as "all" | HubSkillOrigin)}
        >
          <option value="all">{t("hub.pricing.filterOrigin")}: {t("hub.pricing.all")}</option>
          <option value="own">{t("hub.form.originOwn")}</option>
          <option value="clone">{t("hub.form.originClone")}</option>
        </select>
        <input
          className="input grow"
          placeholder={t("hub.pricing.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="tiny faint">
          {t("hub.pricing.counts", { own: n(ownCount), clone: n(cloneCount), shown: n(filtered.length) })}
        </span>
      </div>

      <div className="pricing-bulk">
        <span className="small bold">{t("hub.pricing.bulkTitle")}</span>
        <input
          className="input w-num"
          type="number"
          min={0}
          step={10000}
          placeholder={t("hub.pricing.bulkPlaceholder")}
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
        />
        <button className="btn btn-sm" type="button" onClick={() => void applyBulk()} disabled={bulkBusy || !bulkTargets}>
          {bulkBusy ? <Spinner label={t("hub.pricing.bulkApplying")} /> : t("hub.pricing.bulkApply", { count: n(bulkTargets) })}
        </button>
        <span className="tiny faint">{t("hub.pricing.bulkHint")}</span>
      </div>

      {loading && !items.length && <Spinner label={t("hub.pricing.loading")} />}
      {!loading && error && <EmptyState icon="⚠️" title={t("hub.pricing.loadFailed")} hint={error} />}
      {!error && !filtered.length && (
        <EmptyState icon="🔎" title={t("hub.pricing.empty")} hint={t("hub.pricing.emptyHint")} />
      )}

      {Boolean(filtered.length) && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("hub.pricing.colItem")}</th>
                <th>{t("hub.pricing.colKind")}</th>
                <th>{t("hub.pricing.colOrigin")}</th>
                <th>{t("hub.pricing.colCategory")}</th>
                <th>{t("hub.pricing.colPrice")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((skill) => (
                <tr key={skill.id} className={skill.sellable ? undefined : "pricing-locked"}>
                  <td>
                    <span className="bold small">{skill.name}</span>
                    <span className="tiny faint" style={{ display: "block" }}>
                      {skill.slug}
                    </span>
                  </td>
                  <td>
                    <select
                      className="select select-sm"
                      value={skill.kind}
                      disabled={busyRowId === skill.id}
                      onChange={(event) => void changeClassification(skill, { kind: event.target.value as HubSkillKind })}
                    >
                      <option value="expert">{t("hub.form.kindExpert")}</option>
                      <option value="skill">{t("hub.form.kindSkill")}</option>
                    </select>
                    <span className="tiny faint" style={{ display: "block" }}>
                      {kindLabel(skill)}
                    </span>
                  </td>
                  <td>
                    <select
                      className="select select-sm"
                      value={skill.origin}
                      disabled={busyRowId === skill.id}
                      onChange={(event) =>
                        void changeClassification(skill, { origin: event.target.value as HubSkillOrigin })
                      }
                    >
                      <option value="own">{t("hub.form.originOwn")}</option>
                      <option value="clone">{t("hub.form.originClone")}</option>
                    </select>
                    <span className="tiny faint" style={{ display: "block" }}>
                      {originLabel(skill)}
                    </span>
                  </td>
                  <td className="small">{skill.category}</td>
                  <td>
                    <input
                      className="input w-num"
                      type="number"
                      min={0}
                      step={10000}
                      value={priceValue(skill)}
                      disabled={!skill.sellable || savingId === skill.id}
                      onChange={(event) => setDraft((current) => ({ ...current, [skill.id]: event.target.value }))}
                    />
                    <span className="tiny faint" style={{ display: "block" }}>
                      {skill.sellable ? (skill.priceVnd ? asVnd(skill.priceVnd) : t("hub.pricing.free")) : t("hub.pricing.locked")}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={!skill.sellable || savingId === skill.id}
                      onClick={() => void savePrice(skill)}
                    >
                      {savingId === skill.id ? <Spinner label={t("hub.pricing.saving")} /> : <><Save size={14} /> {t("hub.pricing.save")}</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tiny faint pricing-note">{t("hub.pricing.note")}</div>
    </div>
  );
}
