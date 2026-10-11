import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, codeForStep, generateSecret, otpauthUrl, stepAt, verifyCode } from "./totp.js";

process.env.TOTP_ENCRYPTION_KEY ??= "0".repeat(64);
const { decrypt, encrypt, generateRecoveryCodes, hashRecoveryCode } = await import("./secrets.js");

// Segredo dos vetores de teste da RFC 6238 (SHA-1): "12345678901234567890" em ASCII
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("vetores oficiais da RFC 6238 (8 dígitos)", () => {
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ] as const) {
    assert.equal(codeForStep(RFC_SECRET, stepAt(new Date(seconds * 1000)), 8), expected);
  }
});

test("base32 vai e volta", () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(base32Encode(base32Decode(secret)), secret);
  assert.throws(() => base32Decode("abc1"));
});

test("aceita 1 passo de diferença no relógio e recusa mais que isso", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const step = stepAt(now);
  assert.equal(verifyCode(RFC_SECRET, codeForStep(RFC_SECRET, step), now), step);
  assert.equal(verifyCode(RFC_SECRET, codeForStep(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(verifyCode(RFC_SECRET, codeForStep(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(verifyCode(RFC_SECRET, codeForStep(RFC_SECRET, step - 2), now), null);
  assert.equal(verifyCode(RFC_SECRET, "12345", now), null);
  assert.equal(verifyCode(RFC_SECRET, "abcdef", now), null);
});

test("código já usado não vale de novo", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const step = stepAt(now);
  const code = codeForStep(RFC_SECRET, step);
  assert.equal(verifyCode(RFC_SECRET, code, now, step), null);
  assert.equal(verifyCode(RFC_SECRET, code, now, step - 1), step);
});

test("URL do QR code no formato que os apps entendem", () => {
  const url = new URL(otpauthUrl("JBSWY3DPEHPK3PXP", "ana@exemplo.com"));
  assert.equal(url.protocol, "otpauth:");
  assert.equal(url.host, "totp");
  assert.equal(decodeURIComponent(url.pathname), "/Controle de Ponto:ana@exemplo.com");
  assert.equal(url.searchParams.get("secret"), "JBSWY3DPEHPK3PXP");
  assert.equal(url.searchParams.get("issuer"), "Controle de Ponto");
});

test("segredo criptografado: vai e volta, IV diferente a cada vez e recusa valor adulterado", () => {
  const a = encrypt("JBSWY3DPEHPK3PXP");
  const b = encrypt("JBSWY3DPEHPK3PXP");
  assert.notEqual(a, b);
  assert.ok(!a.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(decrypt(a), "JBSWY3DPEHPK3PXP");
  const [v, iv, tag, data] = a.split(":");
  const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
  assert.throws(() => decrypt([v, iv, tag, flipped].join(":")));
});

test("códigos de recuperação: 10, únicos, e o hash ignora maiúsculas e o hífen", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[0].toUpperCase().replace("-", " ")));
  assert.match(hashRecoveryCode(codes[0]), /^[0-9a-f]{64}$/);
});

test("chave de criptografia: aceita 32 bytes em hex ou base64 (generateValue do Render), recusa o resto", async () => {
  const { decodeKey } = await import("./env.js");
  const bytes = Buffer.alloc(32, 7);
  assert.deepEqual(decodeKey(bytes.toString("hex")), bytes);
  assert.deepEqual(decodeKey(bytes.toString("base64")), bytes);
  assert.deepEqual(decodeKey(bytes.toString("base64url")), bytes);
  assert.equal(decodeKey("curta"), null);
  assert.equal(decodeKey(Buffer.alloc(16).toString("hex")), null);
  assert.equal(decodeKey(Buffer.alloc(31).toString("base64")), null);
});
