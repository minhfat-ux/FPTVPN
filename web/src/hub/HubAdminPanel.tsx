import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { ConfirmDialog, EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useToast } from "../state/store";
import type { HubSkill } from "../types";
import { hubIcon } from "./icons";
import {
  EMPTY_HUB_FORM,
  HubSkillFormDialog,
  creditsForVnd,
  formFromSkill,
  toHubNumber,
  type HubFormState,
} from "./HubSkillForm";
import "./hub.css";

type HubState = HubSkill["state"];

/** Admin table label for a skill state; the form has its own, longer labels. */
const STATE_LABEL_KEYS: Record<HubState, string> = {
  published: "hub.admin.statePublished",
  coming_soon: "hub.admin.stateComingSoon",
  hidden: "hub.admin.stateHidden",
};

function stateBadge(state: HubState): string {
  if (state === "published") return "badge-ok";
  if (state === "coming_soon") return "badge-warn";
  return "badge-err";
}

/**
 * Settings → Chợ kỹ năng: the admin side of the marketplace. A skill is a
 * prompt pack — name, price, instructions and the tools the agent may use.
 *
 * `/api/admin/hub` returns the full skill shape including `instructions` and
 * `tools` (admin-only fields), so the edit form prefills the whole pack.
 */
export function HubAdminPanel() {
  const { t, n } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<HubSkill[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [originLabels, setOriginLabels] = useState<Record<string, string>>({});
  const [kindLabels, setKindLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<HubSkill | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<HubFormState>(EMPTY_HUB_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HubSkill | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Owner-set price of one credit, so skill prices can be shown in VND too. */
  const [vndPerCredit, setVndPerCredit] = useState(0);

  const loadFailed = t("hub.admin.loadFailedToast");

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    try {
      const result = await api.adminHub();
      setItems(result.items);
      setCategories(result.categories);
      setOriginLabels(result.originLabels ?? {});
      setKindLabels(result.kindLabels ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : loadFailed);
    } finally {
      setLoading(false);
    }
    // Best effort: the price list still works when the settings call fails.
    try {
      const { settings } = await api.appSettings();
      setVndPerCredit(Math.max(0, Number(settings.vndPerCredit) || 0));
    } catch {
      setVndPerCredit(0);
    }
  }, [loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_HUB_FORM, category: categories[0] ?? t("hub.admin.categoryDefault") });
    setFormOpen(true);
  };

  const openEdit = (skill: HubSkill) => {
    setEditing(skill);
    setForm(formFromSkill(skill));
    setFormOpen(true);
  };

  const patch = (next: Partial<HubFormState>) => setForm((current) => ({ ...current, ...next }));

  const save = async () => {
    if (!form.name.trim()) {
      push(t("hub.admin.nameRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const storedTools = Array.isArray(editing.tools) ? editing.tools : [];
        const toolsChanged =
          storedTools.length !== form.tools.length || form.tools.some((tool) => !storedTools.includes(tool));
        const changes: Record<string, unknown> = {};
        if (form.name.trim() !== editing.name) changes.name = form.name.trim();
        if (form.tagline !== (editing.tagline ?? "")) changes.tagline = form.tagline;
        if (form.description !== (editing.description ?? "")) changes.description = form.description;
        if (form.category !== editing.category) changes.category = form.category;
        if (form.kind !== editing.kind) changes.kind = form.kind;
        if (form.origin !== editing.origin) changes.origin = form.origin;
        if (form.icon !== editing.icon) changes.icon = form.icon;
        if (toHubNumber(form.priceVnd) !== editing.priceVnd) changes.priceVnd = toHubNumber(form.priceVnd);
        if (form.state !== editing.state) changes.state = form.state;
        if (toHubNumber(form.sortOrder) !== Number(editing.sortOrder ?? 0)) {
          changes.sortOrder = toHubNumber(form.sortOrder);
        }
        // The stored pack is prefilled, so any difference (including clearing it) travels.
        if (form.instructions.trim() !== (editing.instructions ?? "")) {
          changes.instructions = form.instructions.trim();
        }
        if (toolsChanged) changes.tools = form.tools;
        if (!Object.keys(changes).length) {
          push(t("hub.admin.noChanges"), "info");
          return;
        }
        await api.updateHubSkill(editing.id, changes);
      } else {
        await api.createHubSkill({
          name: form.name.trim(),
          tagline: form.tagline.trim(),
          description: form.description.trim(),
          category: form.category,
          kind: form.kind,
          origin: form.origin,
          icon: form.icon.trim() || "sparkles",
          priceVnd: toHubNumber(form.priceVnd),
          state: form.state,
          sortOrder: toHubNumber(form.sortOrder),
          instructions: form.instructions.trim(),
          tools: form.tools,
        });
      }
      await load({ quiet: true });
      setFormOpen(false);
      push(editing ? t("hub.admin.updated") : t("hub.admin.created"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("hub.admin.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteHubSkill(pendingDelete.id);
      await load({ quiet: true });
      push(t("hub.admin.deleted"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("hub.admin.deleteFailed"), "error");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("hub.admin.title")}</div>
            <div className="card-desc">{t("hub.admin.description")}</div>
          </div>
          <button className="btn btn-sm" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> {t("hub.admin.refresh")}
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={openCreate}>
            <Plus size={14} /> {t("hub.admin.add")}
          </button>
        </div>

        {loading && !items.length && <Spinner label={t("hub.admin.loading")} />}
        {!loading && error && <EmptyState icon="⚠️" title={t("hub.admin.loadFailed")} hint={error} />}
        {!error && !loading && !items.length && (
          <EmptyState icon="🧩" title={t("hub.admin.empty")} hint={t("hub.admin.emptyHint")} />
        )}

        {Boolean(items.length) && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("hub.admin.colSkill")}</th>
                  <th>{t("hub.admin.colSlug")}</th>
                  <th>{t("hub.admin.colCategory")}</th>
                  <th>{t("hub.pricing.colKind")}</th>
                  <th>{t("hub.pricing.colOrigin")}</th>
                  <th>{t("hub.admin.colPrice")}</th>
                  <th>{t("hub.admin.colState")}</th>
                  <th>{t("hub.admin.colInstalls")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((skill) => (
                  <tr key={skill.id}>
                    <td>
                      <span className="row gap-2">
                        <span className="hub-row-icon">{hubIcon(skill.icon, 15)}</span>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="bold small">{skill.name}</span>
                          <span className="tiny faint" style={{ display: "block" }}>
                            {skill.tagline}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="mono tiny">{skill.slug}</td>
                    <td className="small">{skill.category}</td>
                    <td className="small">
                      {kindLabels[skill.kind] ?? (skill.kind === "expert" ? t("hub.form.kindExpert") : t("hub.form.kindSkill"))}
                    </td>
                    <td className="small">
                      <span className={`badge ${skill.origin === "own" ? "badge-ok" : "badge-warn"}`}>
                        {originLabels[skill.origin] ?? skill.origin}
                      </span>
                    </td>
                    <td className="small nowrap">
                      {skill.priceVnd > 0 ? (
                        <>
                          <span className="bold">{t("hub.card.price", { amount: n(skill.priceVnd) })}</span>
                          {vndPerCredit > 0 && (
                            <span className="tiny faint" style={{ display: "block" }}>
                              {t("hub.admin.priceCredits", {
                                credits: n(creditsForVnd(skill.priceVnd, vndPerCredit)),
                              })}
                            </span>
                          )}
                        </>
                      ) : (
                        t("hub.card.free")
                      )}
                    </td>
                    <td>
                      <span className={`badge ${stateBadge(skill.state)}`}>{t(STATE_LABEL_KEYS[skill.state])}</span>
                    </td>
                    <td className="small nowrap">{n(skill.installs ?? 0)}</td>
                    <td>
                      <span className="row gap-2">
                        <button className="btn btn-sm" type="button" onClick={() => openEdit(skill)}>
                          <Pencil size={13} /> {t("hub.admin.edit")}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => setPendingDelete(skill)}
                        >
                          <Trash2 size={13} /> {t("hub.admin.delete")}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="hint mt-3">{t("hub.admin.deleteHint")}</div>
      </div>

      <HubSkillFormDialog
        open={formOpen}
        editing={editing}
        categories={categories}
        value={form}
        saving={saving}
        vndPerCredit={vndPerCredit}
        onChange={patch}
        onClose={() => setFormOpen(false)}
        onSubmit={() => void save()}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("hub.admin.deleteTitle")}
        message={t("hub.admin.deleteMessage", { name: pendingDelete?.name ?? "" })}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        busy={deleting}
      />
    </div>
  );
}
