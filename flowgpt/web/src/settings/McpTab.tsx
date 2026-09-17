import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, RotateCw, Pencil, Trash2, Plug, Info } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { ConfirmDialog, CopyButton, EmptyState, Spinner, Switch } from "../components/ui";
import { McpModal } from "./McpModal";
import type { McpServer, QualifiedTool } from "../types";

const STATUS: Record<McpServer["status"], { label: string; badge: string }> = {
  connected: { label: "Đã kết nối", badge: "badge-ok" },
  error: { label: "Lỗi", badge: "badge-err" },
  disabled: { label: "Đang tắt", badge: "badge-warn" },
  unknown: { label: "Chưa kiểm tra", badge: "badge-warn" },
};

/** Settings → MCP server. */
export function McpTab() {
  const { push } = useToast();
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
      push(err instanceof ApiError ? err.message : "Không tải được MCP server", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

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
      push(err instanceof ApiError ? err.message : "Không cập nhật được MCP server", "error");
    }
  };

  const test = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const result = await api.testMcpServer(server.id);
      push(`${server.name}: ${result.message}`, result.ok ? "success" : "error");
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Kiểm tra MCP thất bại", "error");
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const result = await api.refreshMcpServer(server.id);
      if (result.server) patchServer(result.server);
      push(`Đã nạp lại ${server.name} — ${result.server?.toolCount ?? 0} tool`, "success");
      setTools((await api.mcpTools()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Nạp lại MCP thất bại", "error");
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
      push(`Đã xoá MCP server ${removing.name}`, "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không xoá được MCP server", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="banner banner-compact">
        <Info size={18} />
        <div className="grow small">
          MCP server được cấu hình ở đây ngay trên backend (không cần chạy gì ở máy người dùng). Mỗi khi bật và kết nối
          thành công, toàn bộ tool của server sẽ được đưa cho model sử dụng trong hội thoại — model tự quyết định gọi
          tool nào khi cần.
        </div>
      </div>

      <div className="row">
        <div className="grow">
          <div className="card-title">MCP server</div>
          <div className="card-desc">stdio (chạy lệnh cục bộ) hoặc http/sse (kết nối tới một MCP endpoint từ xa).</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} /> Thêm MCP server
        </button>
      </div>

      {loading && <Spinner label="Đang tải MCP server…" />}

      {!loading && !servers.length && (
        <EmptyState
          icon="🧰"
          title="Chưa có MCP server nào"
          hint="Thêm server đầu tiên (ví dụ filesystem qua npx, hoặc một HTTP MCP endpoint) để cấp thêm công cụ cho model."
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
            <div className="card-title">Công cụ đang khả dụng cho model</div>
            <div className="card-desc">
              Đây là danh sách tool thực tế mà model nhìn thấy (tool có sẵn của hệ thống + tool từ các MCP server đang bật).
            </div>
          </div>
          <span className="badge badge-accent">{tools.length} tool</span>
        </div>
        {!tools.length ? (
          <div className="muted small">Chưa có tool nào khả dụng — hãy bật một MCP server và bấm “Nạp lại”.</div>
        ) : (
          <div className="tool-list">
            {tools.map((tool) => (
              <div className="tool-item" key={tool.qualifiedName}>
                <div className="row row-wrap gap-2">
                  <span className="mono bold">{tool.qualifiedName}</span>
                  <CopyButton value={tool.qualifiedName} label="Sao chép tên tool" />
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
        title="Xoá MCP server"
        message={`Xoá "${removing?.name ?? ""}"? Các tool của server này sẽ không còn khả dụng cho model.`}
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
  const status = STATUS[server.status] ?? STATUS.unknown;

  return (
    <div className="card">
      <div className="entity-head">
        <div className="grow">
          <div className="row row-wrap gap-2">
            <span className="entity-name">{server.name}</span>
            <span className="badge">{server.transport}</span>
            <span className={`badge ${status.badge}`}>{status.label}</span>
          </div>
          <div className="meta-line">
            <span className="meta-pill">{server.toolCount} tool</span>
            <span className="meta-pill">timeout {server.timeoutMs}ms</span>
            {server.autoApprove && <span className="meta-pill">tự động duyệt</span>}
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
          <Switch checked={server.enabled} onChange={(value) => onToggle(server, value)} label="Bật" />
          <div className="row row-wrap gap-2">
            <button className="btn btn-sm" type="button" onClick={() => onTest(server)} disabled={busy}>
              <Plug size={14} /> Kiểm tra
            </button>
            <button className="btn btn-sm" type="button" onClick={() => onRefresh(server)} disabled={busy}>
              <RotateCw size={14} /> Nạp lại
            </button>
            <button className="btn btn-sm" type="button" onClick={onEdit}>
              <Pencil size={14} /> Sửa
            </button>
            <button className="btn btn-sm btn-danger" type="button" onClick={onDelete}>
              <Trash2 size={14} /> Xoá
            </button>
          </div>
        </div>
      </div>

      {server.tools.length > 0 && (
        <div className="mt-3">
          <div className="hint mb-2">Tool của server ({server.tools.length}):</div>
          <div className="tool-list">
            {server.tools.map((tool) => (
              <div className="tool-item" key={tool.name}>
                <div className="mono bold">{tool.name}</div>
                {tool.description && <div className="small muted mt-1">{tool.description}</div>}
                <details className="tool-details">
                  <summary>Xem inputSchema</summary>
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
