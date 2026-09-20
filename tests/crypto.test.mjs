import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptJson,
  decryptJson,
  newKey,
  fromBase64,
  toBase64,
  sha256,
} from "../src/lib/crypto.mjs";
test("AES-GCM roundtrip and random nonce", async () => {
  const k = newKey(),
    v = { text: "비공개 예문", answers: ["b"] };
  const a = await encryptJson(v, k, "study"),
    b = await encryptJson(v, k, "study");
  assert.deepEqual(await decryptJson(a, k, "study"), v);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
  assert(!JSON.stringify(a).includes(v.text));
  assert.equal(fromBase64(k).length, 32);
});
test("wrong key, domain and tampered data fail closed", async () => {
  const k = newKey(),
    a = await encryptJson({ x: 1 }, k, "study");
  await assert.rejects(decryptJson(a, newKey(), "study"));
  await assert.rejects(decryptJson(a, k, "study-backup"));
  const bytes = fromBase64(a.data);
  bytes[0] ^= 1;
  await assert.rejects(
    decryptJson({ ...a, data: toBase64(bytes) }, k, "study"),
  );
  await assert.rejects(decryptJson({ ...a, version: 2 }, k, "study"));
});
test("invalid key lengths and encodings are rejected", async () => {
  for (const k of ["", "bad key", "abc"])
    await assert.rejects(encryptJson({}, k, "study"));
  assert.equal(
    await sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
