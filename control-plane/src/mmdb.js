import fs from "node:fs";

/**
 * Đọc file MaxMind DB (.mmdb) bằng Node thuần — KHÔNG thêm dependency, KHÔNG gọi mạng.
 *
 * Vì sao tự viết thay vì dùng npm `maxmind`: bảng GeoIP nằm ngay trên VPS
 * (`dbip-city-lite.mmdb` ~127MB) nên chỉ cần đọc tại chỗ; thêm một package chỉ để tra
 * vài chục IP mỗi lần mở dashboard là không đáng. VPS chỉ có ~1GB RAM nên reader đọc
 * theo offset (`fs.readSync`) — KHÔNG nạp cả file vào bộ nhớ.
 *
 * Tham chiếu: "MaxMind DB File Format Specification" (search tree / data section / metadata).
 */

/** Marker mở đầu phần metadata; lần xuất hiện CUỐI CÙNG trong file mới là thật. */
const METADATA_MARKER = Buffer.from("\xab\xcd\xefMaxMind.com", "binary");

/** Spec: metadata tối đa 128KiB (kể cả marker). */
const MAX_METADATA_SIZE = 128 * 1024;

/** Chặn tài nguyên khi gặp dữ liệu hỏng/độc hại (spec mục "Reader Resource Limits"). */
const MAX_DEPTH = 64;
const MAX_VALUES = 100000;

/** Con trỏ đọc tuần tự trên file, đệm từng khối nhỏ để không phải syscall cho mỗi byte. */
class FileCursor {
  constructor(fd, position, fileSize) {
    this.fd = fd;
    this.position = position;
    this.fileSize = fileSize;
    this.buffer = Buffer.alloc(0);
    this.offset = 0;
  }

  #fill(minBytes) {
    const length = Math.max(64, minBytes);
    const remaining = this.fileSize - this.position;
    if (remaining <= 0) throw new Error("MMDB: hết file khi đang đọc dữ liệu");
    const size = Math.min(length, remaining);
    const buffer = Buffer.allocUnsafe(size);
    const read = fs.readSync(this.fd, buffer, 0, size, this.position);
    if (read <= 0) throw new Error("MMDB: không đọc được dữ liệu");
    this.buffer = buffer.subarray(0, read);
    this.offset = 0;
    this.position += read;
  }

  byte() {
    if (this.offset >= this.buffer.length) this.#fill(1);
    return this.buffer[this.offset++];
  }

  uint(size) {
    if (size === 0) return 0;
    let value = 0;
    for (let i = 0; i < size; i += 1) value = value * 256 + this.byte();
    return value;
  }

  bytes(size) {
    const out = Buffer.allocUnsafe(size);
    for (let i = 0; i < size; i += 1) out[i] = this.byte();
    return out;
  }

  string(size) {
    return this.bytes(size).toString("utf8");
  }

  double() {
    return this.bytes(8).readDoubleBE(0);
  }

  float() {
    return this.bytes(4).readFloatBE(0);
  }
}

/**
 * Chuẩn hoá IP thành { family, bytes }. IPv4-mapped IPv6 ("::ffff:1.2.3.4") coi như IPv4.
 * @param {string} ip
 * @returns {{family: 4|6, bytes: Buffer}}
 */
export function parseIp(ip) {
  const value = String(ip ?? "").trim().replace(/^\[|\]$/g, "");
  if (!value) throw new Error("MMDB: IP rỗng");
  if (value.includes(":")) {
    const lower = value.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return { family: 4, bytes: parseIpv4(mapped[1]) };
    const [headRaw, tailRaw = ""] = lower.split("::");
    const head = headRaw ? headRaw.split(":") : [];
    const tail = tailRaw ? tailRaw.split(":") : [];
    const groups = [];
    if (lower.includes("::")) {
      const fill = 8 - (head.length + tail.length);
      if (fill < 0) throw new Error(`MMDB: IPv6 không hợp lệ: ${ip}`);
      groups.push(...head, ...Array(fill).fill("0"), ...tail);
    } else {
      groups.push(...head);
    }
    if (groups.length !== 8) throw new Error(`MMDB: IPv6 không hợp lệ: ${ip}`);
    const bytes = Buffer.alloc(16);
    groups.forEach((group, index) => {
      if (!/^[0-9a-f]{1,4}$/.test(group)) throw new Error(`MMDB: IPv6 không hợp lệ: ${ip}`);
      bytes.writeUInt16BE(Number.parseInt(group, 16), index * 2);
    });
    return { family: 6, bytes };
  }
  return { family: 4, bytes: parseIpv4(value) };
}

function parseIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) throw new Error(`MMDB: IPv4 không hợp lệ: ${value}`);
  const bytes = Buffer.alloc(4);
  parts.forEach((part, index) => {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) throw new Error(`MMDB: IPv4 không hợp lệ: ${value}`);
    bytes[index] = Number(part);
  });
  return bytes;
}

/**
 * Reader chỉ-đọc cho một file .mmdb.
 * `const reader = MmdbReader.open(path); reader.lookup("1.2.3.4"); reader.close();`
 */
export class MmdbReader {
  #fd;
  #fileSize;
  #nodeCount;
  #recordSize;
  #ipVersion;
  #databaseType;
  #nodeByteSize;
  #searchTreeSize;
  #metadataStart;
  #ipv4Start = null;

  /** @param {string} filePath */
  constructor(filePath) {
    this.#fd = fs.openSync(filePath, "r");
    try {
      this.#fileSize = fs.fstatSync(this.#fd).size;
      this.#metadataStart = this.#findMetadataStart();
      const meta = this.#decodeValue(new FileCursor(this.#fd, this.#metadataStart, this.#fileSize), this.#metadataStart, {
        depth: 0,
        values: 0,
      });
      if (!meta || typeof meta !== "object") throw new Error("MMDB: metadata không phải map");
      this.#nodeCount = Number(meta.node_count);
      this.#recordSize = Number(meta.record_size);
      this.#ipVersion = Number(meta.ip_version);
      this.#databaseType = String(meta.database_type ?? "unknown");
      if (!Number.isFinite(this.#nodeCount) || this.#nodeCount <= 0) throw new Error("MMDB: node_count không hợp lệ");
      if (![24, 28, 32].includes(this.#recordSize)) throw new Error(`MMDB: record_size không hỗ trợ: ${this.#recordSize}`);
      if (![4, 6].includes(this.#ipVersion)) throw new Error(`MMDB: ip_version không hợp lệ: ${this.#ipVersion}`);
      this.#nodeByteSize = (this.#recordSize * 2) / 8;
      this.#searchTreeSize = this.#nodeByteSize * this.#nodeCount;
    } catch (err) {
      fs.closeSync(this.#fd);
      this.#fd = null;
      throw err;
    }
  }

  /** @param {string} filePath */
  static open(filePath) {
    return new MmdbReader(filePath);
  }

  /** Thông tin file đang đọc (bảng nào, bao nhiêu node) — để log/dashboard. */
  meta() {
    return {
      database_type: this.#databaseType,
      node_count: this.#nodeCount,
      record_size: this.#recordSize,
      ip_version: this.#ipVersion,
      search_tree_size: this.#searchTreeSize,
    };
  }

  /**
   * Tra một IP; trả `null` khi bảng không có dữ liệu cho dải đó.
   * @param {string} ip
   */
  lookup(ip) {
    if (!this.#fd) throw new Error("MMDB: reader đã đóng");
    const { family, bytes } = parseIp(ip);
    if (family === 6 && this.#ipVersion === 4) return null;
    let node = family === 4 && this.#ipVersion === 6 ? this.#ipv4StartNode() : 0;
    const bitCount = family === 4 ? 32 : 128;
    for (let i = 0; i < bitCount; i += 1) {
      const bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
      const record = this.#nodeRecord(node, bit);
      if (record === this.#nodeCount) return null; // hết dữ liệu
      if (record > this.#nodeCount) {
        const fileOffset = this.#searchTreeSize + (record - this.#nodeCount);
        return this.#decodeValue(
          new FileCursor(this.#fd, fileOffset, this.#fileSize),
          this.#searchTreeSize + 16,
          { depth: 0, values: 0 },
        );
      }
      node = record;
    }
    return null;
  }

  close() {
    if (this.#fd) {
      fs.closeSync(this.#fd);
      this.#fd = null;
    }
  }

  /** Node bắt đầu của không gian IPv4 trong cây IPv6 (đi 96 bit 0 từ gốc), cache lại. */
  #ipv4StartNode() {
    if (this.#ipv4Start !== null) return this.#ipv4Start;
    let node = 0;
    for (let i = 0; i < 96; i += 1) {
      const record = this.#nodeRecord(node, 0);
      // Cây không có nhánh IPv4 riêng ⇒ dừng ở node hiện tại (mọi IPv4 sẽ không có dữ liệu).
      if (record >= this.#nodeCount) break;
      node = record;
    }
    this.#ipv4Start = node;
    return node;
  }

  /**
   * Giá trị record trái/phải của một node (big-endian, 24/28/32 bit).
   * @param {number} nodeIndex
   * @param {0|1} bit
   */
  #nodeRecord(nodeIndex, bit) {
    const buffer = Buffer.allocUnsafe(this.#nodeByteSize);
    const read = fs.readSync(this.#fd, buffer, 0, this.#nodeByteSize, nodeIndex * this.#nodeByteSize);
    if (read !== this.#nodeByteSize) throw new Error("MMDB: đọc node thất bại");
    if (this.#recordSize === 24) {
      return bit === 0 ? buffer.readUIntBE(0, 3) : buffer.readUIntBE(3, 3);
    }
    if (this.#recordSize === 28) {
      const middle = buffer[3];
      const left = (middle >> 4) * 0x1000000 + buffer.readUIntBE(0, 3);
      const right = (middle & 0x0f) * 0x1000000 + buffer.readUIntBE(4, 3);
      return bit === 0 ? left : right;
    }
    return bit === 0 ? buffer.readUInt32BE(0) : buffer.readUInt32BE(4);
  }

  /** Vị trí metadata: lần xuất hiện CUỐI của marker trong 128KiB cuối file. */
  #findMetadataStart() {
    const tailLength = Math.min(this.#fileSize, MAX_METADATA_SIZE + METADATA_MARKER.length);
    const tailStart = this.#fileSize - tailLength;
    const tail = Buffer.allocUnsafe(tailLength);
    const read = fs.readSync(this.#fd, tail, 0, tailLength, tailStart);
    const index = tail.subarray(0, read).lastIndexOf(METADATA_MARKER);
    if (index < 0) throw new Error("MMDB: không tìm thấy marker metadata");
    return tailStart + index + METADATA_MARKER.length;
  }

  /**
   * Giải mã một field tại con trỏ đang đứng.
   * @param {FileCursor} cursor
   * @param {number} base mốc tính offset con trỏ (data section hoặc metadata)
   * @param {{depth: number, values: number}} ctx
   */
  #decodeValue(cursor, base, ctx) {
    ctx.values += 1;
    ctx.depth += 1;
    if (ctx.depth > MAX_DEPTH || ctx.values > MAX_VALUES) throw new Error("MMDB: dữ liệu vượt giới hạn an toàn");
    try {
      return this.#decodeField(cursor, base, ctx);
    } finally {
      // `depth` là độ SÂU lồng nhau (phải trả lại khi thoát), `values` mới là ngân sách tổng.
      ctx.depth -= 1;
    }
  }

  /**
   * Thân của việc giải mã (tách khỏi #decodeValue để quản lý độ sâu bằng try/finally).
   * @param {FileCursor} cursor
   * @param {number} base
   * @param {{depth: number, values: number}} ctx
   */
  #decodeField(cursor, base, ctx) {
    const control = cursor.byte();
    const type = control >> 5;

    // Con trỏ (type 1): 2 bit giữa là cỡ, 3 bit thấp là phần đầu của giá trị; KHÔNG có size phía sau.
    if (type === 1) {
      const pointerSize = (control >> 3) & 0x03;
      let value;
      if (pointerSize === 0) value = ((control & 0x07) << 8) | cursor.byte();
      else if (pointerSize === 1) value = (((control & 0x07) << 16) | cursor.uint(2)) + 2048;
      else if (pointerSize === 2) value = (((control & 0x07) << 24) | cursor.uint(3)) + 526336;
      else value = cursor.uint(4);
      return this.#decodeValue(new FileCursor(this.#fd, base + value, this.#fileSize), base, ctx);
    }

    // type 0 = "extended": byte kế tiếp là type - 7.
    const resolvedType = type === 0 ? cursor.byte() + 7 : type;
    const size = readSize(control & 0x1f, cursor);

    switch (resolvedType) {
      case 2:
        return cursor.string(size);
      case 3:
        return cursor.double();
      case 4:
        return cursor.bytes(size);
      case 5:
      case 6:
      case 9:
        return cursor.uint(size);
      case 7: {
        const map = {};
        for (let i = 0; i < size; i += 1) {
          const key = this.#decodeValue(cursor, base, ctx);
          map[String(key)] = this.#decodeValue(cursor, base, ctx);
        }
        return map;
      }
      case 8: {
        const raw = cursor.uint(size);
        // Số âm chỉ khi field đủ 4 byte (spec: field ngắn hơn luôn là số dương).
        return size === 4 && raw >= 0x80000000 ? raw - 0x100000000 : raw;
      }
      case 10:
        return cursor.bytes(size);
      case 11: {
        const array = [];
        for (let i = 0; i < size; i += 1) array.push(this.#decodeValue(cursor, base, ctx));
        return array;
      }
      case 14:
        return size === 1;
      case 15:
        return cursor.float();
      default:
        throw new Error(`MMDB: loại dữ liệu không hỗ trợ: ${resolvedType}`);
    }
  }
}

/** Cỡ payload: <29 là chính nó; 29/30/31 là cỡ mở rộng (spec "Payload Size"). */
function readSize(bits, cursor) {
  if (bits < 29) return bits;
  if (bits === 29) return 29 + cursor.byte();
  if (bits === 30) return 285 + cursor.uint(2);
  return 65821 + cursor.uint(3);
}
