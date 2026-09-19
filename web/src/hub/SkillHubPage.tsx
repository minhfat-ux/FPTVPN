import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search, Store } from "lucide-react";
import { api, ApiError } from "../api/client";
import { RequestCreditsForm } from "../chat/RequestCreditsForm";
import { EmptyState, Modal, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useCredits } from "../state/credits";
import { useData, useToast } from "../state/store";
import type { HubListing, HubSkill } from "../types";
import { HubSkillCard, HubSkillDetailBody, renderHubAction } from "./HubSkillCard";
import { formatInstalls, formatPrice, isOwned } from "./hubFormat";
import "./hub.css";

/**
 * Chợ kỹ năng — the marketplace where extra skills are bought with tokens.
 * A purchase is charged server-side and auto-installed into the user's quick
 * list, so the composer dropdown updates as soon as the purchase lands.
 */
export function SkillHubPage() {
  const { t, n } = useI18n();
  const { push } = useToast();
  const { credits, reload: reloadCredits } = useCredits();
  const { skills, reloadSkills } = useData();

  const [listing, setListing] = useState<HubListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  /** Ba nhóm như WorkBuddy: Chuyên gia · Kỹ năng · Kết nối. */
  const [tab, setTab] = useState<"experts" | "skills" | "connectors">("experts");
  const [connectors, setConnectors] = useState<Array<{ slug: string; name: string; purpose: string; category: string }>>([]);
  const [connectorsTried, setConnectorsTried] = useState(false);

  useEffect(() => {
    if (tab !== "connectors" || connectorsTried) return;
    setConnectorsTried(true);
    fetch("/connectors.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setConnectors(Array.isArray(list) ? list : []))
      .catch(() => setConnectors([]));
  }, [tab, connectorsTried]);

  const loadFailed = t("hub.page.loadFailed");

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    try {
      setListing(await api.hub());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : loadFailed);
    } finally {
      setLoading(false);
    }
  }, [loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = listing?.items ?? [];
  const balance = credits?.balance ?? listing?.balance ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Tab theo `kind` (chuyên gia = prompt pack đóng vai, kỹ năng = quy trình). Dữ liệu cũ chưa
    // có `kind` thì suy từ category như trước để không mất mục nào.
    const isExpert = (skill: HubSkill) =>
      skill.kind ? skill.kind === "expert" : skill.category === "Chuyên gia";
    return items.filter((skill) => {
      if (tab === "experts" && !isExpert(skill)) return false;
      if (tab === "skills" && isExpert(skill)) return false;
      if (tab === "connectors") return false;
      if (category === "owned") {
        if (!isOwned(skill)) return false;
      } else if (category !== "all" && skill.category !== category) {
        return false;
      }
      if (!q) return true;
      return `${skill.name} ${skill.tagline ?? ""} ${skill.description ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, category, query, tab]);

  const detail = useMemo(
    () => (detailId ? items.find((skill) => skill.id === detailId) ?? null : null),
    [items, detailId],
  );

  const ownedCount = listing?.ownedCount ?? items.filter((skill) => isOwned(skill)).length;

  const buy = async (skill: HubSkill) => {
    setBuyingId(skill.id);
    try {
      const result = await api.buyHubSkill(skill.id);
      if (result.alreadyOwned) {
        push(t("hub.page.alreadyOwned"), "info");
      } else {
        push(t("hub.page.bought", { name: result.skill?.name ?? skill.name }), "success");
      }
      // The purchase moved tokens and touched the quick list: refresh both.
      await Promise.all([load({ quiet: true }), reloadSkills()]);
      void reloadCredits();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        // The server message already spells out the shortfall and the balance.
        push(err.message, "error");
        setCreditsOpen(true);
      } else {
        push(err instanceof ApiError ? err.message : t("hub.page.buyFailed"), "error");
      }
    } finally {
      setBuyingId(null);
    }
  };

  const use = async (skill: HubSkill) => {
    setUsingId(skill.id);
    try {
      const current = skills.map((item) => item.id);
      const next = current.includes(skill.id) ? current : [...current, skill.id];
      await api.setInstalledSkills(next);
      await reloadSkills();
      push(t("hub.page.used", { name: skill.name }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("hub.page.useFailed"), "error");
    } finally {
      setUsingId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="hub-head">
          <div className="grow">
            <div className="row gap-2">
              <Store size={20} />
              <span className="hub-title">{t("hub.page.title")}</span>
            </div>
            <div className="card-desc mt-1">{t("hub.page.description")}</div>
          </div>
          <div className="hub-balance">
            <div className="tiny faint">{t("hub.page.balance")}</div>
            <div className="hub-balance-value">{n(balance)}</div>
            <div className="row gap-2 mt-2">
              {credits?.buyUrl && (
                <a className="btn btn-sm" href={credits.buyUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink size={13} /> {t("hub.page.topup")}
                </a>
              )}
              <button className="btn btn-sm" type="button" onClick={() => setCreditsOpen(true)}>
                {t("hub.page.requestCredits")}
              </button>
            </div>
          </div>
        </div>

        <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
          {([
            ["experts", "Chuyên gia"],
            ["skills", "Kỹ năng"],
            ["connectors", "Kết nối"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={`tab${tab === id ? " active" : ""}`}
              role="tab"
              aria-selected={tab === id}
              type="button"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="hub-toolbar">
          <div className="hub-search">
            <Search size={15} className="hub-search-icon" />
            <input
              className="input hub-search-input"
              placeholder={t("hub.page.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="btn btn-sm" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> {t("hub.page.refresh")}
          </button>
        </div>

        {tab === "connectors" && (
          <div className="card">
            <div className="bold">Kết nối (connector)</div>
            <div className="card-desc mt-1">
              Danh mục connector dùng được với trợ lý. Quản trị viên bật/tắt và dán khoá trong
              Cài đặt → MCP; sau khi bật, connector tự sinh công cụ cho trợ lý dùng.
            </div>
            {!connectors.length && <div className="hint mt-2">Đang tải danh mục…</div>}
            <div className="mt-2">
              {connectors.map((item) => (
                <div
                  key={item.slug}
                  className="row gap-2"
                  style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--border)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="bold" style={{ fontSize: 13 }}>{item.name || item.slug}</div>
                    <div className="hint" style={{ fontSize: 12 }}>{(item.purpose || "").slice(0, 140)}</div>
                  </div>
                  <span className="chip" style={{ whiteSpace: "nowrap" }}>{item.category || "Khác"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab !== "connectors" && <div className="chip-row hub-chips">
          <button
            className={`chip${category === "all" ? " active" : ""}`}
            type="button"
            onClick={() => setCategory("all")}
          >
            {t("hub.page.allChip", { count: n(items.length) })}
          </button>
          <button
            className={`chip${category === "owned" ? " active" : ""}`}
            type="button"
            onClick={() => setCategory("owned")}
          >
            {t("hub.page.ownedChip", { count: n(ownedCount) })}
          </button>
          {(listing?.categories ?? []).map((name) => (
            <button
              key={name}
              className={`chip${category === name ? " active" : ""}`}
              type="button"
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>}

        {loading && !listing && <Spinner label={t("hub.page.loading")} />}

        {!loading && error && (
          <div className="card">
            <EmptyState icon="⚠️" title={t("hub.page.loadFailed")} hint={error} />
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-sm" type="button" onClick={() => void load()}>
                <RefreshCw size={14} /> {t("hub.page.retry")}
              </button>
            </div>
          </div>
        )}

        {!error && !loading && tab !== "connectors" && !filtered.length && (
          <div className="card">
            <EmptyState
              icon="🛍️"
              title={t("hub.page.empty")}
              hint={t("hub.page.emptyHint")}
            />
          </div>
        )}

        {!error && Boolean(filtered.length) && (
          <div className="hub-grid">
            {filtered.map((skill) => (
              <HubSkillCard
                key={skill.id}
                skill={skill}
                buying={buyingId === skill.id}
                using={usingId === skill.id}
                onOpen={() => setDetailId(skill.id)}
                onBuy={() => void buy(skill)}
                onUse={() => void use(skill)}
              />
            ))}
          </div>
        )}

        <Modal
          open={Boolean(detail)}
          title={detail?.name ?? ""}
          description={detail ? `${detail.category} · ${formatInstalls(detail.installs, t, n)}` : undefined}
          wide
          onClose={() => setDetailId(null)}
          footer={
            detail && (
              <>
                <span className="grow">
                  <span className="hub-detail-price">{formatPrice(detail.priceVnd, t, n)}</span>
                </span>
                <button className="btn" type="button" onClick={() => setDetailId(null)}>
                  {t("hub.page.close")}
                </button>
                {renderHubAction(detail, {
                  block: true,
                  buying: buyingId === detail.id,
                  using: usingId === detail.id,
                  onBuy: () => void buy(detail),
                  onUse: () => void use(detail),
                })}
              </>
            )
          }
        >
          {detail && <HubSkillDetailBody skill={detail} />}
        </Modal>

        <Modal
          open={creditsOpen}
          title={t("hub.page.creditsTitle")}
          description={t("hub.page.creditsDescription")}
          onClose={() => setCreditsOpen(false)}
          footer={
            <button className="btn" type="button" onClick={() => setCreditsOpen(false)}>
              {t("hub.page.close")}
            </button>
          }
        >
          <RequestCreditsForm currentBalance={balance} />
        </Modal>
      </div>
    </div>
  );
}
