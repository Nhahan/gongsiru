import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, fromBase64 } from "../src/lib/crypto.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(
  repo,
  process.argv.includes("--dist") ? "dist" : "public",
);
const data = path.join(root, "data");
async function walk(dir) {
  return (
    await Promise.all(
      (await fs.readdir(dir, { withFileTypes: true })).map(async (e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const files = await walk(data);
for (const file of files) {
  if (path.basename(file) === "current.json") continue;
  if (!file.endsWith(".enc.json"))
    throw Error("공개 자료 폴더에 허용되지 않은 파일이 있습니다.");
  const e = JSON.parse(await fs.readFile(file, "utf8"));
  if (
    Object.keys(e).sort().join() !== "algorithm,data,iv,purpose,version" ||
    e.version !== 1 ||
    e.algorithm !== "AES-GCM" ||
    fromBase64(e.iv).length !== 12 ||
    fromBase64(e.data).length < 16 ||
    !e.purpose.startsWith("content:")
  )
    throw Error("암호화 형식이 아닌 자료를 발견했습니다.");
}
const pointer = JSON.parse(
  await fs.readFile(path.join(data, "current.json"), "utf8"),
);
if (
  pointer.schemaVersion !== 1 ||
  pointer.index !== `releases/${pointer.id}/index.enc.json` ||
  !/^[a-zA-Z0-9_-]+$/.test(pointer.id)
)
  throw Error("잘못된 배포 포인터");
if (
  (await sha256(await fs.readFile(path.join(data, pointer.index), "utf8"))) !==
  pointer.sha256
)
  throw Error("배포 목록의 해시가 일치하지 않습니다.");
for (const file of await walk(root)) {
  if (/\.(pdf|csv|key|pem)$/.test(file))
    throw Error("비공개 원본 또는 키 형식의 파일이 있습니다.");
  if (
    /\.(html|js|css|json|txt|svg)$/.test(file) &&
    !file.endsWith(".enc.json")
  ) {
    const text = await fs.readFile(file, "utf8");
    if (/#key=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(text))
      throw Error("비밀 학습 링크가 포함되었습니다.");
  }
}
console.log(
  `공개 파일 검사 통과: 암호화 자료 ${files.length - 1}개, 비밀 링크·원본 파일 없음`,
);
