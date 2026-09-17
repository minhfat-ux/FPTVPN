import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Field, Modal, Switch } from "../components/ui";
import type { McpServer, SecretEntry } from "../types";

type Transport = McpServer["transport"];

interface SecretRow {
  id: number;
  key: string;
  value: string;
  saved: SecretEntry | null;
}

let rowId = 0;
const newRow = (entry?: SecretEntry): SecretRow => ({
  id: (rowId += 1),
  key: entry?.key ?? "",
  value: "",
  saved: entry ?? null,
});

/** Builds the secret map sent to the API and reports keys the admin left empty. */
function collectSecrets(rows: SecretRow[]): { data: Record<string, string> | undefined; blank: string[] } {
  const used = rows.filter((row) => row.key.trim());
  const data: Record<string, string> = {};
  const blank: string[] = [];
  for (const row of used) {
    const key = row.key.trim();
    if (row.saved && !row.value) continue; // untouched → backend keeps the stored value
    if (!row.value) {
      blank.push(key);
      continue;
    }
    data[key] = row.value;
  }
  return { data: used.length ? data : undefined, blank };
}

/** Create/edit dialog for one MCP server, including secret handling. */
export function McpModal({
  open,
  server,
  onClose,
  onSaved,
}: {
  open: boolean;
  server: McpServer | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState<SecretRow[]>([]);
  const [headers, setHeaders] = useState<SecretRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(server);

  useEffect(() => {
    if (!open) return;
    if (server) {
      setName(server.name);
      setTransport(server.transport);
      setCommand(server.command ?? "");
      setArgsText(server.args.join("\n"));
      setUrl(server.url ?? "");
      setEnv(server.env.length ? server.env.map(newRow) : [newRow()]);
      setHeaders(server.headers.length ? server.headers.map(newRow) : [newRow()]);
      setEnabled(server.enabled);
      setAutoApprove(server.autoApprove);
      setTimeoutMs(server.timeoutMs || 30000);
    } else {
      setName("");
      setTransport("stdio");
      setCommand("npx");
      setArgsText("-y\n@modelcontextprotocol/server-filesystem\n.");
      setUrl("");
      setEnv([newRow()]);
      setHeaders([newRow()]);
      setEnabled(true);
      setAutoApprove(false);
      setTimeoutMs(30000);
    }
    setSaving(false);
  }, [open, server]);

  const save = async () => {
    if (!name.trim()) {
      push("Nhập tên MCP server", "error");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      push("Transport stdio cần lệnh (command), ví dụ: npx", "error");
      return;
    }
    if (transport !== "stdio" && !url.trim()) {
      push(`Transport ${transport} cần URL`, "error");
      return;
    }

    const envSecrets = collectSecrets(env);
    const headerSecrets = collectSecrets(headers);
    const blank = [...envSecrets.blank, ...headerSecrets.blank];
    if (blank.length) {
      push(`Còn ${blank.length} biến chưa có giá trị: ${blank.join(", ")}`, "error");
      return;
    }
    const args = argsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      transport,
      enabled,
      autoApprove,
      timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : 30000,
    };
    if (transport === "stdio") {
      payload.command = command.trim();
      payload.args = args;
      payload.url = null;
    } else {
      payload.url = url.trim();
      payload.command = null;
      payload.args = [];
    }
    if (envSecrets.data) payload.env = envSecrets.data;
    if (headerSecrets.data) payload.headers = headerSecrets.data;

    setSaving(true);
    try {
      if (isEdit && server) {
        await api.updateMcpServer(server.id, payload);
        await onSaved(`Đã cập nhật MCP server ${payload.name}`);
      } else {
        await api.createMcpServer(payload);
        await onSaved(`Đã thêm MCP server ${payload.name}`);
      }
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không lưu được MCP server", "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? `Sửa MCP server — ${server?.name ?? ""}` : "Thêm MCP server"}
      description="Cấu hình được lưu trên backend và dùng cho mọi người dùng. Tool của server sẽ được cấp cho model sau khi nạp lại thành công."
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm server"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tên server" hint="Chỉ dùng để hiển thị; tool sẽ hiện dưới dạng tên-server__tên-tool.">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ví dụ: filesystem"
          />
        </Field>

        <Field label="Kiểu kết nối (transport)" hint="stdio chạy lệnh trên máy chủ; http/sse kết nối tới một endpoint MCP.">
          <div className="seg" role="group" aria-label="Transport">
            {(["stdio", "http", "sse"] as Transport[]).map((item) => (
              <button
                key={item}
                type="button"
                className={transport === item ? "active" : ""}
                aria-pressed={transport === item}
                onClick={() => setTransport(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </Field>

        {transport === "stdio" ? (
          <>
            <Field label="Lệnh (command)" hint="Ví dụ: npx, node, python, uvx hoặc đường dẫn tuyệt đối tới file thực thi.">
              <input
                className="input input-mono"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npx"
              />
            </Field>
            <Field label="Tham số (args)" hint="Mỗi dòng một tham số.">
              <textarea
                className="textarea input-mono"
                rows={4}
                value={argsText}
                onChange={(event) => setArgsText(event.target.value)}
                placeholder={"-y\n@modelcontextprotocol/server-filesystem\n."}
              />
            </Field>
          </>
        ) : (
          <Field label="URL" hint="Endpoint MCP đầy đủ, ví dụ https://mcp.example.com/mcp">
            <input
              className="input input-mono"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}

        {transport === "stdio" ? (
          <KeyValueEditor
            title="Biến môi trường (env)"
            keyPlaceholder="TÊN_BIẾN"
            rows={env}
            onChange={setEnv}
            hint="Giá trị đã lưu chỉ hiển thị dạng rút gọn. Chỉ những ô bạn nhập mới bị ghi đè; ô để nguyên sẽ giữ giá trị cũ trên server."
          />
        ) : (
          <KeyValueEditor
            title="Header"
            keyPlaceholder="Authorization"
            rows={headers}
            onChange={setHeaders}
            hint="Ví dụ Authorization: Bearer … Giá trị đã lưu chỉ hiển thị dạng rút gọn. Chỉ những ô bạn nhập mới bị ghi đè; ô để nguyên sẽ giữ giá trị cũ trên server."
          />
        )}

        <div className="num-row">
          <Field label="Thời gian chờ (ms)" hint="Mặc định 30000. Tăng lên nếu server khởi động chậm.">
            <input
              className="input w-num"
              type="number"
              min={1000}
              step={1000}
              value={timeoutMs}
              onChange={(event) => setTimeoutMs(Number(event.target.value))}
            />
          </Field>
          <div className="stack gap-2">
            <Switch checked={enabled} onChange={setEnabled} label="Bật server này" />
            <Switch
              checked={autoApprove}
              onChange={setAutoApprove}
              label="Tự động duyệt tool (không hỏi lại trước khi gọi)"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function KeyValueEditor({
  title,
  keyPlaceholder,
  rows,
  onChange,
  hint,
}: {
  title: string;
  keyPlaceholder: string;
  rows: SecretRow[];
  onChange: (rows: SecretRow[]) => void;
  hint: string;
}) {
  const update = (id: number, patch: Partial<SecretRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div className="mb-3">
      <div className="label mb-2">{title}</div>
      <div className="kv-list">
        {rows.map((row) => (
          <div className="kv-row" key={row.id}>
            <input
              className="input kv-key"
              value={row.key}
              placeholder={keyPlaceholder}
              onChange={(event) => update(row.id, { key: event.target.value })}
            />
            {row.saved ? (
              <input
                className="input kv-saved"
                disabled
                value={`${row.saved.preview ?? "••••"} — đã lưu — nhập đè để thay`}
                title="Giá trị đã lưu (đã ẩn). Nhập vào ô này để thay thế."
                onChange={() => undefined}
              />
            ) : null}
            <input
              className="input input-mono grow"
              type="password"
              autoComplete="new-password"
              value={row.value}
              placeholder={row.saved ? "Nhập giá trị mới…" : "Giá trị"}
              onChange={(event) => update(row.id, { value: event.target.value })}
            />
            <button
              className="btn btn-sm btn-ghost btn-icon"
              type="button"
              title="Xoá dòng"
              aria-label="Xoá dòng"
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn-sm mt-2" type="button" onClick={() => onChange([...rows, newRow()])}>
        <Plus size={14} /> Thêm dòng
      </button>
      <div className="hint mt-2">{hint}</div>
    </div>
  );
}
