import { Plus, Trash2 } from "lucide-react";
import { Field } from "../components/ui";
import { useI18n } from "../i18n";
import { AGGS, FILTER_OPS, OPS, type Metric, type OperationRow, type OpKind } from "./dataOps";

/** Bộ chọn nhiều cột dạng chip, kèm ô nhập tay khi chưa biết tên cột. */
export function ColumnPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="field">
      <span className="label">{label}</span>
      {options.length ? (
        <div className="row row-wrap gap-1">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`chip ${value.includes(option) ? "active" : ""}`}
              onClick={() => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <span className="hint">{t("studio.data.unknownColumns")}</span>
      )}
      <input
        className="input input-mono mt-1"
        placeholder={t("studio.data.columnsPlaceholder")}
        value={value.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

/** Chọn một cột: dropdown (nếu đã biết) hoặc nhập tay. */
export function ColumnSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={label}>
      <div className="stack gap-1">
        <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t("studio.data.pickColumn")}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {value && !options.includes(value) && <option value={value}>{value}</option>}
        </select>
        <input
          className="input input-mono"
          placeholder={t("studio.data.orTypeColumn")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  );
}

/** Danh sách thao tác phân tích (bước 2 của Data Lab). */
export function DataOpsStep({
  operations,
  columns,
  onPatch,
  onAdd,
  onRemove,
  onMove,
}: {
  operations: OperationRow[];
  columns: string[];
  onPatch: (id: string, next: Partial<OperationRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (index: number, delta: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="row gap-2 mb-2">
        <div className="card-title grow">{t("studio.data.step2", { count: operations.length })}</div>
        <button className="btn btn-sm btn-primary" type="button" onClick={onAdd}>
          <Plus size={14} /> {t("studio.data.addOp")}
        </button>
      </div>

      <div className="stack gap-2">
        {operations.map((operation, index) => (
          <div className="op-card" key={operation.id}>
            <div className="row gap-2 mb-2">
              <span className="badge badge-accent">#{index + 1}</span>
              <select
                className="select grow"
                value={operation.op}
                onChange={(event) => onPatch(operation.id, { op: event.target.value as OpKind })}
              >
                {OPS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.labelKey)}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-icon" type="button" title={t("studio.data.moveUp")} disabled={index === 0} onClick={() => onMove(index, -1)}>
                ↑
              </button>
              <button
                className="btn btn-sm btn-icon"
                type="button"
                title={t("studio.data.moveDown")}
                disabled={index === operations.length - 1}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
              <button
                className="btn btn-sm btn-icon btn-danger"
                type="button"
                title={t("studio.data.removeOp")}
                disabled={operations.length <= 1}
                onClick={() => onRemove(operation.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {operation.op === "value_counts" && (
              <ColumnSelect
                label={t("studio.data.opCountColumn")}
                options={columns}
                value={operation.column}
                onChange={(value) => onPatch(operation.id, { column: value })}
              />
            )}

            {operation.op === "group_by" && (
              <>
                <ColumnPicker
                  label={t("studio.data.opGroupBy")}
                  options={columns}
                  value={operation.columns}
                  onChange={(next) => onPatch(operation.id, { columns: next })}
                />
                <div className="field">
                  <span className="label">{t("studio.data.opMetrics")}</span>
                  <div className="stack gap-1">
                    {operation.metrics.map((metric: Metric, metricIndex: number) => (
                      <div className="row gap-2" key={`m-${metricIndex}`}>
                        <input
                          className="input grow"
                          placeholder={t("studio.data.metricColumn")}
                          value={metric.column}
                          onChange={(event) =>
                            onPatch(operation.id, {
                              metrics: operation.metrics.map((item, i) => (i === metricIndex ? { ...item, column: event.target.value } : item)),
                            })
                          }
                        />
                        <select
                          className="select"
                          value={metric.agg}
                          onChange={(event) =>
                            onPatch(operation.id, {
                              metrics: operation.metrics.map((item, i) => (i === metricIndex ? { ...item, agg: event.target.value } : item)),
                            })
                          }
                        >
                          {AGGS.map((agg) => (
                            <option key={agg} value={agg}>
                              {agg}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-sm btn-icon btn-danger"
                          type="button"
                          title={t("studio.data.removeMetric")}
                          onClick={() => onPatch(operation.id, { metrics: operation.metrics.filter((_, i) => i !== metricIndex) })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button className="btn btn-sm" type="button" onClick={() => onPatch(operation.id, { metrics: [...operation.metrics, { column: "", agg: "sum" }] })}>
                      <Plus size={14} /> {t("studio.data.addMetric")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {operation.op === "timeseries" && (
              <div className="grid grid-2">
                <ColumnSelect
                  label={t("studio.data.opDateColumn")}
                  options={columns}
                  value={operation.dateColumn}
                  onChange={(value) => onPatch(operation.id, { dateColumn: value })}
                />
                <ColumnSelect
                  label={t("studio.data.opValueColumn")}
                  options={columns}
                  value={operation.valueColumn}
                  onChange={(value) => onPatch(operation.id, { valueColumn: value })}
                />
                <Field label={t("studio.data.opGranularity")}>
                  <select className="select" value={operation.granularity} onChange={(event) => onPatch(operation.id, { granularity: event.target.value })}>
                    {["day", "week", "month", "year"].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("studio.data.opAgg")}>
                  <select className="select" value={operation.agg} onChange={(event) => onPatch(operation.id, { agg: event.target.value })}>
                    {AGGS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {operation.op === "correlation" && (
              <ColumnPicker
                label={t("studio.data.opCorrelation")}
                options={columns}
                value={operation.columns}
                onChange={(next) => onPatch(operation.id, { columns: next })}
              />
            )}

            {operation.op === "top" && (
              <div className="grid grid-2">
                <ColumnSelect
                  label={t("studio.data.opRankColumn")}
                  options={columns}
                  value={operation.column}
                  onChange={(value) => onPatch(operation.id, { column: value })}
                />
                <ColumnSelect
                  label={t("studio.data.opLabelColumn")}
                  options={columns}
                  value={operation.labelColumn}
                  onChange={(value) => onPatch(operation.id, { labelColumn: value })}
                />
                <Field label={t("studio.data.opRowCount")}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={operation.n}
                    onChange={(event) => onPatch(operation.id, { n: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </Field>
              </div>
            )}

            {operation.op === "filter" && (
              <div className="grid grid-2">
                <ColumnSelect
                  label={t("studio.data.opFilterColumn")}
                  options={columns}
                  value={operation.column}
                  onChange={(value) => onPatch(operation.id, { column: value })}
                />
                <Field label={t("studio.data.opCondition")}>
                  <select className="select" value={operation.filterOp} onChange={(event) => onPatch(operation.id, { filterOp: event.target.value })}>
                    {FILTER_OPS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("studio.data.opFilterValue")}>
                  <input className="input" value={operation.value} onChange={(event) => onPatch(operation.id, { value: event.target.value })} />
                </Field>
              </div>
            )}

            {operation.op === "describe" && <div className="hint">{t("studio.data.describeHint")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
