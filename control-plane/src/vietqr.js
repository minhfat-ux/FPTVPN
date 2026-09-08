/**
 * VietQR (EMVCo Merchant-Presented QR) payload builder.
 *
 * Generates the QR content string that Vietnamese banking apps (TPBank,
 * MoMo, Vietcombank, ...) understand: a Consumer Presented QR (CPQR-1.1)
 * where the customer scans, sees the pre-filled amount + account, and
 * confirms the transfer.
 *
 * Structure (TLV): 00 payload format, 01 POI, 26 merchant account
 * information (GUID 00000072701 + VietQR fields), 52 category, 53 currency
 * (704 = VND), 54 amount, 58 country (VN), 59 merchant name, 62 content,
 * 63 CRC16.
 */

const BIN_TPBANK = "970423";

function tlv(id, value) {
  const len = String(value).length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 uppercase hex chars. */
function crc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Builds a full VietQR payload string.
 * @param {object} opts
 * @param {string} opts.accountNumber
 * @param {string} opts.accountName  (merchant name, ASCII-safe subset)
 * @param {string} [opts.bin]         default TPBank
 * @param {number} [opts.amount]      VND, optional for amount-less QR
 * @param {string} [opts.content]     transfer note (max ~25 chars)
 */
export function buildVietQRPayload({ accountNumber, accountName, bin = BIN_TPBANK, amount, content = "" }) {
  const name = String(accountName || "VPNFlow").slice(0, 25);
  const note = String(content || "").slice(0, 25);

  // Merchant Account Information (field 26)
  const guid = tlv("00", "00000072701"); // VietQR global GUID
  const vq = tlv("01", "11");            // VietQR version
  const binTlv = tlv("02", bin);         // bank BIN
  const acctTlv = tlv("03", accountNumber); // account number
  const merchantInfo = tlv("26", guid + vq + binTlv + acctTlv);

  // Build body (everything except CRC)
  let body = "000201";                              // payload format indicator
  body += "010212";                                 // point of init: dynamic (per-amount)
  body += merchantInfo;
  body += tlv("52", "0000");                        // merchant category code (uncategorised)
  body += tlv("53", "704");                         // currency VND
  if (amount) body += tlv("54", String(amount));    // transaction amount
  body += tlv("58", "VN");                          // country
  body += tlv("59", name);                          // merchant name
  body += tlv("60", "Hanoi");                       // merchant city
  // Additional data (field 62): bill number = the order reference
  body += tlv("62", tlv("01", note ? `VPNFLOW-${note}` : "VPNFLOW"));
  body += "6304";                                   // CRC placeholder tag

  const crc = crc16(body);
  return body + crc;
}

export const BANKS = { TPBANK: BIN_TPBANK };
