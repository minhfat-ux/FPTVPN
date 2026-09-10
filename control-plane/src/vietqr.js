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
 * Builds a full VietQR payload string — VietQR (NAPAS) consumer-presented QR
 * for a personal bank transfer ("transfer to account").
 *
 * Correct structure (per VietQR spec, see tranvu711/qrpayment + Napas):
 *   field 38 = merchant account info (VietQR uses tag 38, NOT 26)
 *     sub 00 = "A000000727"            (VietQR service GUID)
 *     sub 01 = {                        (customer/account info)
 *       00 = <bank BIN>                  e.g. TPBank 970423
 *       01 = <account number>
 *       02 = "QRIBFTTA"                  transfer to account
 *     }
 *   field 52 = "0000" (MCC), 53 = "704" (VND), 54 = amount
 *   58 = "VN", 59 = name, 60 = city, 62 = content/bill, 63 = CRC16
 */
export function buildVietQRPayload({ accountNumber, accountName, bin = BIN_TPBANK, amount, content = "" }) {
  const name = String(accountName || "VPNFlow").slice(0, 25);
  const note = String(content || "").slice(0, 25);

  // Service GUID subfield: 00 = "A000000727"
  const service = tlv("00", "A000000727");
  // Customer (account) subfield 01: 00 = BIN, 01 = account, 02 = QRIBFTTA
  const customer = tlv("00", bin) + tlv("01", accountNumber) + tlv("02", "QRIBFTTA");
  // Tag 38 merchant account info
  const merchantInfo = tlv("38", service + tlv("01", customer));

  let body = "000201";                          // payload format
  body += "010212";                             // dynamic (has amount)
  body += merchantInfo;
  body += tlv("52", "0000");                    // MCC
  body += tlv("53", "704");                     // VND
  if (amount) body += tlv("54", String(amount));
  body += tlv("58", "VN");
  body += tlv("59", name);
  body += tlv("60", "Hanoi");
  // Additional data (62): bill number = order reference so it shows in the
  // customer's transfer note field.
  body += tlv("62", tlv("01", note ? `VPNFLOW-${note}` : "VPNFLOW"));
  body += "6304";

  return body + crc16(body);
}

export const BANKS = { TPBANK: BIN_TPBANK };
