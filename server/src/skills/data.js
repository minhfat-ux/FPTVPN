import ExcelJS from "exceljs";
import { getOwnedFile, readFileBuffer } from "../files.js";
import { badRequest } from "../util.js";

const MAX_ROWS = 50000;
const MAX_TABLE_ROWS = 50;

// ------------------------------------------------------------------ parsing

/** RFC4180-ish delimited parser (handles quotes, embedded newlines, CRLF). */
export function parseDelimited(text, delimiter = null) {
  const clean = String(text).replace(/^\uFEFF/, "");
  const delim = delimiter ?? detectDelimiter(clean);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delim) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // handled by \n
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
  if (!nonEmpty.length) return { columns: [], rows: [] };
  const header = nonEmpty[0].map((cell, index) => String(cell).trim() || `Cột ${index + 1}`);
  const body = nonEmpty.slice(1, MAX_ROWS + 1).map((cells) => {
    const out = [];
    for (let i = 0; i < header.length; i += 1) out.push(coerce(cells[i]));
    return out;
  });
  return { columns: header, rows: body, truncated: nonEmpty.length - 1 > MAX_ROWS };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** Numbers stay numbers, booleans become booleans, "" becomes null. */
export function coerce(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  // Thousands separators: 1.234.567 (vi) / 1,234,567 (en).
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(text)) {
    const n = Number(text.replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(n)) return n;
  }
  // Decimal comma: "1,5" means 1.5 in Vietnamese data.
  if (/^-?\d+,\d{1,2}$/.test(text)) {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(text)) {
    const time = Date.parse(text);
    if (Number.isFinite(time)) return new Date(time);
  }
  return text;
}

export async function loadTable(fileRow) {
  const ext = String(fileRow.name).toLowerCase();
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".xlsm")) {
    const { buffer } = await readFileBuffer(fileRow);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest("Tệp Excel không có sheet nào");
    const sheetRows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      sheetRows.push(row.values.slice(1).map((v) => normalizeExcelValue(v)));
    });
    const [header, ...body] = sheetRows;
    return {
      columns: (header ?? []).map((c, i) => String(c ?? `Cột ${i + 1}`)),
      rows: body.slice(0, MAX_ROWS),
      sheetName: sheet.name,
      truncated: body.length > MAX_ROWS,
    };
  }
  if (ext.endsWith(".json")) {
    const { buffer } = await readFileBuffer(fileRow);
    const parsed = JSON.parse(buffer.toString("utf8"));
    const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [parsed];
    const columns = [...new Set(records.flatMap((r) => Object.keys(r ?? {})))];
    return { columns, rows: records.slice(0, MAX_ROWS).map((r) => columns.map((c) => coerce(r?.[c]))) };
  }
  const { buffer } = await readFileBuffer(fileRow);
  const text = buffer.toString("utf8");
  const delimiter = ext.endsWith(".tsv") ? "\t" : null;
  return parseDelimited(text, delimiter);
}

function normalizeExcelValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((r) => r.text).join("");
    if (value.text !== undefined) return value.text;
    if (value.result !== undefined) return value.result;
    if (value.hyperlink) return value.text ?? value.hyperlink;
    return JSON.stringify(value);
  }
  return value;
}

// -------------------------------------------------------------------- stats

const numeric = (values) => values.filter((v) => typeof v === "number" && Number.isFinite(v));

export function mean(values) {
  const nums = numeric(values);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function median(values) {
  const nums = numeric(values).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function stddev(values) {
  const nums = numeric(values);
  if (nums.length < 2) return null;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((acc, v) => acc + (v - m) ** 2, 0) / (nums.length - 1));
}

export function quantile(values, q) {
  const nums = numeric(values).sort((a, b) => a - b);
  if (!nums.length) return null;
  const pos = (nums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return nums[base + 1] !== undefined ? nums[base] + rest * (nums[base + 1] - nums[base]) : nums[base];
}

function round(value, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function inferType(values) {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (!present.length) return "empty";
  const dates = present.filter((v) => v instanceof Date).length;
  const nums = present.filter((v) => typeof v === "number").length;
  const bools = present.filter((v) => typeof v === "boolean").length;
  if (dates / present.length > 0.8) return "date";
  if (nums / present.length > 0.8) return "number";
  if (bools / present.length > 0.8) return "boolean";
  return "string";
}

function columnValues(table, column) {
  const index = table.columns.indexOf(column);
  if (index === -1) {
    const fuzzy = table.columns.findIndex((c) => c.toLowerCase() === String(column).toLowerCase());
    if (fuzzy === -1) throw badRequest(`Không có cột "${column}". Các cột: ${table.columns.join(", ")}`);
    return table.rows.map((row) => row[fuzzy]);
  }
  return table.rows.map((row) => row[index]);
}

function columnIndex(table, column) {
  const index = table.columns.findIndex((c) => c.toLowerCase() === String(column).toLowerCase());
  if (index === -1) throw badRequest(`Không có cột "${column}". Các cột: ${table.columns.join(", ")}`);
  return index;
}

// ---------------------------------------------------------------- operations

function describeTable(table) {
  const rows = table.columns.map((column) => {
    const values = columnValues(table, column);
    const present = values.filter((v) => v !== null && v !== undefined);
    const type = inferType(values);
    const base = {
      column,
      type,
      count: present.length,
      missing: values.length - present.length,
      unique: new Set(present.map((v) => (v instanceof Date ? v.toISOString() : v))).size,
    };
    if (type === "number") {
      Object.assign(base, {
        min: round(Math.min(...numeric(values))),
        max: round(Math.max(...numeric(values))),
        mean: round(mean(values)),
        median: round(median(values)),
        std: round(stddev(values)),
        sum: round(numeric(values).reduce((a, b) => a + b, 0)),
      });
    }
    if (type === "string") {
      const counts = new Map();
      for (const value of present) counts.set(value, (counts.get(value) ?? 0) + 1);
      base.top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([value, count]) => ({ value, count }));
    }
    return base;
  });

  const summary = rows
    .map((r) => {
      if (r.type === "number") return `${r.column} (số): min ${r.min}, max ${r.max}, TB ${r.mean}, tổng ${r.sum}`;
      return `${r.column} (${r.type}): ${r.count} giá trị, ${r.unique} khác nhau`;
    })
    .join("\n");

  return {
    tables: [{ name: "Mô tả cột", columns: ["Cột", "Kiểu", "Đếm", "Thiếu", "Khác nhau", "Min", "Max", "TB", "Tổng"], rows: rows.map((r) => [r.column, r.type, r.count, r.missing, r.unique, r.min ?? "", r.max ?? "", r.mean ?? "", r.sum ?? ""]) }],
    detail: rows,
    summary,
  };
}

const AGGREGATES = {
  sum: (values) => round(numeric(values).reduce((a, b) => a + b, 0)),
  avg: (values) => round(mean(values)),
  mean: (values) => round(mean(values)),
  count: (values) => values.filter((v) => v !== null && v !== undefined).length,
  min: (values) => (numeric(values).length ? round(Math.min(...numeric(values))) : null),
  max: (values) => (numeric(values).length ? round(Math.max(...numeric(values))) : null),
  median: (values) => round(median(values)),
  std: (values) => round(stddev(values)),
  distinct: (values) => new Set(values.filter((v) => v !== null).map(String)).size,
};

export function groupBy(table, { by, metrics = [] }) {
  const byColumns = Array.isArray(by) ? by : [by];
  const byIndexes = byColumns.map((c) => columnIndex(table, c));
  const metricSpecs = metrics.length
    ? metrics.map((m) => ({ column: m.column, agg: String(m.agg ?? "sum").toLowerCase(), as: m.as }))
    : [{ column: null, agg: "count", as: "Số dòng" }];

  for (const spec of metricSpecs) {
    if (spec.column) columnIndex(table, spec.column);
    if (!AGGREGATES[spec.agg]) {
      throw badRequest(`Phép tổng hợp không hỗ trợ: ${spec.agg}. Dùng: ${Object.keys(AGGREGATES).join(", ")}`);
    }
  }

  const groups = new Map();
  for (const row of table.rows) {
    const key = byIndexes.map((i) => formatCell(row[i])).join(" | ");
    if (!groups.has(key)) groups.set(key, { key, values: byIndexes.map((i) => row[i]), rows: [] });
    groups.get(key).rows.push(row);
  }

  const results = [...groups.values()].map((group) => ({
    values: group.values,
    metrics: metricSpecs.map((spec) => {
      const values = spec.column ? group.rows.map((r) => r[columnIndex(table, spec.column)]) : group.rows.map(() => 1);
      return AGGREGATES[spec.agg](values);
    }),
    count: group.rows.length,
  }));

  const metricLabels = metricSpecs.map(
    (spec) => spec.as ?? `${spec.agg}${spec.column ? ` ${spec.column}` : ""}`,
  );
  results.sort((a, b) => {
    const ai = metricLabels.findIndex((_, i) => typeof a.metrics[i] === "number");
    return ai === -1 ? b.count - a.count : (b.metrics[ai] ?? 0) - (a.metrics[ai] ?? 0);
  });

  return {
    seriesName: metricLabels[0] ?? "Số dòng",
    columns: [...byColumns, ...metricLabels],
    rows: results.slice(0, 500).map((r) => [...r.values.map(formatCell), ...r.metrics]),
    totalGroups: results.length,
  };
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return round(value, 4);
  return String(value);
}

function applyFilter(table, { column, op = "eq", value }) {
  const index = columnIndex(table, column);
  const target = coerce(value);
  const test = (cell) => {
    switch (op) {
      case "eq": return String(cell) === String(target);
      case "ne": return String(cell) !== String(target);
      case "gt": return Number(cell) > Number(target);
      case "gte": return Number(cell) >= Number(target);
      case "lt": return Number(cell) < Number(target);
      case "lte": return Number(cell) <= Number(target);
      case "contains": return String(cell ?? "").toLowerCase().includes(String(value).toLowerCase());
      case "not_contains": return !String(cell ?? "").toLowerCase().includes(String(value).toLowerCase());
      case "in": return String(value).split(",").map((s) => s.trim()).includes(String(cell));
      case "is_null": return cell === null || cell === undefined || cell === "";
      case "not_null": return !(cell === null || cell === undefined || cell === "");
      default: throw badRequest(`Toán tử lọc không hỗ trợ: ${op}`);
    }
  };
  return table.rows.filter((row) => test(row[index]));
}

function sortRows(table, { column, desc = true, limit = MAX_TABLE_ROWS }) {
  const index = columnIndex(table, column);
  const sorted = [...table.rows].sort((a, b) => {
    const x = a[index];
    const y = b[index];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi");
    return desc ? -cmp : cmp;
  });
  return sorted.slice(0, Math.min(limit ?? MAX_TABLE_ROWS, 500));
}

function correlation(table, { columns }) {
  const cols = Array.isArray(columns) && columns.length >= 2 ? columns : table.columns.filter((c) => inferType(columnValues(table, c)) === "number").slice(0, 6);
  if (cols.length < 2) throw badRequest("Cần ít nhất 2 cột số để tính tương quan");
  const vectors = cols.map((c) => columnValues(table, c));
  const rows = [];
  for (let i = 0; i < cols.length; i += 1) {
    const line = [cols[i]];
    for (let j = 0; j < cols.length; j += 1) {
      line.push(round(pearson(vectors[i], vectors[j]), 3));
    }
    rows.push(line);
  }
  return { columns: ["", ...cols], rows, note: "Hệ số Pearson (-1 … 1)" };
}

export function pearson(a, b) {
  const pairs = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (typeof a[i] === "number" && typeof b[i] === "number" && Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      pairs.push([a[i], b[i]]);
    }
  }
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

function timeseries(table, { dateColumn, valueColumn, granularity = "month", agg = "sum" }) {
  const dateIndex = columnIndex(table, dateColumn);
  const valueIndex = columnIndex(table, valueColumn);
  const buckets = new Map();
  for (const row of table.rows) {
    const raw = row[dateIndex];
    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(date.getTime())) continue;
    let key;
    if (granularity === "day") key = date.toISOString().slice(0, 10);
    else if (granularity === "week") {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - day + 1);
      key = d.toISOString().slice(0, 10);
    } else if (granularity === "year") key = String(date.getUTCFullYear());
    else key = date.toISOString().slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row[valueIndex]);
  }
  const entries = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fn = AGGREGATES[String(agg).toLowerCase()] ?? AGGREGATES.sum;
  return {
    columns: ["Kỳ", `${agg} ${valueColumn}`],
    rows: entries.map(([key, values]) => [key, fn(values)]),
    points: entries.map(([key, values]) => ({ x: key, y: fn(values) })),
  };
}

function valueCounts(table, { column, limit = 20 }) {
  const values = columnValues(table, column);
  const counts = new Map();
  for (const value of values) {
    const key = formatCell(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(limit, 100));
  return {
    columns: [column, "Số dòng", "Tỷ lệ %"],
    rows: entries.map(([key, count]) => [key, count, round((count / values.length) * 100, 2)]),
    points: entries.map(([key, count]) => ({ x: key, y: count })),
  };
}

// ------------------------------------------------------------------ tool API

/**
 * Runs a list of analysis operations over an uploaded CSV/Excel/JSON file and
 * returns tables + a chart spec the web renders client-side.
 */
export async function analyzeData(args, ctx) {
  const fileId = args?.fileId;
  if (!fileId) throw badRequest("analyze_data cần `fileId` của tệp CSV/Excel đã tải lên");
  const fileRow = getOwnedFile(fileId, ctx.userId);
  const table = await loadTable(fileRow);
  if (!table.columns.length) throw badRequest("Không đọc được cột nào từ tệp");

  const operations = Array.isArray(args?.operations) && args.operations.length ? args.operations : [{ op: "describe" }];
  const tables = [];
  const notes = [];
  let chart = null;

  for (const operation of operations.slice(0, 10)) {
    const op = String(operation?.op ?? "describe").toLowerCase();
    switch (op) {
      case "describe": {
        const result = describeTable(table);
        tables.push(...result.tables);
        notes.push(result.summary);
        break;
      }
      case "value_counts": {
        const result = valueCounts(table, operation);
        tables.push({ name: `Đếm giá trị — ${operation.column}`, ...result });
        chart = chart ?? { type: "bar", title: `Phân bố ${operation.column}`, xLabel: operation.column, yLabel: "Số dòng", series: [{ name: "Số dòng", points: result.points }] };
        break;
      }
      case "group_by": {
        const result = groupBy(table, operation);
        tables.push({ name: `Nhóm theo ${[].concat(operation.by).join(", ")}`, columns: result.columns, rows: result.rows });
        notes.push(`Nhóm theo ${[].concat(operation.by).join(", ")}: ${result.totalGroups} nhóm`);
        chart = {
          type: operation.chartType ?? "bar",
          title: `${result.seriesName} theo ${[].concat(operation.by).join(", ")}`,
          xLabel: [].concat(operation.by).join(", "),
          yLabel: result.seriesName,
          series: [{ name: result.seriesName, points: result.rows.slice(0, 30).map((row) => ({ x: String(row[0]), y: row[row.length - 1] })) }],
        };
        break;
      }
      case "timeseries": {
        const result = timeseries(table, operation);
        tables.push({ name: `Chuỗi thời gian — ${operation.valueColumn}`, columns: result.columns, rows: result.rows });
        chart = {
          type: "line",
          title: `${operation.valueColumn} theo ${operation.granularity ?? "month"}`,
          xLabel: "Kỳ",
          yLabel: operation.valueColumn,
          series: [{ name: operation.valueColumn, points: result.points }],
        };
        break;
      }
      case "correlation": {
        const result = correlation(table, operation);
        tables.push({ name: "Tương quan", columns: result.columns, rows: result.rows, note: result.note });
        break;
      }
      case "sort": {
        const rowsResult = sortRows(table, operation);
        tables.push({
          name: `Sắp xếp theo ${operation.column}`,
          columns: table.columns,
          rows: rowsResult.map((row) => row.map(formatCell)),
        });
        break;
      }
      case "filter": {
        const rowsResult = applyFilter(table, operation);
        tables.push({
          name: `Lọc ${operation.column} ${operation.op ?? "eq"} ${operation.value}`,
          columns: table.columns,
          rows: rowsResult.slice(0, MAX_TABLE_ROWS).map((row) => row.map(formatCell)),
        });
        notes.push(`Lọc ${operation.column} ${operation.op ?? "eq"} ${operation.value}: ${rowsResult.length}/${table.rows.length} dòng`);
        break;
      }
      case "top": {
        const rowsResult = sortRows(table, { column: operation.column, desc: true, limit: operation.n ?? 10 });
        tables.push({
          name: `Top ${operation.n ?? 10} theo ${operation.column}`,
          columns: table.columns,
          rows: rowsResult.map((row) => row.map(formatCell)),
        });
        chart = {
          type: "bar",
          title: `Top ${operation.n ?? 10} theo ${operation.column}`,
          xLabel: String(operation.labelColumn ?? table.columns[0]),
          yLabel: operation.column,
          series: [{
            name: operation.column,
            points: rowsResult.slice(0, 30).map((row) => ({
              x: String(row[table.columns.indexOf(operation.labelColumn ?? table.columns[0])] ?? ""),
              y: Number(row[columnIndex(table, operation.column)]) || 0,
            })),
          }],
        };
        break;
      }
      default:
        throw badRequest(`Thao tác không hỗ trợ: ${op}`);
    }
  }

  const payload = {
    file: { id: fileRow.id, name: fileRow.name },
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    truncated: Boolean(table.truncated),
    columns: table.columns,
    tables,
    chart,
    notes,
  };

  const preview = tables[0]
    ? `Bảng "${tables[0].name}" (${tables[0].rows.length} dòng):\n` +
      [tables[0].columns.join(" | "), ...tables[0].rows.slice(0, 12).map((r) => r.join(" | "))].join("\n")
    : "";

  return {
    ok: true,
    summary: `Đã phân tích ${table.rows.length} dòng × ${table.columns.length} cột của ${fileRow.name}`,
    data: payload,
    artifacts: [],
    modelText: [
      `Tệp: ${fileRow.name} — ${table.rows.length} dòng, ${table.columns.length} cột.`,
      notes.join("\n"),
      preview,
      chart ? `Biểu đồ đã tạo: ${chart.type} — ${chart.title}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** `list_files` tool — lets the model discover uploaded file ids. */
export function listFilesForModel(_args, ctx) {
  const files = ctx.files ?? [];
  return {
    ok: true,
    summary: `${files.length} tệp của người dùng`,
    data: { files },
    artifacts: [],
    modelText: files.length
      ? files.map((f) => `- ${f.name} (id: ${f.id}, kind: ${f.kind}, ${f.size} bytes)`).join("\n")
      : "Người dùng chưa tải tệp nào lên trong hội thoại này.",
  };
}
