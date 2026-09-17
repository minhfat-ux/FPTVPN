import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Artifact } from "../types";
import { Field, Spinner, Switch } from "../components/ui";
import { useChat } from "../state/chat";
import { useToast } from "../state/store";

type Cell = string | number;

interface GridRow {
  id: string;
  cells: Cell[];
}

const SAMPLE = {
  name: "Doanh thu",
  columns: ["Tháng", "Kênh", "Doanh thu", "Chi phí"],
  rows: [
    ["Tháng 1", "Cửa hàng", 420000000, 260000000],
    ["Tháng 1", "Online", 310000000, 150000000],
    ["Tháng 2", "Cửa hàng", 455000000, 268000000],
    ["Tháng 2", "Online", 382000000, 171000000],
    ["Tháng 3", "Cửa hàng", 498000000, 275000000],
    ["Tháng 3", "Online", 431000000, 188000000],
  ] as Cell[][],
};

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
  const { send, sending, streaming, pendingArtifacts } = useChat();
  const { push } = useToast();

  const [fileName, setFileName] = useState("bao-cao-flowgpt");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [columns, setColumns] = useState<string[]>(["Hạng mục", "Số lượng", "Đơn giá"]);
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
      filename: fileName.trim() || "bang-tinh",
      sheets: [
        {
          name: sheetName.trim() || "Sheet1",
          columns: columns.map((column) => column.trim() || "Cột"),
          rows: rows.map((row) => columns.map((_, index) => toCell(String(row.cells[index] ?? "")))),
          totalsRow,
        },
      ],
    }),
    [fileName, sheetName, columns, rows, totalsRow],
  );

  const artifacts: Artifact[] = streaming?.artifacts?.length
    ? streaming.artifacts
    : pendingArtifacts.length
      ? pendingArtifacts
      : produced;
  const excelFiles = artifacts.filter((item) => item.kind === "xlsx" || item.name.endsWith(".xlsx"));

  function setColumnCount(next: number) {
    const width = Math.max(1, next);
    setColumns((list) => {
      const copy = [...list];
      while (copy.length < width) copy.push(`Cột ${copy.length + 1}`);
      return copy.slice(0, width);
    });
    setRows((list) => list.map((row) => ({ ...row, cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? "") })));
  }

  function setCell(rowId: string, index: number, value: string) {
    setRows((list) => list.map((row) => (row.id === rowId ? { ...row, cells: row.cells.map((cell, i) => (i === index ? value : cell)) } : row)));
  }

  function applyCsv() {
    const parsed = parseDelimited(csv);
    if (!parsed.header.length) {
      push("Chưa có nội dung CSV để dán", "error");
      return;
    }
    setColumns(parsed.header);
    setRows(parsed.rows.length ? parsed.rows.map((line) => ({ id: `r_${Math.random().toString(36).slice(2)}`, cells: line })) : [newRow(parsed.header.length)]);
    push(`Đã nạp ${parsed.rows.length} dòng từ CSV`, "success");
  }

  async function generate() {
    if (!payload.sheets[0].columns.length) {
      push("Cần ít nhất một cột", "error");
      return;
    }
    if (!payload.sheets[0].rows.some((row) => row.some((cell) => cell !== ""))) {
      push("Bảng chưa có dữ liệu — hãy nhập hoặc dán CSV", "error");
      return;
    }
    await send({
      content: `Tạo file Excel từ dữ liệu JSON sau, giữ nguyên nội dung:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
      skill: "excel",
    });
    push("Đã gửi bảng dữ liệu — tệp .xlsx sẽ xuất hiện sau khi xử lý xong", "info");
  }

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">Thông tin bảng tính</div>
          <Field label="Tên tệp (không cần .xlsx)">
            <input className="input" value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </Field>
          <Field label="Tên sheet">
            <input className="input" value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
          </Field>
          <Switch checked={totalsRow} onChange={setTotalsRow} label="Thêm dòng TỔNG cho cột số" />
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">Cột ({columns.length})</div>
            <button className="btn btn-sm" type="button" onClick={() => setColumnCount(columns.length + 1)}>
              <Plus size={14} /> Thêm cột
            </button>
            <button className="btn btn-sm btn-danger" type="button" disabled={columns.length <= 1} onClick={() => setColumnCount(columns.length - 1)}>
              <Trash2 size={14} /> Bớt cột
            </button>
          </div>
          <div className="stack gap-2">
            {columns.map((column, index) => (
              <div className="row gap-2" key={`col-${index}`}>
                <span className="badge">{index + 1}</span>
                <input
                  className="input grow"
                  value={column}
                  onChange={(event) => setColumns((list) => list.map((item, i) => (i === index ? event.target.value : item)))}
                />
                <button
                  className="btn btn-sm btn-icon btn-danger"
                  type="button"
                  title="Xoá cột"
                  disabled={columns.length <= 1}
                  onClick={() => {
                    setColumns((list) => list.filter((_, i) => i !== index));
                    setRows((list) => list.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i !== index) })));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">Dán CSV</div>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setFileName("bao-cao-doanh-thu");
                setSheetName(SAMPLE.name);
                setColumns(SAMPLE.columns);
                setRows(SAMPLE.rows.map((line) => ({ id: `r_${Math.random().toString(36).slice(2)}`, cells: [...line] })));
              }}
            >
              <Sparkles size={14} /> Nạp bảng mẫu
            </button>
          </div>
          <textarea
            className="textarea"
            placeholder={"Hạng mục,Số lượng,Đơn giá\nÁo sơ mi,120,250000\nQuần âu,80,420000"}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
          />
          <button className="btn btn-sm btn-block mt-2" type="button" onClick={applyCsv} disabled={!csv.trim()}>
            Phân tích CSV vào bảng
          </button>
          <div className="hint mt-2">Hỗ trợ dấu phẩy, dấu chấm phẩy, tab và trường có dấu nháy kép.</div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">Bảng dữ liệu ({rows.length} dòng)</div>
            <button className="btn btn-sm" type="button" onClick={() => setRows((list) => [...list, newRow(columns.length)])}>
              <Plus size={14} /> Thêm dòng
            </button>
          </div>
          {columns.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th className="row-index">#</th>
                    {columns.map((column, index) => (
                      <th key={`head-${index}`}>{column || `Cột ${index + 1}`}</th>
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
                          <input
                            className="input input-mono grid-input"
                            value={String(row.cells[index] ?? "")}
                            onChange={(event) => setCell(row.id, index, event.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          className="btn btn-sm btn-icon btn-danger"
                          type="button"
                          title="Xoá dòng"
                          disabled={rows.length <= 1}
                          onClick={() => setRows((list) => list.filter((item) => item.id !== row.id))}
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
            <div className="hint">Thêm ít nhất một cột để bắt đầu.</div>
          )}
          <div className="hint mt-2">Dùng phím Tab để di chuyển giữa các ô. Ô chỉ chứa số sẽ được gửi dạng số.</div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <div className="card-title">Tạo file .xlsx</div>
              <div className="card-desc">Bảng dữ liệu được gửi kèm hướng dẫn tiếng Việt để AI tạo tệp Excel thật.</div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={generate} disabled={sending}>
            {sending ? <Spinner label="Đang tạo bảng tính…" /> : <><FileDown size={16} /> Tạo file .xlsx</>}
          </button>
          {sending && <div className="hint mt-2">Đang xử lý: AI đang dựng bảng và định dạng tệp, vui lòng chờ.</div>}
          {onOpenChat && (
            <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
              Mở chat
            </button>
          )}
          <div className="hint mt-2">Tệp được tạo trong phiên chat; mở khung chat nếu bạn muốn xem hội thoại đầy đủ.</div>
        </div>

        {excelFiles.length > 0 && (
          <div className="card">
            <div className="card-title mb-2">Tệp đã tạo</div>
            {excelFiles.map((file) => (
              <div className="artifact-card" key={file.id}>
                <div className="artifact-icon">XLS</div>
                <div className="grow">
                  <div className="truncate bold small">{file.name}</div>
                  <div className="tiny faint">{file.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}</div>
                </div>
                <a className="btn btn-sm btn-primary" href={api.fileUrl(file.id)} download>
                  <FileDown size={14} /> Tải về
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
