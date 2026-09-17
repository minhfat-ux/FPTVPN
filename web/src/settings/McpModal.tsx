import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Field, Modal, Switch } from "../components/ui";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
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
      push(t("settings.mcpModal.nameRequired"), "error");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      push(t("settings.mcpModal.commandRequired"), "error");
      return;
    }
    if (transport !== "stdio" && !url.trim()) {
      push(t("settings.mcpModal.urlRequired", { transport }), "error");
      return;
    }

    const envSecrets = collectSecrets(env);
    const headerSecrets = collectSecrets(headers);
    const blank = [...envSecrets.blank, ...headerSecrets.blank];
    if (blank.length) {
      push(t("settings.mcpModal.blankSecrets", { count: blank.length, keys: blank.join(", ") }), "error");
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
        await onSaved(t("settings.mcpModal.updated", { name: String(payload.name) }));
      } else {
        await api.createMcpServer(payload);
        await onSaved(t("settings.mcpModal.created", { name: String(payload.name) }));
      }
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.mcpModal.saveFailed"), "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? t("settings.mcpModal.editTitle", { name: server?.name ?? "" }) : t("settings.mcpModal.createTitle")}
      description={t("settings.mcpModal.desc")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : isEdit ? t("common.saveChanges") : t("settings.mcpModal.createSubmit")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("settings.mcpModal.nameLabel")} hint={t("settings.mcpModal.nameHint")}>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settings.mcpModal.namePlaceholder")}
          />
        </Field>

        <Field label={t("settings.mcpModal.transportLabel")} hint={t("settings.mcpModal.transportHint")}>
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
            <Field label={t("settings.mcpModal.commandLabel")} hint={t("settings.mcpModal.commandHint")}>
              <input
                className="input input-mono"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npx"
              />
            </Field>
            <Field label={t("settings.mcpModal.argsLabel")} hint={t("settings.mcpModal.argsHint")}>
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
          <Field label={t("settings.mcpModal.urlLabel")} hint={t("settings.mcpModal.urlHint")}>
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
            title={t("settings.mcpModal.envTitle")}
            keyPlaceholder={t("settings.mcpModal.envKeyPlaceholder")}
            rows={env}
            onChange={setEnv}
            hint={t("settings.mcpModal.envHint")}
          />
        ) : (
          <KeyValueEditor
            title={t("settings.mcpModal.headersTitle")}
            keyPlaceholder="Authorization"
            rows={headers}
            onChange={setHeaders}
            hint={t("settings.mcpModal.headersHint")}
          />
        )}

        <div className="num-row">
          <Field label={t("settings.mcpModal.timeoutLabel")} hint={t("settings.mcpModal.timeoutHint")}>
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
            <Switch checked={enabled} onChange={setEnabled} label={t("settings.mcpModal.enable")} />
            <Switch checked={autoApprove} onChange={setAutoApprove} label={t("settings.mcpModal.autoApprove")} />
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
  const { t } = useI18n();
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
                value={t("settings.mcpModal.savedPreview", { preview: row.saved.preview ?? "••••" })}
                title={t("settings.mcpModal.savedTitle")}
                onChange={() => undefined}
              />
            ) : null}
            <input
              className="input input-mono grow"
              type="password"
              autoComplete="new-password"
              value={row.value}
              placeholder={row.saved ? t("settings.mcpModal.newValuePlaceholder") : t("settings.mcpModal.valuePlaceholder")}
              onChange={(event) => update(row.id, { value: event.target.value })}
            />
            <button
              className="btn btn-sm btn-ghost btn-icon"
              type="button"
              title={t("settings.mcpModal.removeRow")}
              aria-label={t("settings.mcpModal.removeRow")}
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn-sm mt-2" type="button" onClick={() => onChange([...rows, newRow()])}>
        <Plus size={14} /> {t("settings.mcpModal.addRow")}
      </button>
      <div className="hint mt-2">{hint}</div>
    </div>
  );
}
