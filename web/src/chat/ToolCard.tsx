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
  Sheet,
  Table2,
  Wrench,
} from "lucide-react";
import { Chart } from "../components/Chart";
import type { ChartSpec, DataTable, ToolCall, ToolResult } from "../types";

/** Vietnamese labels for the built-in tools the server can call. */
const BUILTIN_LABELS: Record<string, string> = {
  generate_pptx: "Tạo PowerPoint",
  generate_xlsx: "Tạo Excel",
  analyze_data: "Phân tích dữ liệu",
  edit_image: "Sửa ảnh bằng AI",
  list_files: "Liệt kê tệp",
  open_image_studio: "Mở Image Studio",
};

const BUILTIN_ICONS: Record<string, JSX.Element> = {
  generate_pptx: <Presentation size={15} />,
  generate_xlsx: <Sheet size={15} />,
  analyze_data: <Table2 size={15} />,
  edit_image: <ImageIcon size={15} />,
  list_files: <FileSearch size={15} />,
  open_image_studio: <ImageIcon size={15} />,
};

export function toolTitle(call: ToolCall): string {
  if (call.name.startsWith("mcp__")) {
    const parts = call.name.split("__");
    const server = call.serverId ?? parts[1] ?? "server";
    const tool = parts.slice(2).join("__") || parts[1] || call.name;
    return `MCP · ${server} · ${tool}`;
  }
  return BUILTIN_LABELS[call.name] ?? call.name;
}

export function toolIcon(call: ToolCall): JSX.Element {
  if (call.name.startsWith("mcp__")) return <Wrench size={15} />;
  return BUILTIN_ICONS[call.name] ?? <Wrench size={15} />;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${Math.floor(ms / 60_000)} phút ${Math.round((ms % 60_000) / 1000)} s`;
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

function cellText(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return String(value);
}

export function DataTableView({ table }: { table: DataTable }) {
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
                  <td key={cellIndex}>{cellText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <div className="tiny faint mt-1">{note}</div>}
      {(table.rows?.length ?? 0) > 200 && (
        <div className="tiny faint mt-1">Chỉ hiển thị 200 / {table.rows.length} dòng</div>
      )}
    </figure>
  );
}

export function ToolCard({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const [open, setOpen] = useState(false);
  const status = !result ? "running" : result.ok ? "done" : "error";
  const tone = status === "running" ? "badge-accent" : status === "done" ? "badge-ok" : "badge-err";
  const duration = formatDuration(result?.durationMs ?? 0);
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
        <span className="grow truncate">{toolTitle(call)}</span>
        {duration && <span className="tiny faint nowrap">{duration}</span>}
        <span className={`badge ${tone}`}>
          {status === "running" && <Loader2 size={11} className="spin" />}
          {status === "done" && <Check size={11} />}
          {status === "error" && <AlertTriangle size={11} />}
          {status === "running" ? "Đang chạy" : status === "done" ? "Xong" : "Lỗi"}
        </span>
      </button>

      {open && (
        <div className="tool-card-body">
          {result?.summary && <div className="small">{result.summary}</div>}
          {result?.error && <div className="small error-text">{result.error}</div>}
          {Object.keys(call.args ?? {}).length > 0 && (
            <>
              <div className="tiny faint mt-2">Tham số</div>
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
