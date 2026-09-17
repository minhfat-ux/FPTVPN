import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, RotateCw, Pencil, Trash2, Plug, Info } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { ConfirmDialog, CopyButton, EmptyState, Spinner, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import { McpModal } from "./McpModal";
import type { McpServer, QualifiedTool } from "../types";

const STATUS: Record<McpServer["status"], { label: string; badge: string }> = {
  connected: { label: "settings.mcp.statusConnected", badge: "badge-ok" },
  error: { label: "settings.mcp.statusError", badge: "badge-err" },
  disabled: { label: "settings.mcp.statusDisabled", badge: "badge-warn" },
  unknown: { label: "settings.mcp.statusUnknown", badge: "badge-warn" },
};

/** Settings → MCP server. */
export function McpTab() {
  const { push } = useToast();
  const { t, n } = useI18n();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<QualifiedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [removing, setRemoving] = useState<McpServer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [serverResult, toolResult] = await Promise.all([
        api.mcpServers(),
        api.mcpTools().catch(() => ({ items: [] as QualifiedTool[] })),
      ]);
      setServers(serverResult.items);
      setTools(toolResult.items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcp.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    load();
  }, [load]);

  const patchServer = (server: McpServer) =>
    setServers((current) => current.map((item) => (item.id === server.id ? server : item)));

  const toggleEnabled = async (server: McpServer, enabled: boolean) => {
    try {
      const result = await api.updateMcpServer(server.id, { enabled });
      patchServer(result.server);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcp.updateFailed"), "error");
    }
  };

  const test = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const result = await api.testMcpServer(server.id);
      push(
        t("settings.mcp.testResult", { name: server.name, message: result.message }),
        result.ok ? "success" : "error",
      );
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcp.testFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const result = await api.refreshMcpServer(server.id);
      if (result.server) patchServer(result.server);
      push(
        t("settings.mcp.refreshed", { name: server.name, count: n(result.server?.toolCount ?? 0) }),
        "success",
      );
      setTools((await api.mcpTools()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcp.refreshFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.deleteMcpServer(removing.id);
      setServers((current) => current.filter((item) => item.id !== removing.id));
      push(t("settings.mcp.removed", { name: removing.name }), "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcp.removeFailed"), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="banner banner-compact">
        <Info size={18} />
        <div className="grow small">{t("settings.mcp.intro")}</div>
      </div>

      <div className="row">
        <div className="grow">
          <div className="card-title">{t("settings.mcp.cardTitle")}</div>
          <div className="card-desc">{t("settings.mcp.cardDesc")}</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {t("common.reload")}
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} /> {t("settings.mcp.add")}
        </button>
      </div>

      {loading && <Spinner label={t("settings.mcp.loading")} />}

      {!loading && !servers.length && (
        <EmptyState
          icon="🧰"
          title={t("settings.mcp.emptyTitle")}
          hint={t("settings.mcp.emptyHint")}
        />
      )}

      <div className="stack gap-3">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            busy={busyId === server.id}
            onToggle={toggleEnabled}
            onTest={test}
            onRefresh={refresh}
            onEdit={() => {
              setEditing(server);
              setModalOpen(true);
            }}
            onDelete={() => setRemoving(server)}
          />
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.mcp.toolsTitle")}</div>
            <div className="card-desc">{t("settings.mcp.toolsDesc")}</div>
          </div>
          <span className="badge badge-accent">{t("settings.mcp.toolCount", { count: n(tools.length) })}</span>
        </div>
        {!tools.length ? (
          <div className="muted small">{t("settings.mcp.toolsEmpty")}</div>
        ) : (
          <div className="tool-list">
            {tools.map((tool) => (
              <div className="tool-item" key={tool.qualifiedName}>
                <div className="row row-wrap gap-2">
                  <span className="mono bold">{tool.qualifiedName}</span>
                  <CopyButton value={tool.qualifiedName} label={t("settings.mcp.copyToolName")} />
                  <span className="badge">{tool.serverName}</span>
                </div>
                {tool.description && <div className="small muted mt-1">{tool.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <McpModal
        open={modalOpen}
        server={editing}
        onClose={() => setModalOpen(false)}
        onSaved={async (message) => {
          setModalOpen(false);
          push(message, "success");
          await load();
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("settings.mcp.deleteTitle")}
        message={t("settings.mcp.deleteMessage", { name: removing?.name ?? "" })}
        busy={deleting}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function ServerCard({
  server,
  busy,
  onToggle,
  onTest,
  onRefresh,
  onEdit,
  onDelete,
}: {
  server: McpServer;
  busy: boolean;
  onToggle: (server: McpServer, enabled: boolean) => void;
  onTest: (server: McpServer) => void;
  onRefresh: (server: McpServer) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, n } = useI18n();
  const status = STATUS[server.status] ?? STATUS.unknown;

  return (
    <div className="card">
      <div className="entity-head">
        <div className="grow">
          <div className="row row-wrap gap-2">
            <span className="entity-name">{server.name}</span>
            <span className="badge">{server.transport}</span>
            <span className={`badge ${status.badge}`}>{t(status.label)}</span>
          </div>
          <div className="meta-line">
            <span className="meta-pill">{t("settings.mcp.toolCount", { count: n(server.toolCount) })}</span>
            <span className="meta-pill">{t("settings.mcp.timeout", { ms: n(server.timeoutMs) })}</span>
            {server.autoApprove && <span className="meta-pill">{t("settings.mcp.autoApprove")}</span>}
            <span className="truncate mono">
              {server.transport === "stdio" ? `${server.command ?? ""} ${server.args.join(" ")}` : server.url ?? ""}
            </span>
          </div>
          {server.lastError && (
            <div className="error-text mt-2 truncate" title={server.lastError}>
              {server.lastError}
            </div>
          )}
        </div>

        <div className="stack gap-2" style={{ alignItems: "flex-end" }}>
          <Switch checked={server.enabled} onChange={(value) => onToggle(server, value)} label={t("common.on")} />
          <div className="row row-wrap gap-2">
            <button className="btn btn-sm" type="button" onClick={() => onTest(server)} disabled={busy}>
              <Plug size={14} /> {t("settings.mcp.test")}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => onRefresh(server)} disabled={busy}>
              <RotateCw size={14} /> {t("settings.mcp.refresh")}
            </button>
            <button className="btn btn-sm" type="button" onClick={onEdit}>
              <Pencil size={14} /> {t("common.edit")}
            </button>
            <button className="btn btn-sm btn-danger" type="button" onClick={onDelete}>
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          </div>
        </div>
      </div>

      {server.tools.length > 0 && (
        <div className="mt-3">
          <div className="hint mb-2">{t("settings.mcp.serverTools", { count: n(server.tools.length) })}</div>
          <div className="tool-list">
            {server.tools.map((tool) => (
              <div className="tool-item" key={tool.name}>
                <div className="mono bold">{tool.name}</div>
                {tool.description && <div className="small muted mt-1">{tool.description}</div>}
                <details className="tool-details">
                  <summary>{t("settings.mcp.viewSchema")}</summary>
                  <pre className="mono tool-schema">{JSON.stringify(tool.inputSchema ?? {}, null, 2)}</pre>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
