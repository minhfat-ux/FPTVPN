using VpnFlow.Core.Crypto;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra X25519 tự cài đặt. Vector chuẩn RFC 7748 §6.1 là bằng chứng thuật toán đúng;
/// phần round-trip kiểm tra đúng quy tắc clamp của WireGuard.
/// </summary>
public class WireGuardKeyPairTests
{
    [Fact]
    public void Rfc7748_AlicePublicKey_MatchesVector()
    {
        var alicePrivate = Convert.FromHexString(
            "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");

        var publicKey = WireGuardKeyPair.ComputePublicKey(alicePrivate);

        Assert.Equal(
            "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
            Convert.ToHexString(publicKey).ToLowerInvariant());
    }

    [Fact]
    public void Rfc7748_BobPublicKey_MatchesVector()
    {
        var bobPrivate = Convert.FromHexString(
            "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");

        var publicKey = WireGuardKeyPair.ComputePublicKey(bobPrivate);

        Assert.Equal(
            "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
            Convert.ToHexString(publicKey).ToLowerInvariant());
    }

    [Fact]
    public void Rfc7748_SharedSecret_MatchesVector()
    {
        var alicePrivate = Convert.FromHexString(
            "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
        var bobPrivate = Convert.FromHexString(
            "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
        var bobPublic = WireGuardKeyPair.ComputePublicKey(bobPrivate);

        var shared = WireGuardKeyPair.ComputeSharedSecret(alicePrivate, bobPublic);

        Assert.Equal(
            "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742",
            Convert.ToHexString(shared).ToLowerInvariant());
    }

    [Fact]
    public void Generate_ClampsPrivateKeyPerWireGuardRules()
    {
        var pair = WireGuardKeyPair.Generate();

        Assert.Equal(32, pair.PrivateKey.Length);
        Assert.Equal(0, pair.PrivateKey[0] & 0b0000_0111);
        Assert.Equal(0, pair.PrivateKey[31] & 0b1000_0000);
        Assert.Equal(0b0100_0000, pair.PrivateKey[31] & 0b0100_0000);
    }

    [Fact]
    public void Generate_Base64RoundTrip_PreservesBothKeys()
    {
        var pair = WireGuardKeyPair.Generate();

        var rebuilt = WireGuardKeyPair.FromPrivateKeyBase64(pair.PrivateKeyBase64);

        Assert.Equal(pair.PrivateKeyBase64, rebuilt.PrivateKeyBase64);
        Assert.Equal(pair.PublicKeyBase64, rebuilt.PublicKeyBase64);
    }

    [Fact]
    public void ComputePublicKey_IsDeterministic_AndDiffersFromPrivate()
    {
        var pair = WireGuardKeyPair.Generate();

        var recomputed = WireGuardKeyPair.ComputePublicKey(pair.PrivateKey);

        Assert.Equal(pair.PublicKey, recomputed);
        Assert.NotEqual(pair.PrivateKey, pair.PublicKey);
    }
}
