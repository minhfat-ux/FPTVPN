import type { AnalysisPayload, Message, ToolResult } from "../types";

export type OpKind = "describe" | "value_counts" | "group_by" | "timeseries" | "correlation" | "top" | "filter";

export interface Metric {
  column: string;
  agg: string;
}

export interface OperationRow {
  id: string;
  op: OpKind;
  column: string;
  columns: string[];
  metrics: Metric[];
  dateColumn: string;
  valueColumn: string;
  granularity: string;
  agg: string;
  n: number;
  labelColumn: string;
  value: string;
  filterOp: string;
}

export const OPS: { id: OpKind; label: string }[] = [
  { id: "describe", label: "Mô tả cột (describe)" },
  { id: "value_counts", label: "Đếm giá trị (value_counts)" },
  { id: "group_by", label: "Nhóm & tổng hợp (group_by)" },
  { id: "timeseries", label: "Chuỗi thời gian (timeseries)" },
  { id: "correlation", label: "Tương quan (correlation)" },
  { id: "top", label: "Top giá trị (top)" },
  { id: "filter", label: "Lọc dòng (filter)" },
];

export const AGGS = ["sum", "avg", "count", "min", "max", "median", "std", "distinct"];
export const FILTER_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains"];
export const MAX_ROWS = 50;

export function newOperation(): OperationRow {
  return {
    id: `op_${Math.random().toString(36).slice(2)}`,
    op: "describe",
    column: "",
    columns: [],
    metrics: [],
    dateColumn: "",
    valueColumn: "",
    granularity: "month",
    agg: "sum",
    n: 10,
    labelColumn: "",
    value: "",
    filterOp: "eq",
  };
}

/** Chuyển một thao tác trong giao diện thành tham số cho tool `analyze_data`. */
export function buildPayload(operation: OperationRow): Record<string, unknown> {
  switch (operation.op) {
    case "value_counts":
      return { op: operation.op, column: operation.column };
    case "group_by":
      return {
        op: operation.op,
        by: operation.columns,
        metrics: operation.metrics.filter((metric) => metric.column).map((metric) => ({ column: metric.column, agg: metric.agg })),
      };
    case "timeseries":
      return {
        op: operation.op,
        dateColumn: operation.dateColumn,
        valueColumn: operation.valueColumn,
        granularity: operation.granularity,
        agg: operation.agg,
      };
    case "correlation":
      return { op: operation.op, columns: operation.columns };
    case "top":
      return { op: operation.op, column: operation.column, n: operation.n, labelColumn: operation.labelColumn || undefined };
    case "filter":
      return { op: "filter", column: operation.column, op_filter: operation.filterOp, value: operation.value };
    default:
      return { op: "describe" };
  }
}

/** Lấy kết quả `analyze_data` mới nhất từ lượt chat đang chạy hoặc từ lịch sử tin nhắn. */
export function newestAnalysis(streamingResults: ToolResult[] | undefined, messages: Message[]): AnalysisPayload | null {
  for (let i = (streamingResults ?? []).length - 1; i >= 0; i -= 1) {
    const result = streamingResults![i];
    if (result?.name === "analyze_data" && result.ok && result.data) return result.data as unknown as AnalysisPayload;
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const list = messages[i]?.toolResults ?? [];
    for (let j = list.length - 1; j >= 0; j -= 1) {
      const result = list[j];
      if (result?.name === "analyze_data" && result.ok && result.data) return result.data as unknown as AnalysisPayload;
    }
  }
  return null;
}
