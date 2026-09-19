/**
 * TÍNH TOÁN CHÍNH XÁC — để fBuddy TÍNH thay vì đoán.
 *
 * Vì sao: mô hình ngôn ngữ tính nhẩm rất hay sai (nhất là số lớn, phần trăm, phân số, dấu phẩy
 * động). Với câu hỏi toán, cách đúng không phải là "tra web" mà là **gọi công cụ tính**. Ở đây
 * dùng phân số BigInt nên cộng/trừ/nhân/chia là CHÍNH XÁC TUYỆT ĐỐI:
 *   0.1 + 0.2 = 3/10 (không phải 0.30000000000000004)
 *   1/3 + 1/6 = 1/2
 * Căn, log, lượng giác thì bắt buộc là xấp xỉ — kết quả ghi rõ là xấp xỉ.
 *
 * Hỗ trợ: + - * / ^ ( ) , hậu tố % (chia 100), giai thừa !, các hàm sqrt abs round floor ceil
 * min max pow log ln exp sin cos tan, và "a của b"/"a of b" nghĩa là a% của b.
 */

const DECIMAL_SEPARATORS = /[.,\s_]/g;

/**
 * Đọc một số kiểu Việt Nam: "2.400.000" = 2400000 · "1,5" = 1,5 · "1.234,56" = 1234,56 · "0.1" = 0,1.
 *
 * Cẩn thận: KHÔNG được xoá hết dấu chấm/phẩy sau khi đã phân loại — bản đầu xoá sạch nên "0.1"
 * thành "01" và phép "0.1 + 0.2" ra 3. Quy tắc: có cả "." và "," ⇒ dấu đứng sau là dấu thập phân;
 * chỉ có "." mà nhóm cuối đúng 3 chữ số ⇒ hiểu là ngăn nghìn (kiểu Việt Nam); còn lại là thập phân.
 */
export function parseNumber(raw) {
  let text = String(raw).trim().replace(/[₫đ]/g, "").replace(/[\s_]/g, "");
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  if (hasDot && hasComma) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (hasComma) {
    const [, fraction = ""] = text.split(",");
    text = fraction.length === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    const grouped = parts.length > 2 || (parts[1]?.length === 3 && parts[0].length <= 3 && !/^0/.test(parts[0]));
    if (grouped) text = text.replace(/\./g, "");
  }
  text = text.replace(/[^\d.eE+-]/g, "");
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

const bigAbs = (value) => (value < 0n ? -value : value);
function bigGcd(a, b) {
  a = bigAbs(a);
  b = bigAbs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

/** Phân số BigInt — mọi phép cộng/trừ/nhân/chia đều chính xác. */
function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error("chia cho 0");
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = bigGcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

const fromNumber = (value) => {
  if (Number.isInteger(value)) return rational(BigInt(value));
  const text = String(value);
  const [whole, fraction = ""] = text.split(".");
  const digits = BigInt(`${whole}${fraction}`.replace("-", "") || "0");
  const sign = text.startsWith("-") ? -1n : 1n;
  return rational(sign * digits, 10n ** BigInt(fraction.length));
};

const toNumber = (value) => Number(value.n) / Number(value.d);

/**
 * In kết quả. Dùng phép chia BigInt để biết con số thập phân này là CHÍNH XÁC hay chỉ là làm tròn
 * — người dùng phải phân biệt được "0,3 đúng" với "1,414213562373 là xấp xỉ".
 */
function formatFraction(value) {
  if (value.d === 1n) return { text: value.n.toString(), exact: true };
  const sign = value.n < 0n ? "-" : "";
  let numerator = bigAbs(value.n);
  const denominator = value.d;
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  let digits = "";
  for (let i = 0; i < 12 && remainder !== 0n; i += 1) {
    remainder *= 10n;
    digits += (remainder / denominator).toString();
    remainder %= denominator;
  }
  const exact = remainder === 0n;
  const trimmed = digits.replace(/0+$/, "");
  const decimal = `${sign}${whole}${trimmed ? `,${trimmed}` : ""}`;
  const fraction = denominator <= 1000000n && denominator !== 1n ? ` (phân số chính xác: ${sign}${numerator}/${denominator})` : "";
  return { text: `${decimal}${exact ? "" : " — làm tròn 12 chữ số"}${fraction}`, exact };
}

/** Bộ đọc biểu thức: đệ quy giảm dần, không dùng eval. */
function tokenize(input) {
  const text = String(input)
    .replace(/\bnhân\b|\bx\b/gi, "*")
    .replace(/\bchia\b|÷/g, "/")
    .replace(/\bcộng\b/g, "+")
    .replace(/\btrừ\b/g, "-")
    .replace(/\bmũ\b|\bluỹ thừa\b/gi, "^")
    .replace(/\bcủa\b|\bof\b/gi, "cua")
    .replace(/π/g, "pi");
  const tokens = [];
  const re = /\s*(\d[\d.,_\s]*\d|\d|pi|e\b|[a-z_]+|[-+*/^%!(),])/gi;
  let match;
  while ((match = re.exec(text))) tokens.push(match[1].trim());
  return tokens.filter(Boolean);
}

export function evaluateExpression(input) {
  const tokens = tokenize(input);
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const approximate = { used: false };

  const parsePrimary = () => {
    const token = next();
    if (token === undefined) throw new Error("biểu thức thiếu");
    if (token === "(") {
      const value = parseSum();
      if (next() !== ")") throw new Error("thiếu dấu )");
      return value;
    }
    if (token === "-") return rational(-parsePrimary().n, parsePrimarySafe().d ?? 1n);
    if (/^[a-z_]+$/i.test(token)) {
      const name = token.toLowerCase();
      if (name === "pi") return fromNumber(Math.PI);
      if (name === "e") return fromNumber(Math.E);
      const args = [];
      if (peek() === "(") {
        next();
        if (peek() !== ")") {
          args.push(parseSum());
          while (peek() === ",") {
            next();
            args.push(parseSum());
          }
        }
        if (next() !== ")") throw new Error("thiếu dấu ) sau hàm");
      } else {
        args.push(parsePrimary());
      }
      return applyFunction(name, args, approximate);
    }
    const value = parseNumber(token);
    if (!Number.isFinite(value)) throw new Error(`không đọc được số "${token}"`);
    return fromNumber(value);
  };

  // tiện cho dấu trừ đơn: đọc thêm một lần để lấy mẫu số (hiếm khi cần)
  const parsePrimarySafe = () => {
    const start = position;
    try {
      return parsePrimary();
    } catch {
      position = start;
      return rational(1n);
    }
  };

  const parsePower = () => {
    const base = parsePrimary();
    if (peek() === "^") {
      next();
      const exponent = parsePower();
      if (exponent.d === 1n && exponent.n >= 0n && exponent.n <= 64n) {
        return rational(base.n ** exponent.n, base.d ** exponent.n);
      }
      approximate.used = true;
      return fromNumber(toNumber(base) ** toNumber(exponent));
    }
    return base;
  };

  const parseUnary = () => {
    if (peek() === "-") {
      next();
      const value = parseUnary();
      return rational(-value.n, value.d);
    }
    if (peek() === "+") {
      next();
      return parseUnary();
    }
    return parsePower();
  };

  const parseProduct = () => {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token === "*") {
        next();
        const right = parseUnary();
        left = rational(left.n * right.n, left.d * right.d);
      } else if (token === "/") {
        next();
        const right = parseUnary();
        if (right.n === 0n) throw new Error("chia cho 0");
        left = rational(left.n * right.d, left.d * right.n);
      } else if (token === "%") {
        next();
        left = rational(left.n, left.d * 100n);
      } else if (token === "cua") {
        // "15% của X": dấu % đã chia 100 rồi, nên "của" chỉ là phép nhân. (Từng viết sai thành
        // chia 100 thêm lần nữa ⇒ 15% của 2.400.000 ra 3.600 thay vì 360.000.)
        next();
        const right = parseUnary();
        left = rational(left.n * right.n, left.d * right.d);
      } else if (token === "!") {
        next();
        left = applyFunction("factorial", [left], approximate);
      } else break;
    }
    return left;
  };

  const parseSum = () => {
    let left = parseProduct();
    for (;;) {
      const token = peek();
      if (token === "+" || token === "-") {
        next();
        const right = parseProduct();
        const n = token === "+" ? left.n * right.d + right.n * left.d : left.n * right.d - right.n * left.d;
        left = rational(n, left.d * right.d);
      } else break;
    }
    return left;
  };

  const result = parseSum();
  if (position < tokens.length) throw new Error(`còn phần chưa hiểu: "${tokens.slice(position).join(" ")}"`);
  const shown = formatFraction(result);
  // Số thập phân vô hạn (1/3, 1/7…) hoặc hàm căn/log/lượng giác ⇒ kết quả là XẤP XỈ; phải nói rõ.
  const isApproximate = approximate.used || !shown.exact;
  return { value: result, approximate: isApproximate, exact: !isApproximate, text: shown.text };
}

function applyFunction(name, args, approximate) {
  const first = args[0] ?? rational(0n);
  const x = toNumber(first);
  switch (name) {
    case "sqrt": {
      approximate.used = true;
      if (x < 0) throw new Error("căn bậc hai của số âm");
      return fromNumber(Math.sqrt(x));
    }
    case "abs":
      return rational(bigAbs(first.n), first.d);
    case "round":
      return fromNumber(Math.round(x));
    case "floor":
      return fromNumber(Math.floor(x));
    case "ceil":
      return fromNumber(Math.ceil(x));
    case "min":
      return args.reduce((best, item) => (toNumber(item) < toNumber(best) ? item : best), first);
    case "max":
      return args.reduce((best, item) => (toNumber(item) > toNumber(best) ? item : best), first);
    case "pow":
      return rational(first.n ** BigInt(Math.round(toNumber(args[1] ?? rational(2n)))), first.d ** BigInt(Math.round(toNumber(args[1] ?? rational(2n)))));
    case "factorial": {
      if (first.d !== 1n || first.n < 0n || first.n > 1000n) throw new Error("giai thừa chỉ nhận số nguyên 0..1000");
      let out = 1n;
      for (let i = 2n; i <= first.n; i += 1n) out *= i;
      return rational(out);
    }
    case "log":
    case "ln":
      approximate.used = true;
      return fromNumber(name === "log" ? Math.log10(x) : Math.log(x));
    case "exp":
      approximate.used = true;
      return fromNumber(Math.exp(x));
    case "sin":
    case "cos":
    case "tan":
      approximate.used = true;
      return fromNumber(Math[name](x));
    default:
      throw new Error(`không biết hàm "${name}"`);
  }
}

/** Bảng đổi đơn vị hay dùng (giá trị quy về đơn vị gốc). */
const UNITS = {
  "mm": ["dài", 0.001], "cm": ["dài", 0.01], "m": ["dài", 1], "km": ["dài", 1000],
  "in": ["dài", 0.0254], "ft": ["dài", 0.3048], "mile": ["dài", 1609.344], "hải lý": ["dài", 1852],
  "mg": ["khối lượng", 1e-6], "g": ["khối lượng", 0.001], "kg": ["khối lượng", 1], "tấn": ["khối lượng", 1000],
  "tạ": ["khối lượng", 100], "yến": ["khối lượng", 10], "lb": ["khối lượng", 0.45359237],
  "mm2": ["diện tích", 1e-6], "cm2": ["diện tích", 1e-4], "m2": ["diện tích", 1], "km2": ["diện tích", 1e6],
  "ha": ["diện tích", 10000], "sào": ["diện tích", 360], "mẫu": ["diện tích", 3600], "công": ["diện tích", 1000],
  "ml": ["thể tích", 0.001], "l": ["thể tích", 1], "m3": ["thể tích", 1000], "gal": ["thể tích", 3.785411784],
  "s": ["thời gian", 1], "phút": ["thời gian", 60], "giờ": ["thời gian", 3600], "ngày": ["thời gian", 86400],
  "b": ["dữ liệu", 1], "kb": ["dữ liệu", 1024], "mb": ["dữ liệu", 1024 ** 2], "gb": ["dữ liệu", 1024 ** 3], "tb": ["dữ liệu", 1024 ** 4],
  "vnd": ["tiền", 1], "nghìn": ["tiền", 1000], "triệu": ["tiền", 1e6], "tỷ": ["tiền", 1e9], "usd": ["tiền", null],
};

export function convertUnits(value, from, to) {
  const a = UNITS[String(from).toLowerCase().trim()];
  const b = UNITS[String(to).toLowerCase().trim()];
  if (!a || !b) throw new Error(`chưa có đơn vị "${!a ? from : to}"`);
  if (a[0] !== b[0]) throw new Error(`không đổi được giữa ${a[0]} và ${b[0]}`);
  if (a[1] === null || b[1] === null) throw new Error("đổi tiền cần tỷ giá — phải tra cứu, không tính được");
  const result = (value * a[1]) / b[1];
  return { value: result, exact: true };
}
