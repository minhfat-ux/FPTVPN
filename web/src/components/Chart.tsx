import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "../types";
import { EmptyState } from "./ui";

/**
 * Bảng màu series theo palette FlowTech Harness (navy + xanh lá).
 * Chỉ dùng cho nét/ô của biểu đồ — mọi màu giao diện khác lấy từ `var(--…)`.
 */
const PALETTE = ["#33C773", "#3DD982", "#1E6BE0", "#6D5CE7", "#A855F7", "#E0A63C", "#F25A5A"];

const TICK = { fill: "var(--text-muted)", fontSize: 12 } as const;
const AXIS_STROKE = "var(--border-strong)";
const GRID = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;

function formatValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("vi-VN");
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Gộp điểm của mọi series theo trục x thành các dòng `{ x, [tên series]: y }`. */
function mergeSeries(spec: ChartSpec): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  const index = new Map<string, number>();
  for (const series of spec.series ?? []) {
    for (const point of series.points ?? []) {
      const key = String(point.x);
      let at = index.get(key);
      if (at === undefined) {
        at = rows.length;
        index.set(key, at);
        rows.push({ x: point.x });
      }
      rows[at][series.name] = typeof point.y === "number" && Number.isFinite(point.y) ? point.y : 0;
    }
  }
  return rows;
}

/**
 * Biểu đồ dùng chung cho chat và Studio: nhận thẳng `ChartSpec` do backend sinh
 * ra (`analyze_data`) rồi vẽ bằng recharts.
 */
export function Chart({ spec }: { spec: ChartSpec }) {
  const series = spec?.series ?? [];
  const hasData = series.some((item) => (item.points ?? []).length > 0);

  const rows = useMemo(() => mergeSeries(spec), [spec]);
  const scatter = useMemo(
    () =>
      series.map((item) => ({
        name: item.name,
        points: (item.points ?? [])
          .filter((point) => typeof point.x === "number")
          .map((point) => ({ x: Number(point.x), y: Number(point.y) || 0 })),
      })),
    [series],
  );
  const pieData = useMemo(
    () => (series[0]?.points ?? []).map((point) => ({ name: String(point.x), value: Number(point.y) || 0 })),
    [series],
  );

  if (!spec || !hasData) {
    return <EmptyState icon="📊" title="Chưa có dữ liệu biểu đồ" hint="Thêm thao tác phân tích để sinh biểu đồ." />;
  }

  const tooltip = (
    <Tooltip
      formatter={(value: unknown) => formatValue(value)}
      contentStyle={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        color: "var(--text)",
        fontSize: 13,
      }}
      labelStyle={{ color: "var(--text-muted)" }}
    />
  );

  const xAxis = (numeric: boolean) => (
    <XAxis
      dataKey="x"
      type={numeric ? "number" : "category"}
      stroke={AXIS_STROKE}
      tick={TICK}
      height={spec.xLabel ? 46 : 30}
      label={
        spec.xLabel
          ? { value: spec.xLabel, position: "insideBottom", offset: -4, fill: "var(--text-muted)", fontSize: 12 }
          : undefined
      }
    />
  );

  const yAxis = (
    <YAxis
      stroke={AXIS_STROKE}
      tick={TICK}
      width={spec.yLabel ? 78 : 52}
      label={
        spec.yLabel
          ? { value: spec.yLabel, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 12 }
          : undefined
      }
    />
  );

  const legend = <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />;

  return (
    <div className="chart-block">
      {spec.title && <div className="bold mb-2">{spec.title}</div>}
      <ResponsiveContainer width="100%" height={320}>
        {spec.type === "pie" ? (
          <PieChart>
            {tooltip}
            <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} label={(entry: { name?: string }) => String(entry?.name ?? "")}>
              {pieData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
            {legend}
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={rows}>
            <CartesianGrid {...GRID} />
            {xAxis(false)}
            {yAxis}
            {tooltip}
            {legend}
            {series.map((item, index) => (
              <Line
                key={item.name}
                type="monotone"
                dataKey={item.name}
                stroke={PALETTE[index % PALETTE.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        ) : spec.type === "area" ? (
          <AreaChart data={rows}>
            <CartesianGrid {...GRID} />
            {xAxis(false)}
            {yAxis}
            {tooltip}
            {legend}
            {series.map((item, index) => (
              <Area
                key={item.name}
                type="monotone"
                dataKey={item.name}
                stroke={PALETTE[index % PALETTE.length]}
                fill={PALETTE[index % PALETTE.length]}
                fillOpacity={0.28}
                connectNulls
              />
            ))}
          </AreaChart>
        ) : spec.type === "scatter" ? (
          <ScatterChart>
            <CartesianGrid {...GRID} />
            {xAxis(true)}
            {yAxis}
            {tooltip}
            {legend}
            {scatter.map((item, index) => (
              <Scatter key={item.name} name={item.name} data={item.points} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </ScatterChart>
        ) : (
          <BarChart data={rows}>
            <CartesianGrid {...GRID} />
            {xAxis(false)}
            {yAxis}
            {tooltip}
            {legend}
            {series.map((item, index) => (
              <Bar key={item.name} dataKey={item.name} fill={PALETTE[index % PALETTE.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
