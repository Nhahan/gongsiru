import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptJson, sha256 } from "../src/lib/crypto.mjs";
import { checkIntegrity } from "./content.mjs";
import { auditReviewEvidence } from "./review-evidence.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root =
  process.env.GONGSIRU_CONTENT_ROOT ||
  path.resolve(repo, "../gongsiru-private");
const secret = (
  await fs.readFile(path.join(root, "secrets/content.key"), "utf8")
).trim();
const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const base = new URL(
  argv.find((a) => !a.startsWith("--")) || "https://nhahan.github.io/gongsiru/",
);
if (
  base.protocol !== "https:" ||
  base.hash ||
  base.search ||
  base.username ||
  base.password
)
  throw Error("키 없는 HTTPS 사이트 주소가 필요합니다.");
async function get(relative) {
  const url = new URL(relative, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    throw Error("자료 경로가 사이트 밖입니다.");
  const response = await fetch(url, {
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw Error("배포 자료 HTTP " + response.status);
  return response.text();
}
const pointer = JSON.parse(await get("data/current.json"));
const raw = await get("data/" + pointer.index);
if ((await sha256(raw)) !== pointer.sha256) throw Error("목록 해시 불일치");
const catalog = await decryptJson(
  JSON.parse(raw),
  secret,
  `content:${pointer.id}:index`,
);
const blocks = await Promise.all(
  catalog.chunks.map(async (c) => {
    const text = await get("data/" + c.path);
    if ((await sha256(text)) !== c.sha256) throw Error("단원 해시 불일치");
    const block = await decryptJson(
      JSON.parse(text),
      secret,
      `content:${pointer.id}:${c.topicId}`,
    );
    if (block.questions.length !== c.count) throw Error("단원 문항 수 불일치");
    return block;
  }),
);
const content = {
  papers: catalog.papers,
  topics: catalog.topics,
  questions: blocks.flatMap((b) => b.questions),
  explanations: blocks.flatMap((b) => b.explanations),
};
if (
  content.questions.length !== catalog.counts.questions ||
  checkIntegrity(content).length
)
  throw Error("배포 콘텐츠 무결성 검사 실패");
const sourceVerified = content.questions.filter((q) => q.sourceVerified).length;
const verified = content.explanations.filter(
  (e) => e.status === "verified",
).length;
if (verified !== catalog.counts.verified) throw Error("해설 검증 집계 불일치");
if (strict) {
  const expected = JSON.parse(
    await fs.readFile(path.join(repo, "public/data/current.json"), "utf8"),
  );
  if (pointer.id !== expected.id || pointer.sha256 !== expected.sha256)
    throw Error("최신 배포판이 아직 반영되지 않았습니다.");
  if (
    sourceVerified !== content.questions.length ||
    verified !== content.questions.length ||
    (await auditReviewEvidence(root, content)).length
  )
    throw Error("배포본 전체 검증 기록 불일치");
}
console.log(
  JSON.stringify({
    site: base.href,
    papers: content.papers.length,
    questions: content.questions.length,
    explanations: content.explanations.length,
    verified,
    sourceVerified,
    release: pointer.id,
    decryption: "passed",
    integrity: "passed",
  }),
);
