import { useEffect, useMemo, useRef, useState } from "react";
import { downloadFileFromApi } from "../files/download";
import { FileDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Artifact } from "../types";
import { Field, Spinner, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import { useChat } from "../state/chat";
import { useToast } from "../state/store";

type Cell = string | number;

interface GridRow {
  id: string;
  cells: Cell[];
}

/** Bảng mẫu, dựng lại theo ngôn ngữ đang chọn. */
function sampleTable(t: (key: string) => string): { name: string; columns: string[]; rows: Cell[][] } {
  const values = [420000000, 310000000, 455000000, 382000000, 498000000, 431000000];
  const costs = [260000000, 150000000, 268000000, 171000000, 275000000, 188000000];
  const rows: Cell[][] = values.map((value, index) => [
    t(`studio.excel.sampleMonth${Math.floor(index / 2) + 1}`),
    t(index % 2 ? "studio.excel.sampleChannelOnline" : "studio.excel.sampleChannelStore"),
    value,
    costs[index],
  ]);
  return {
    name: t("studio.excel.sampleSheet"),
    columns: [t("studio.excel.sampleCol1"), t("studio.excel.sampleCol2"), t("studio.excel.sampleCol3"), t("studio.excel.sampleCol4")],
    rows,
  };
}

const newRow = (width: number): GridRow => ({
  id: `r_${Math.random().toString(36).slice(2)}`,
  cells: Array.from({ length: Math.max(1, width) }, () => ""),
});

/** Tách CSV/TSV thủ công: hỗ trợ dấu `,` `;` và trường được bọc trong dấu nháy kép. */
export function parseDelimited(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return { header: [], rows: [] };

  const first = lines[0];
  const count = (value: string, char: string) => value.split(char).length;
  const delimiter = count(first, ";") > count(first, ",") ? ";" : count(first, "\t") > count(first, ",") ? "\t" : ",";

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quoted) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 1;
          } else quoted = false;
        } else field += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) {
        out.push(field);
        field = "";
      } else field += char;
    }
    out.push(field);
    return out.map((value) => value.trim());
  };

  const [headerLine, ...bodyLines] = lines;
  return { header: parseLine(headerLine), rows: bodyLines.map(parseLine) };
}

/** Chuỗi chỉ gồm số → gửi dạng số; chuỗi có dấu phân cách nghìn cũng được quy đổi. */
function toCell(value: string): Cell {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // "1.234.567" hoặc "1,234,567" → 1234567 (dấu phân cách nghìn)
  const plain = trimmed.replace(/[.,\s]/g, "");
  if (/^-?\d+$/.test(plain) && Number(plain) > 999) return Number(plain);
  // "1,5" (dấu phẩy thập phân kiểu Việt Nam) → 1.5
  if (/^-?\d+,\d{1,6}$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  return value;
}

/** Dựng bảng tính rồi giao cho backend tạo tệp .xlsx qua một lượt chat (skill `excel`). */
export function ExcelBuilder({ onOpenChat }: { onOpenChat?: () => void }) {
  const { t } = useI18n();
  const { send, sending, streaming, pendingArtifacts } = useChat();
  const { push } = useToast();

  const [fileName, setFileName] = useState(() => t("studio.excel.defaultFileName"));
  const [sheetName, setSheetName] = useState("Sheet1");
  // Tên cột mặc định, dịch theo ngôn ngữ đang chọn.
  const [columns, setColumns] = useState<string[]>(() =>
    ["studio.excel.defaultCol1", "studio.excel.defaultCol2", "studio.excel.defaultCol3"].map((key) => t(key)),
  );
  const [rows, setRows] = useState<GridRow[]>([newRow(3), newRow(3), newRow(3)]);
  const [totalsRow, setTotalsRow] = useState(true);
  const [csv, setCsv] = useState("");
  const [produced, setProduced] = useState<Artifact[]>([]);

  const wasSending = useRef(false);
  const latest = useRef<Artifact[]>([]);
  latest.current = streaming?.artifacts?.length ? streaming.artifacts : pendingArtifacts;

  // Khi lượt chat kết thúc, `streaming` bị xoá — giữ lại tệp đã tạo để người dùng vẫn tải được.
  useEffect(() => {
    if (sending) wasSending.current = true;
    else if (wasSending.current) {
      wasSending.current = false;
      setProduced((list) => {
        const merged = [...latest.current, ...list];
        return merged.filter((item, index) => merged.findIndex((other) => other.id === item.id) === index);
      });
    }
  }, [sending]);

  const payload = useMemo(
    () => ({
      __tool: "generate_xlsx",
      filename: fileName.trim() || t("studio.excel.fallbackFileName"),
      sheets: [
        {
          name: sheetName.trim() || "Sheet1",
          columns: columns.map((column) => column.trim() || t("studio.excel.columnFallback")),
          rows: rows.map((row) => columns.map((_, index) => toCell(String(row.cells[index] ?? "")))),
          totalsRow,
        },
      ],
    }),
    [fileName, sheetName, columns, rows, totalsRow, t],
  );

  const artifacts: Artifact[] = streaming?.artifacts?.length
    ? streaming.artifacts
    : pendingArtifacts.length
      ? pendingArtifacts
      : produced;
  const excelFiles = artifacts.filter((item) => item.kind === "xlsx" || item.name.endsWith(".xlsx"));

  function setColumnCount(next: number) {
    const width = Math.max(1, next);
    setColumns((list) =>
      Array.from({ length: width }, (_, index) => list[index] ?? t("studio.excel.defaultColumn", { index: index + 1 })),
    );
    setRows((list) => list.map((row) => ({ ...row, cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? "") })));
  }

  function removeColumn(index: number) {
    setColumns((list) => list.filter((_, i) => i !== index));
    setRows((list) => list.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i !== index) })));
  }

  function removeRow(rowId: string) {
    setRows((list) => list.filter((item) => item.id !== rowId));
  }

  function pickSample() {
    const sample = sampleTable(t);
    setFileName(t("studio.excel.sampleFileName"));
    setSheetName(sample.name);
    setColumns(sample.columns);
    setRows(sample.rows.map((line) => ({ id: `r_${Math.random().toString(36).slice(2)}`, cells: [...line] })));
  }

  function setCell(rowId: string, index: number, value: string) {
    setRows((list) => list.map((row) => (row.id === rowId ? { ...row, cells: row.cells.map((cell, i) => (i === index ? value : cell)) } : row)));
  }

  function applyCsv() {
    const parsed = parseDelimited(csv);
    if (!parsed.header.length) {
      push(t("studio.excel.csvEmpty"), "error");
      return;
    }
    setColumns(parsed.header);
    setRows(parsed.rows.length ? parsed.rows.map((line) => ({ id: `r_${Math.random().toString(36).slice(2)}`, cells: line })) : [newRow(parsed.header.length)]);
    push(t("studio.excel.csvLoaded", { count: parsed.rows.length }), "success");
  }

  async function generate() {
    if (!payload.sheets[0].columns.length) {
      push(t("studio.excel.needOneColumn"), "error");
      return;
    }
    if (!payload.sheets[0].rows.some((row) => row.some((cell) => cell !== ""))) {
      push(t("studio.excel.needData"), "error");
      return;
    }
    await send({
      content: `${t("studio.excel.instruction")}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
      skill: "excel",
    });
    push(t("studio.excel.sent"), "info");
  }

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">{t("studio.excel.infoTitle")}</div>
          <Field label={t("studio.excel.fileName")}>
            <input className="input" value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </Field>
          <Field label={t("studio.excel.sheetName")}>
            <input className="input" value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
          </Field>
          <Switch checked={totalsRow} onChange={setTotalsRow} label={t("studio.excel.totalsRow")} />
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.excel.columns", { count: columns.length })}</div>
            <button className="btn btn-sm" type="button" onClick={() => setColumnCount(columns.length + 1)}>
              <Plus size={14} /> {t("studio.excel.addColumn")}
            </button>
            <button className="btn btn-sm btn-danger" type="button" disabled={columns.length <= 1} onClick={() => setColumnCount(columns.length - 1)}>
              <Trash2 size={14} /> {t("studio.excel.removeColumn")}
            </button>
          </div>
          <div className="stack gap-2">
            {columns.map((column, index) => (
              <div className="row gap-2" key={`col-${index}`}>
                <span className="badge">{index + 1}</span>
                <input className="input grow" value={column} onChange={(event) => setColumns((list) => list.map((item, i) => (i === index ? event.target.value : item)))} />
                <button
                  className="btn btn-sm btn-icon btn-danger"
                  type="button"
                  title={t("studio.excel.removeColumnTitle")}
                  disabled={columns.length <= 1}
                  onClick={() => removeColumn(index)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.excel.pasteCsv")}</div>
            <button className="btn btn-sm" type="button" onClick={pickSample}>
              <Sparkles size={14} /> {t("studio.excel.loadSample")}
            </button>
          </div>
          <textarea className="textarea" placeholder={t("studio.excel.csvPlaceholder")} value={csv} onChange={(event) => setCsv(event.target.value)} />
          <button className="btn btn-sm btn-block mt-2" type="button" onClick={applyCsv} disabled={!csv.trim()}>
            {t("studio.excel.parseCsv")}
          </button>
          <div className="hint mt-2">{t("studio.excel.csvHint")}</div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.excel.dataTitle", { count: rows.length })}</div>
            <button className="btn btn-sm" type="button" onClick={() => setRows((list) => [...list, newRow(columns.length)])}>
              <Plus size={14} /> {t("studio.excel.addRow")}
            </button>
          </div>
          {columns.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th className="row-index">{t("studio.data.rowIndex")}</th>
                    {columns.map((column, index) => (
                      <th key={`head-${index}`}>{column || t("studio.excel.defaultColumn", { index: index + 1 })}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id}>
                      <td className="row-index faint">{rowIndex + 1}</td>
                      {columns.map((_, index) => (
                        <td key={`${row.id}-${index}`}>
                          <input className="input input-mono grid-input" value={String(row.cells[index] ?? "")} onChange={(event) => setCell(row.id, index, event.target.value)} />
                        </td>
                      ))}
                      <td>
                        <button
                          className="btn btn-sm btn-icon btn-danger"
                          type="button"
                          title={t("studio.excel.removeRow")}
                          disabled={rows.length <= 1}
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="hint">{t("studio.excel.needColumn")}</div>
          )}
          <div className="hint mt-2">{t("studio.excel.gridHint")}</div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <div className="card-title">{t("studio.excel.generateTitle")}</div>
              <div className="card-desc">{t("studio.excel.generateDesc")}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={generate} disabled={sending}>
            {sending ? <Spinner label={t("studio.excel.generating")} /> : <><FileDown size={16} /> {t("studio.excel.generate")}</>}
          </button>
          {sending && <div className="hint mt-2">{t("studio.excel.generatingHint")}</div>}
          {onOpenChat && (
            <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>{t("studio.action.openChat")}</button>
          )}
          <div className="hint mt-2">{t("studio.ppt.chatHint")}</div>
        </div>

        {excelFiles.length > 0 && (
          <div className="card">
            <div className="card-title mb-2">{t("studio.excel.files")}</div>
            {excelFiles.map((file) => (
              <div className="artifact-card" key={file.id}>
                <div className="artifact-icon">XLS</div>
                <div className="grow">
                  <div className="truncate bold small">{file.name}</div>
                  <div className="tiny faint">{file.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}</div>
                </div>
                <button className="btn btn-sm btn-primary" type="button" onClick={() => void downloadFileFromApi(file.id, file.name)}>
                  <FileDown size={14} /> {t("studio.action.download")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
