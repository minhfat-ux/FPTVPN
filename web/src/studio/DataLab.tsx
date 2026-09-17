import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, RefreshCw, Upload } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { AnalysisPayload, DataTable, FileRef } from "../types";
import { Chart } from "../components/Chart";
import { EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useChat } from "../state/chat";
import { useToast } from "../state/store";
import { DataOpsStep } from "./DataOpsStep";
import { MAX_ROWS, buildPayload, newOperation, newestAnalysis, type OperationRow } from "./dataOps";

/** Phân tích dữ liệu: chọn tệp → mô tả thao tác → chạy → xem bảng, ghi chú và biểu đồ. */
export function DataLab({ onOpenChat }: { onOpenChat?: () => void }) {
  const { t, n } = useI18n();
  const { send, sending, streaming, messages } = useChat();
  const { push } = useToast();

  const [files, setFiles] = useState<FileRef[]>([]);
  const [selected, setSelected] = useState<FileRef | null>(null);
  const [operations, setOperations] = useState<OperationRow[]>([newOperation()]);
  const [result, setResult] = useState<AnalysisPayload | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const live = newestAnalysis(streaming?.toolResults, messages);
  const [produced, setProduced] = useState<AnalysisPayload | null>(null);

  const wasSending = useRef(false);
  const latest = useRef<AnalysisPayload | null>(null);
  latest.current = live;

  // Khi lượt chat kết thúc, `streaming` bị xoá — giữ lại kết quả phân tích.
  useEffect(() => {
    if (sending) wasSending.current = true;
    else if (wasSending.current) {
      wasSending.current = false;
      const snapshot = latest.current;
      if (snapshot) setProduced(snapshot);
    }
  }, [sending]);

  const loadFiles = useCallback(async () => {
    try {
      const items = (await api.listArtifacts()).items;
      setFiles(items.filter((item) => item.kind === "data" || /\.(csv|tsv|xlsx|xls|json)$/i.test(item.name)));
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Ưu tiên cột từ kết quả phân tích; nếu chưa có thì đọc từ metadata của tệp.
  const columns = useMemo(() => {
    if (result?.columns?.length) return result.columns;
    if (produced?.columns?.length) return produced.columns;
    const meta = selected?.meta as { columns?: unknown } | undefined;
    if (Array.isArray(meta?.columns)) return meta.columns.map((item) => String(item));
    return [];
  }, [result, produced, selected]);

  function pickFile(file: FileRef) {
    setSelected(file);
    setResult(null);
    setProduced(null);
  }

  async function upload(file: File) {
    if (!/\.(csv|tsv|xlsx|xls|json)$/i.test(file.name)) {
      push(t("studio.data.badType"), "error");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await api.upload(file);
      setFiles((list) => [uploaded.file, ...list.filter((item) => item.id !== uploaded.file.id)]);
      pickFile(uploaded.file);
      push(t("studio.data.uploaded"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("studio.data.uploadFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  function patch(id: string, next: Partial<OperationRow>) {
    setOperations((list) => list.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  function move(index: number, delta: number) {
    setOperations((list) => {
      const at = index + delta;
      if (at < 0 || at >= list.length) return list;
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(at, 0, item);
      return copy;
    });
  }

  async function analyze() {
    if (!selected) {
      push(t("studio.data.needFile"), "error");
      return;
    }
    const payload = {
      __tool: "analyze_data",
      fileId: selected.id,
      operations: operations.map(buildPayload),
    };
    await send({
      content: `${t("studio.data.instruction")}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
      attachments: [selected],
      skill: "data",
    });
    push(t("studio.data.sent"), "info");
  }

  const display: AnalysisPayload | null = result ?? produced ?? live;

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">{t("studio.data.step1")}</div>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onClick={() => document.getElementById("datalab-file")?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              const file = event.dataTransfer.files[0];
              if (file) void upload(file);
            }}
          >
            <Upload size={18} />
            <div className="bold mt-1">{t("studio.data.dropTitle")}</div>
            <div className="tiny mt-1">{t("studio.data.dropHint")}</div>
          </div>
          <input
            id="datalab-file"
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          {busy && (
            <div className="mt-2">
              <Spinner label={t("studio.data.uploading")} />
            </div>
          )}
          {selected && (
            <div className="row gap-2 mt-3">
              <span className="badge badge-ok">{t("studio.data.selected")}</span>
              <span className="grow truncate small">{selected.name}</span>
              <button className="btn btn-sm" type="button" onClick={() => document.getElementById("datalab-file")?.click()}>
                {t("studio.data.changeFile")}
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.data.uploadedFiles")}</div>
            <button className="btn btn-sm btn-icon" type="button" title={t("studio.data.reload")} onClick={() => void loadFiles()}>
              <RefreshCw size={14} />
            </button>
          </div>
          {files.length ? (
            <div className="stack gap-1">
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className={`nav-item ${selected?.id === file.id ? "active" : ""}`}
                  onClick={() => pickFile(file)}
                >
                  <span className="nav-label">{file.name}</span>
                  <span className="tiny faint nowrap">{(file.size / 1024).toFixed(0)} KB</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="hint">{t("studio.data.noFiles")}</div>
          )}
        </div>
      </div>

      <div className="stack">
        <DataOpsStep
          operations={operations}
          columns={columns}
          onPatch={patch}
          onAdd={() => setOperations((list) => [...list, newOperation()])}
          onRemove={(id) => setOperations((list) => list.filter((item) => item.id !== id))}
          onMove={move}
        />

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <div className="card-title">{t("studio.data.step3")}</div>
              <div className="card-desc">
                {selected ? (
                  <>
                    {t("studio.data.fileLabel")} <span className="mono">{selected.name}</span>
                  </>
                ) : (
                  t("studio.data.noFilePicked")
                )}
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={analyze} disabled={sending || !selected}>
            {sending ? <Spinner label={t("studio.data.analyzing")} /> : <><BarChart3 size={16} /> {t("studio.data.analyze")}</>}
          </button>
          {onOpenChat && (
            <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
              {t("studio.action.openChat")}
            </button>
          )}
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.data.step4")}</div>
            {display && (
              <span className="badge badge-accent">
                {t("studio.data.shape", { rows: n(display.rowCount), cols: n(display.columnCount) })}
              </span>
            )}
          </div>

          {!display ? (
            <EmptyState icon="📈" title={t("studio.data.emptyTitle")} hint={t("studio.data.emptyHint")} />
          ) : (
            <div className="stack">
              {display.notes.length > 0 && (
                <ul className="note-list">
                  {display.notes.map((note, index) => (
                    <li key={index} className="small">
                      {note}
                    </li>
                  ))}
                </ul>
              )}

              {display.tables.map((table: DataTable, index: number) => (
                <div key={`${table.name}-${index}`}>
                  <div className="bold small mb-1">{table.name}</div>
                  <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          {table.columns.map((column, columnIndex) => (
                            <th key={`${column}-${columnIndex}`}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, MAX_ROWS).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {table.columns.map((_, columnIndex) => (
                              <td key={columnIndex} className={typeof row[columnIndex] === "number" ? "mono" : undefined}>
                                {row[columnIndex] === null || row[columnIndex] === undefined
                                  ? ""
                                  : typeof row[columnIndex] === "number"
                                    ? n(row[columnIndex] as number)
                                    : String(row[columnIndex])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {table.rows.length > MAX_ROWS && (
                    <div className="hint mt-1">{t("studio.data.moreRows", { count: n(table.rows.length - MAX_ROWS) })}</div>
                  )}
                  {table.note && <div className="hint mt-1">{table.note}</div>}
                </div>
              ))}

              {display.chart && <Chart spec={display.chart} />}

              {display.truncated && <div className="hint">{t("studio.data.truncated")}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
