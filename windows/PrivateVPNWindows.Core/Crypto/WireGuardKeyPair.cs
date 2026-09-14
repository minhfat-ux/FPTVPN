using System.Security.Cryptography;

namespace VpnFlow.Core.Crypto;

/// <summary>
/// Cặp khoá WireGuard (Curve25519 / X25519) sinh bằng C# thuần, không thêm package.
///
/// THAM CHIẾU THUẬT TOÁN: bản port trực tiếp từ TweetNaCl (public domain)
/// — https://tweetnacl.cr.yp.to/tweetnacl-20131229.pdf — hàm
/// `crypto_scalarmult_curve25519` và các hàm trường hữu hạn gf (car25519, sel25519,
/// pack25519, unpack25519, A/Z/M/S, inv25519). Đây cũng chính là X25519 (RFC 7748).
///
/// Quy tắc WireGuard:
///   - private key = 32 byte ngẫu nhiên rồi clamp: r[0] &= 248; r[31] &= 127; r[31] |= 64.
///   - public key  = X25519(private, basepoint 9), mã hoá little-endian.
/// </summary>
public sealed class WireGuardKeyPair
{
    public const int KeyLength = 32;

    /// <summary>Basepoint của Curve25519: 9 ở dạng little-endian 32 byte.</summary>
    private static readonly byte[] BasePoint = new byte[KeyLength]
    {
        9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    };

    /// <summary>Hằng số 121665 = (2^255 - 19 - 1) / 2 dưới dạng limb 16-bit.</summary>
    private static readonly long[] Const121665 = { 0xDB41, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };

    public byte[] PrivateKey { get; }
    public byte[] PublicKey { get; }

    public string PrivateKeyBase64 => Convert.ToBase64String(PrivateKey);
    public string PublicKeyBase64 => Convert.ToBase64String(PublicKey);

    private WireGuardKeyPair(byte[] privateKey, byte[] publicKey)
    {
        PrivateKey = privateKey;
        PublicKey = publicKey;
    }

    /// <summary>Sinh cặp khoá mới (private ngẫu nhiên đã clamp, public = X25519).</summary>
    public static WireGuardKeyPair Generate()
        => FromPrivateKey(RandomNumberGenerator.GetBytes(KeyLength));

    /// <summary>Dựng lại cặp khoá từ private key đã lưu (tự clamp lại).</summary>
    public static WireGuardKeyPair FromPrivateKey(byte[] privateKey)
    {
        if (privateKey is null || privateKey.Length != KeyLength)
            throw new ArgumentException($"Private key phải dài {KeyLength} byte.", nameof(privateKey));

        var clamped = Clamp(privateKey);
        return new WireGuardKeyPair(clamped, X25519(clamped, BasePoint));
    }

    /// <summary>Dựng lại cặp khoá từ private key base64 đã lưu.</summary>
    public static WireGuardKeyPair FromPrivateKeyBase64(string privateKeyBase64)
        => FromPrivateKey(Convert.FromBase64String(privateKeyBase64));

    /// <summary>Clamp private key WireGuard: r[0] &= 248; r[31] &= 127; r[31] |= 64.</summary>
    public static byte[] Clamp(byte[] privateKey)
    {
        var key = (byte[])privateKey.Clone();
        key[0] &= 248;
        key[31] &= 127;
        key[31] |= 64;
        return key;
    }

    /// <summary>Tính public key từ private key (tự clamp).</summary>
    public static byte[] ComputePublicKey(byte[] privateKey)
        => X25519(Clamp(privateKey), BasePoint);

    /// <summary>Tính shared secret giữa private key của mình và public key của peer.</summary>
    public static byte[] ComputeSharedSecret(byte[] privateKey, byte[] peerPublicKey)
        => X25519(Clamp(privateKey), peerPublicKey);

    /// <summary>
    /// X25519(scalar, point) — port của `crypto_scalarmult` trong TweetNaCl.
    /// Scalar được clamp bên trong (đúng RFC 7748 decodeScalar25519), nên gọi với
    /// private key chưa clamp vẫn cho kết quả đúng.
    /// </summary>
    public static byte[] X25519(byte[] scalar, byte[] point)
    {
        if (scalar is null || scalar.Length != KeyLength)
            throw new ArgumentException($"Scalar phải dài {KeyLength} byte.", nameof(scalar));
        if (point is null || point.Length != KeyLength)
            throw new ArgumentException($"Point phải dài {KeyLength} byte.", nameof(point));

        var z = new byte[KeyLength];
        Array.Copy(scalar, z, KeyLength);
        z[31] = (byte)((z[31] & 127) | 64);
        z[0] &= 248;

        var x = new long[80];
        var a = new long[16];
        var b = new long[16];
        var c = new long[16];
        var d = new long[16];
        var e = new long[16];
        var f = new long[16];

        Unpack25519(x, 0, point);
        for (var i = 0; i < 16; i++)
        {
            b[i] = x[i];
            a[i] = 0;
            c[i] = 0;
            d[i] = 0;
        }

        a[0] = 1;
        d[0] = 1;

        for (var i = 254; i >= 0; --i)
        {
            var r = (z[i >> 3] >> (i & 7)) & 1;
            Sel25519(a, b, r);
            Sel25519(c, d, r);
            A(e, a, c);
            Z(a, a, c);
            A(c, b, d);
            Z(b, b, d);
            S(d, e);
            S(f, a);
            M(a, 0, c, 0, a, 0);
            M(c, 0, b, 0, e, 0);
            A(e, a, c);
            Z(a, a, c);
            S(b, a);
            Z(c, d, f);
            M(a, 0, c, 0, Const121665, 0);
            A(a, a, d);
            M(c, 0, c, 0, a, 0);
            M(a, 0, d, 0, f, 0);
            M(d, 0, b, 0, x, 0);
            S(b, e);
            Sel25519(a, b, r);
            Sel25519(c, d, r);
        }

        for (var i = 0; i < 16; i++)
        {
            x[i + 16] = a[i];
            x[i + 32] = c[i];
            x[i + 48] = b[i];
            x[i + 64] = d[i];
        }

        Inv25519(x, 32, x, 32);
        M(x, 16, x, 16, x, 32);
        var q = new byte[KeyLength];
        Pack25519(q, x, 16);
        return q;
    }

    // --- Trường hữu hạn GF(2^255 - 19), biểu diễn 16 limb 16-bit (port TweetNaCl) ---

    private static void Car25519(long[] o, int offset)
    {
        for (var i = 0; i < 16; i++)
        {
            o[offset + i] += 1L << 16;
            var carry = o[offset + i] >> 16;
            var next = i < 15 ? i + 1 : 0;
            // i == 15: bù 38*(carry-1) vào limb 0 (2^256 ≡ 38 mod p).
            o[offset + next] += carry - 1 + (i == 15 ? 37 * (carry - 1) : 0);
            o[offset + i] -= carry << 16;
        }
    }

    private static void Sel25519(long[] p, long[] q, int b)
    {
        var mask = ~(b - 1L);
        for (var i = 0; i < 16; i++)
        {
            var t = mask & (p[i] ^ q[i]);
            p[i] ^= t;
            q[i] ^= t;
        }
    }

    private static void Pack25519(byte[] o, long[] n, int offset)
    {
        var t = new long[16];
        var m = new long[16];
        for (var i = 0; i < 16; i++) t[i] = n[offset + i];

        Car25519(t, 0);
        Car25519(t, 0);
        Car25519(t, 0);

        for (var j = 0; j < 2; j++)
        {
            m[0] = t[0] - 0xffed;
            for (var i = 1; i < 15; i++)
            {
                m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                m[i - 1] &= 0xffff;
            }

            m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
            var b = (int)((m[15] >> 16) & 1);
            m[14] &= 0xffff;
            Sel25519(t, m, 1 - b);
        }

        for (var i = 0; i < 16; i++)
        {
            o[2 * i] = (byte)(t[i] & 0xff);
            o[2 * i + 1] = (byte)(t[i] >> 8);
        }
    }

    private static void Unpack25519(long[] o, int offset, byte[] n)
    {
        for (var i = 0; i < 16; i++)
        {
            o[offset + i] = n[2 * i] + ((long)n[2 * i + 1] << 8);
        }

        o[offset + 15] &= 0x7fff;
    }

    private static void A(long[] o, long[] a, long[] b)
    {
        for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
    }

    private static void Z(long[] o, long[] a, long[] b)
    {
        for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
    }

    private static void M(long[] o, int oo, long[] a, int ao, long[] b, int bo)
    {
        var t = new long[31];
        for (var i = 0; i < 16; i++)
        {
            for (var j = 0; j < 16; j++)
            {
                t[i + j] += a[ao + i] * b[bo + j];
            }
        }

        for (var i = 0; i < 15; i++) t[i] += 38 * t[i + 16];
        for (var i = 0; i < 16; i++) o[oo + i] = t[i];

        Car25519(o, oo);
        Car25519(o, oo);
    }

    private static void S(long[] o, long[] a) => M(o, 0, a, 0, a, 0);

    private static void Inv25519(long[] o, int oo, long[] input, int io)
    {
        var c = new long[16];
        for (var i = 0; i < 16; i++) c[i] = input[io + i];

        for (var a = 253; a >= 0; a--)
        {
            S(c, c);
            if (a != 2 && a != 4) M(c, 0, c, 0, input, io);
        }

        for (var i = 0; i < 16; i++) o[oo + i] = c[i];
    }
}
