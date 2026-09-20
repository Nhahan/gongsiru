const enc = new TextEncoder();
export function toBase64(bytes) {
  return btoa(Array.from(bytes, (x) => String.fromCharCode(x)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function fromBase64(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s))
    throw new Error("올바른 키 형식이 아닙니다.");
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export function newKey() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function deriveKey(raw, purpose) {
  const bytes = fromBase64(raw);
  if (bytes.length !== 32) throw new Error("키 길이가 올바르지 않습니다.");
  const base = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("gongsiru/v1"),
      info: enc.encode(purpose),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptJson(value, raw, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(raw, purpose);
  const data = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: enc.encode(`gongsiru/1/${purpose}`),
    },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    purpose,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  };
}
export async function decryptJson(envelope, raw, purpose) {
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-GCM" ||
    envelope.purpose !== purpose
  )
    throw new Error("지원하지 않는 암호화 자료입니다.");
  const iv = fromBase64(envelope.iv);
  if (iv.length !== 12) throw new Error("암호화 자료가 손상되었습니다.");
  const key = await deriveKey(raw, purpose);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: enc.encode(`gongsiru/1/${purpose}`),
    },
    key,
    fromBase64(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function sha256(text) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
