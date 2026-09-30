#!/usr/bin/env python3
# Bản tham chiếu ĐỘC LẬP (Python + cryptography) để đối chiếu gói WireGuard handshake
# do ops/_scratch/T-20260930-03/wg-handshake.mjs dựng. Cùng đầu vào cố định ⇒ phải ra cùng byte.
import hashlib
import hmac

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

CONSTRUCTION = b"Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s"
IDENTIFIER = b"WireGuard v1 zx2c4 Jason@zx2c4.com"
LABEL_MAC1 = b"mac1----"


def b2(x):
    return hashlib.blake2s(x).digest()


def hb(k, x):
    return hmac.new(k, x, hashlib.blake2s).digest()


def kdf(key, inp, n):
    t = hb(key, inp)
    o1 = hb(t, b"\x01")
    o2 = hb(t, o1 + b"\x02")
    return [o1, o2][:n]


def dh(priv, pub):
    return X25519PrivateKey.from_private_bytes(priv).exchange(X25519PublicKey.from_public_bytes(pub))


def pubof(priv):
    return X25519PrivateKey.from_private_bytes(priv).public_key().public_bytes_raw()


def aead(key, counter, pt, aad):
    nonce = b"\x00" * 4 + counter.to_bytes(8, "little")
    return ChaCha20Poly1305(key).encrypt(nonce, pt, aad)


static_priv = bytes(range(1, 33))
static_pub = pubof(static_priv)
resp_priv = bytes(range(33, 65))
resp_pub = pubof(resp_priv)
eph_priv = bytes(range(65, 97))
eph_pub = pubof(eph_priv)
sender = 0x11223344
tai = bytes.fromhex("4000000063d0f1a200000000")

ck = b2(CONSTRUCTION)
h = b2(b2(ck + IDENTIFIER) + resp_pub)
ck = kdf(ck, eph_pub, 1)[0]
h = b2(h + eph_pub)
ck, key = kdf(ck, dh(eph_priv, resp_pub), 2)
enc_static = aead(key, 0, static_pub, h)
h = b2(h + enc_static)
ck, key = kdf(ck, dh(static_priv, resp_pub), 2)
enc_ts = aead(key, 0, tai, h)
h = b2(h + enc_ts)

body = bytes([1, 0, 0, 0]) + sender.to_bytes(4, "little") + eph_pub + enc_static + enc_ts
mac1 = hashlib.blake2s(body, key=b2(LABEL_MAC1 + resp_pub), digest_size=16).digest()
packet = body + mac1 + b"\x00" * 16

print("STATIC_PUB", static_pub.hex())
print("RESP_PUB", resp_pub.hex())
print("EPH_PUB", eph_pub.hex())
print("PACKET", packet.hex())
print("LEN", len(packet))
