// IP address pool allocation for WireGuard clients.
// The pool subnet is CIDR-based; the first usable host is reserved for the server.

export class IPPool {
  /**
   * @param {string} cidr e.g. "10.77.0.0/24"
   */
  constructor(cidr) {
    this.cidr = cidr;
    this.base = parseCIDR(cidr);
  }

  /**
   * Returns the next free IP string, or null if the pool is exhausted.
   * The first usable host (network+1, i.e. ".1") is reserved for the server,
   * so allocation starts at network+2.
   * @param {Array<{assignedIP: string}>} devices
   */
  nextFreeIP(devices) {
    const used = new Set(devices.map((d) => d.assignedIP));
    for (let i = 2; i < this.base.size; i++) {
      const ip = longToIPv4(this.base.network + i);
      if (!used.has(ip)) return ip;
    }
    return null;
  }
}

// --- helpers ---

function parseCIDR(cidr) {
  const [addr, bitsStr] = cidr.split("/");
  const bits = bitsStr ? parseInt(bitsStr, 10) : 32;
  const ip = ipv4ToLong(addr);
  const mask = bits === 0 ? 0 : ~0 << (32 - bits);
  const network = (ip & mask) >>> 0;
  const size = Math.pow(2, 32 - bits);
  return { network, size };
}

function ipv4ToLong(str) {
  return str
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIPv4(long) {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255,
  ].join(".");
}
