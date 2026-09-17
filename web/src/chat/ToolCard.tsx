import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Image as ImageIcon,
  Loader2,
  Presentation,
  ScanText,
  Sheet,
  Table2,
  Wrench,
} from "lucide-react";
import { Chart } from "../components/Chart";
import { useI18n, type TranslateVars } from "../i18n";
import type { ChartSpec, DataTable, ToolCall, ToolResult } from "../types";

/** Translator signature used by the helpers that build display strings. */
type TFn = (key: string, vars?: TranslateVars) => string;

/** i18n keys for the labels of the built-in tools the server can call. */
const BUILTIN_LABEL_KEYS: Record<string, string> = {
  generate_pptx: "chat.tool.generatePptx",
  generate_xlsx: "chat.tool.generateXlsx",
  analyze_data: "chat.tool.analyzeData",
  edit_image: "chat.tool.editImage",
  list_files: "chat.tool.listFiles",
  open_image_studio: "chat.tool.openImageStudio",
  read_image: "chat.tool.readImage",
  xlsx_from_image: "chat.tool.xlsxFromImage",
};

const BUILTIN_ICONS: Record<string, JSX.Element> = {
  generate_pptx: <Presentation size={15} />,
  generate_xlsx: <Sheet size={15} />,
  analyze_data: <Table2 size={15} />,
  edit_image: <ImageIcon size={15} />,
  list_files: <FileSearch size={15} />,
  open_image_studio: <ImageIcon size={15} />,
  read_image: <ScanText size={15} />,
  xlsx_from_image: <Sheet size={15} />,
};

export function toolTitle(call: ToolCall, t: TFn): string {
  if (call.name.startsWith("mcp__")) {
    const parts = call.name.split("__");
    const server = call.serverId ?? parts[1] ?? "server";
    const tool = parts.slice(2).join("__") || parts[1] || call.name;
    return `MCP · ${server} · ${tool}`;
  }
  const key = BUILTIN_LABEL_KEYS[call.name];
  return key ? t(key) : call.name;
}

export function toolIcon(call: ToolCall): JSX.Element {
  if (call.name.startsWith("mcp__")) return <Wrench size={15} />;
  return BUILTIN_ICONS[call.name] ?? <Wrench size={15} />;
}

export function formatDuration(ms: number, t: TFn, n: (value: number) => string): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return t("chat.tool.durationMs", { value: n(Math.round(ms)) });
  if (ms < 60_000) return t("chat.tool.durationSec", { value: (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) });
  return t("chat.tool.durationMinutes", {
    minutes: n(Math.floor(ms / 60_000)),
    seconds: n(Math.round((ms % 60_000) / 1000)),
  });
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTables(data: Record<string, unknown>): DataTable[] {
  const direct = data.tables;
  if (Array.isArray(direct)) return direct.filter(isTable);
  const nested = data.analysis;
  if (isRecord(nested) && Array.isArray(nested.tables)) return nested.tables.filter(isTable);
  return [];
}

function isTable(value: unknown): value is DataTable {
  return isRecord(value) && Array.isArray(value.columns) && Array.isArray(value.rows);
}

function readChart(data: Record<string, unknown>): ChartSpec | null {
  if (isRecord(data.chart) && Array.isArray((data.chart as unknown as ChartSpec).series)) {
    return data.chart as unknown as ChartSpec;
  }
  const nested = data.analysis;
  if (isRecord(nested) && isRecord(nested.chart) && Array.isArray((nested.chart as unknown as ChartSpec).series)) {
    return nested.chart as unknown as ChartSpec;
  }
  return null;
}

function cellText(value: string | number | boolean | null, t: TFn): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  return String(value);
}

export function DataTableView({ table }: { table: DataTable }) {
  const { t, n } = useI18n();
  const columns = table.columns ?? [];
  const note = typeof table.note === "string" ? table.note : undefined;

  return (
    <figure className="data-table">
      {table.name && <figcaption className="tiny faint">{table.name}</figcaption>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-${index}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table.rows ?? []).slice(0, 200).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {(row ?? []).map((cell, cellIndex) => (
                  <td key={cellIndex}>{cellText(cell, t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <div className="tiny faint mt-1">{note}</div>}
      {(table.rows?.length ?? 0) > 200 && (
        <div className="tiny faint mt-1">{t("chat.tool.rowsLimited", { shown: n(200), total: n(table.rows.length) })}</div>
      )}
    </figure>
  );
}

export function ToolCard({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const { t, n } = useI18n();
  const [open, setOpen] = useState(false);
  const status = !result ? "running" : result.ok ? "done" : "error";
  const tone = status === "running" ? "badge-accent" : status === "done" ? "badge-ok" : "badge-err";
  const duration = formatDuration(result?.durationMs ?? 0, t, n);
  const tables = result ? readTables(result.data ?? {}) : [];
  const chart = result ? readChart(result.data ?? {}) : null;
  const args = prettyJson(call.args ?? {});

  return (
    <div className="tool-card">
      <button
        className="tool-card-head"
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="tool-icon">{toolIcon(call)}</span>
        <span className="grow truncate">{toolTitle(call, t)}</span>
        {duration && <span className="tiny faint nowrap">{duration}</span>}
        <span className={`badge ${tone}`}>
          {status === "running" && <Loader2 size={11} className="spin" />}
          {status === "done" && <Check size={11} />}
          {status === "error" && <AlertTriangle size={11} />}
          {status === "running" ? t("chat.tool.status.running") : status === "done" ? t("chat.tool.status.done") : t("chat.tool.status.error")}
        </span>
      </button>

      {open && (
        <div className="tool-card-body">
          {result?.summary && <div className="small">{result.summary}</div>}
          {result?.error && <div className="small error-text">{result.error}</div>}
          {Object.keys(call.args ?? {}).length > 0 && (
            <>
              <div className="tiny faint mt-2">{t("chat.tool.args")}</div>
              <pre>{args}</pre>
            </>
          )}
          {tables.map((table, index) => (
            <DataTableView key={`${table.name}-${index}`} table={table} />
          ))}
          {chart && (
            <div className="tool-chart mt-2">
              <Chart spec={chart} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { readTables, readChart };
