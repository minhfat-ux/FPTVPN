import Foundation

/// P2 (26/09/2026) — trả lỗi IPv6 **TỨC THÌ** cho app, thay vì để gói IPv6 biến mất im lặng.
///
/// ## Vì sao cần (đọc trước khi sửa)
///
/// Server/exit node của sản phẩm **chỉ có IPv4**. Trên mạng có IPv6 (5G Trung Quốc), có hai cách
/// đều đã hỏng thật:
///
/// 1. **Không cấu hình IPv6** (trạng thái trước 26/09): IPv6 của khách đi THẲNG ra đường vật lý ⇒
///    **RÒ** (app hiện "Connected" mà lưu lượng IPv6 không qua VPN).
/// 2. **Kéo `::/0` vào tunnel** (đã thử 22/09 và 26/09): gói IPv6 vào tunnel rồi **biến mất** —
///    cầu ghi vào fd của Go và Go trả `errno=2` (ENOENT) ⇒ app **treo/timeout** ⇒ "siêu chậm",
///    Netflix không xem được (log máy thật: `bridge: packetFlow→Go (AF=30, write=80 errno=2)`).
///
/// **Android không dính cả hai** vì nền tảng của nó **CHẶN theo family mặc định**: family VPN không
/// cấu hình thì bị chặn, app nhận lỗi **NGAY** rồi lùi về IPv4 (xem commit AOSP
/// "Block address families by default in VpnService"). iOS **không có** cơ chế đó — nên phải tự làm.
///
/// Cách làm ở đây = mô phỏng đúng hành vi Android: vẫn kéo `::/0` vào tunnel (KHÔNG rò), nhưng khi
/// gặp gói IPv6 thì **không đưa cho Go** mà dựng **ICMPv6 Destination Unreachable** trả về cho app
/// ⇒ app nhận lỗi tức thì ⇒ Happy Eyeballs lùi IPv4 ngay.
///
/// Hàm ở đây là **logic THUẦN** (không I/O) nên harness `scripts/ios-pure-logic-tests` kiểm được
/// chính xác byte mà sản phẩm gửi — không phải bản sao.
enum IPv6Reject {

    /// Số byte tối đa của gói gốc được trích vào ICMPv6 (RFC 4443 §2.4 khuyến nghị 1232).
    static let maxQuotedBytes = 1232
    /// Độ dài header IPv6.
    static let ipv6HeaderLength = 40
    /// Next header = ICMPv6.
    static let nextHeaderICMPv6: UInt8 = 58
    /// Giới hạn hop cho gói ICMP do tunnel sinh.
    static let hopLimit: UInt8 = 64
    /// ICMPv6 `Echo Request` — thông tin duy nhất PHẢI được trả lỗi (xem `destinationUnreachable`).
    static let typeEchoRequest: UInt8 = 128

    /// Mã `ICMPv6 Destination Unreachable` mặc định = **4** ("Port Unreachable", RFC 4443 §3.1).
    ///
    /// VÌ SAO **KHÔNG** dùng code 0 ("no route") — đây là gốc của lỗi "IPv6 treo" trên macOS
    /// (đo thật 26/09/2026 trên system extension 1.4.7/22: `curl -6` treo **4,0 s**):
    ///
    /// * XNU `bsd/netinet6/icmp6.c` (`icmp6_input`) xếp **code 0 và code 3** vào
    ///   `PRC_UNREACH_NET`; chỉ **code 4** vào `PRC_UNREACH_PORT`.
    /// * XNU `bsd/netinet/tcp_subr.c` (`tcp6_ctlinput`) chỉ đổi `notify = tcp_drop_syn_sent` cho
    ///   `PRC_UNREACH_PORT` (khi `net.inet.tcp.icmp_may_rst = 1`, mặc định 1, đã kiểm trên máy) —
    ///   tức `connect()` bỏ NGAY với `ECONNREFUSED`.
    /// * Với `PRC_UNREACH_NET`, `tcp_notify` chỉ ghi `tp->t_softerror = error` rồi TCP **vẫn
    ///   retransmit SYN** tới khi `t_rxtshift > 3` mới bỏ ⇒ đo được 5 SYN vào tunnel / 5 ICMPv6
    ///   trả về trong 4,0 s. Đó KHÔNG phải "app lùi IPv4 ngay".
    ///
    /// Lỗi này ở CẢ iOS (cùng mã nguồn XNU) — bản P2 26/09 dùng code 0 nên chỉ **UDP** mới lùi
    /// ngay, TCP vẫn treo. Code 4 sửa cho cả hai nền tảng.
    static let codePortUnreachable: UInt8 = 4
    /// Mã 0 ("no route to destination") — giữ để tham chiếu/dự phòng, KHÔNG dùng làm mặc định.
    static let codeNoRoute: UInt8 = 0

    /// Kết quả dựng gói trả lỗi.
    enum Outcome: Equatable {
        /// Đã dựng được `ICMPv6 Destination Unreachable` để gửi lại cho app.
        case unreachable([UInt8])
        /// Không phải IPv6 (hoặc gói cụt) ⇒ bên gọi cứ chuyển tiếp như cũ.
        case notIPv6
        /// Là ICMPv6 mà **KHÔNG** được trả lỗi ⇒ im lặng bỏ: ICMPv6 lỗi (type < 128 — trả lỗi cho lỗi
        /// là sai RFC 4443 §2.4(e)), ICMPv6 thông tin khác ngoài `Echo Request` (ND/MLD…), và mọi
        /// gói có đích multicast. Gói `Echo Request` thì **có** trả lời (xem `destinationUnreachable`).
        case ignoreICMPv6
    }

    /// Dựng `ICMPv6 Destination Unreachable` cho một gói IPv6.
    ///
    /// `tunnelAddress` là địa chỉ IPv6 của utun (nguồn của gói trả lỗi). Truyền `nil` thì dùng
    /// **địa chỉ đích của gói gốc** làm nguồn — chấp nhận được trên thực tế và tránh phải truyền
    /// thêm tham số; app vẫn khớp được gói bị lỗi qua phần trích dẫn.
    ///
    /// `code` mặc định `codePortUnreachable` — xem chú thích hằng số đó (code 0 làm TCP treo 4 s).
    static func destinationUnreachable(
        ipv6Packet packet: [UInt8],
        tunnelAddress: [UInt8]? = nil,
        code: UInt8 = codePortUnreachable
    ) -> Outcome {
        guard packet.count >= ipv6HeaderLength, (packet[0] >> 4) == 6 else { return .notIPv6 }
        // Đích MULTICAST (`ff00::/8`): RFC 4443 §2.4(c) cấm trả lỗi cho gói multicast. Quan trọng
        // trên macOS: route `ff00::/8` của utun có thật (MLD/ND của chính tunnel đi vào cầu), nên
        // thiếu chốt này là tunnel tự trả lỗi cho gói điều khiển của chính nó.
        if packet[24] == 0xFF { return .ignoreICMPv6 }
        if packet[6] == nextHeaderICMPv6 {
            // Đây là ICMPv6. Ba nhánh, KHÔNG gộp (gộp là mất `ping6`):
            //  • type < 128 = ICMPv6 LỖI ⇒ bỏ im lặng. Trả lỗi cho lỗi là sai RFC 4443 §2.4(e) và
            //    có thể thành vòng (mỗi bên trả lỗi cho lỗi của bên kia).
            //  • type 128 = `Echo Request` ⇒ **PHẢI trả lỗi**: đây là `ping6`, không có lỗi nào
            //    khác để nó đọc nên nếu im lặng thì nó chờ hết thời gian (đo thật: `ping6 -c1`
            //    mất 11,0 s). `Echo Request` là thông tin, KHÔNG phải lỗi ⇒ trả lỗi là hợp lệ.
            //  • thông tin khác (Echo Reply, ND, MLD…) ⇒ bỏ im lặng: chúng là điều khiển link-local.
            guard packet.count > ipv6HeaderLength, packet[ipv6HeaderLength] == typeEchoRequest else {
                return .ignoreICMPv6
            }
        }

        let originalSource = Array(packet[8..<24])
        let originalDestination = Array(packet[24..<40])
        let quotedLength = min(packet.count, maxQuotedBytes)

        // ICMPv6: type(1) code(1) checksum(2) unused(4) + phần trích dẫn gói gốc.
        var message = [UInt8](repeating: 0, count: 8 + quotedLength)
        message[0] = 1   // Destination Unreachable
        message[1] = code
        // message[2...3] = checksum (tính sau)
        // message[4...7] = unused
        for index in 0..<quotedLength { message[8 + index] = packet[index] }

        // IPv6 header của gói trả lỗi.
        var reply = [UInt8](repeating: 0, count: ipv6HeaderLength + message.count)
        reply[0] = 0x60                                   // version 6
        let payloadLength = UInt16(message.count)
        reply[4] = UInt8(payloadLength >> 8)
        reply[5] = UInt8(payloadLength & 0xFF)
        reply[6] = nextHeaderICMPv6
        reply[7] = hopLimit
        let source = tunnelAddress?.count == 16 ? tunnelAddress! : originalDestination
        let destination = originalSource
        for index in 0..<16 { reply[8 + index] = source[index] }
        for index in 0..<16 { reply[24 + index] = destination[index] }
        for index in 0..<message.count { reply[ipv6HeaderLength + index] = message[index] }

        // Checksum ICMPv6 = bù một của tổng pseudo-header + thông điệp.
        let checksum = icmpv6Checksum(
            source: source,
            destination: destination,
            message: message
        )
        reply[ipv6HeaderLength + 2] = UInt8(checksum >> 8)
        reply[ipv6HeaderLength + 3] = UInt8(checksum & 0xFF)
        return .unreachable(reply)
    }

    /// Checksum ICMPv6 (RFC 4443 §2.3): bù một của tổng 16-bit của **pseudo-header IPv6** + thông điệp.
    /// Hàm thuần, `internal` để harness kiểm trực tiếp.
    static func icmpv6Checksum(source: [UInt8], destination: [UInt8], message: [UInt8]) -> UInt16 {
        var sum: UInt32 = 0
        func add(_ bytes: ArraySlice<UInt8>) {
            var index = bytes.startIndex
            while index + 1 < bytes.endIndex {
                sum &+= UInt32(bytes[index]) << 8 | UInt32(bytes[index + 1])
                index += 2
            }
            if index < bytes.endIndex { sum &+= UInt32(bytes[index]) << 8 }
        }
        add(source[0..<16])
        add(destination[0..<16])
        let length = UInt32(message.count)
        sum &+= (length >> 16) & 0xFFFF
        sum &+= length & 0xFFFF
        sum &+= UInt32(nextHeaderICMPv6)
        add(message[0..<message.count])
        while sum >> 16 != 0 { sum = (sum & 0xFFFF) &+ (sum >> 16) }
        return UInt16(~sum & 0xFFFF)
    }
}
