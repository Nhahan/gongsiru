import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Ajv from "ajv";
import { encryptJson, newKey, sha256 } from "../src/lib/crypto.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2),
  command = args.shift();
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
async function realTarget(target) {
  try {
    return await fs.realpath(target);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const parent = path.dirname(target);
    if (parent === target) throw e;
    return path.join(await realTarget(parent), path.basename(target));
  }
}
const root = await realTarget(
  path.resolve(
    arg(
      "root",
      process.env.GONGSIRU_CONTENT_ROOT ||
        path.join(repo, "../gongsiru-private"),
    ),
  ),
);
if (root === repo || root.startsWith(repo + path.sep))
  throw Error("비공개 자료는 공개 저장소 밖에 두어야 합니다.");
const data = path.join(root, "content"),
  pub = path.resolve(arg("output", path.join(repo, "public/data")));
export function assertSafeId(id) {
  if (
    typeof id !== "string" ||
    id.length > 200 ||
    !/^[-\p{L}\p{N}_]+$/u.test(id)
  )
    throw Error("파일 식별자 형식이 안전하지 않습니다.");
}
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
async function write(p, v) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const temp = p + ".tmp";
  await fs.writeFile(temp, JSON.stringify(v, null, 2) + "\n");
  await fs.rename(temp, p);
}
async function objects(dir) {
  if (!(await exists(dir))) return [];
  return Promise.all(
    (await fs.readdir(dir))
      .filter((x) => x.endsWith(".json"))
      .sort()
      .map((x) => read(path.join(dir, x))),
  );
}
const topics = [
  "foundations:행정법의 기초",
  "organization:행정조직",
  "actions:행정작용",
  "procedure:행정절차·정보공개",
  "enforcement:실효성 확보",
  "compensation:국가배상·손실보상",
  "appeals:행정심판",
  "litigation:행정소송",
  "special:행정법 각론",
  "unclassified:분류 검토",
].map((x, order) => {
  const [id, title] = x.split(":");
  return { id, title, order, subjectId: "administrative-law" };
});
function classify(q) {
  const s = q.stem + " " + q.context;
  for (const [id, re] of [
    ["litigation", /소송|집행정지|제소기간|판결/],
    ["appeals", /행정심판|재결/],
    ["compensation", /국가배상|손실보상|손해배상|공용수용/],
    ["procedure", /정보공개|개인정보|행정절차|청문|송달|의견제출/],
    [
      "enforcement",
      /대집행|이행강제|과징금|과태료|행정벌|강제집행|행정조사|강제징수/,
    ],
    ["organization", /행정조직|권한의 위임|기관위임|공무원|지방자치/],
    [
      "foundations",
      /법원칙|법의 법원|행정법의|법치행정|공법관계|사법관계|신뢰보호|법률유보/,
    ],
    [
      "special",
      /공물|공용|경찰|토지|건축|도시계획|개발|재정|조세|학교|교육|환경/,
    ],
    [
      "actions",
      /행정행위|행정입법|행정규칙|법규명령|처분|행정계획|행정계약|행정지도|신고|허가|인가|부관|재량|확약/,
    ],
  ])
    if (re.test(s)) return id;
  return "unclassified";
}
async function importContent() {
  await fs.mkdir(data, { recursive: true });
  await write(
    path.join(data, "topics.json"),
    (await exists(path.join(data, "topics.json")))
      ? await read(path.join(data, "topics.json"))
      : topics,
  );
  const papers = (await read(path.join(root, "imported/papers.json"))).map(
    (p) =>
      Object.fromEntries(
        Object.entries({
          ...p,
          heldOn: p.examDate || undefined,
          title: p.title.replaceAll("_", " "),
        }).filter(
          ([k, v]) =>
            [
              "id",
              "subjectId",
              "title",
              "year",
              "heldOn",
              "examType",
              "grade",
              "round",
              "booklet",
              "sourceUrl",
              "answerSourceUrl",
              "answerStatus",
              "questionCount",
              "sha256",
              "sourcePath",
            ].includes(k) && v !== undefined,
        ),
      ),
  );
  await write(path.join(data, "papers.json"), papers);
  const statePath = path.join(root, "import-state.json"),
    state = (await exists(statePath)) ? await read(statePath) : {},
    conflicts = [];
  let manualTopics = {};
  for (const folder of ["national9", "local9", "national7", "local7"]) {
    const p = path.join(root, "research", folder, "topics.json");
    if (await exists(p)) {
      const t = await read(p);
      manualTopics = {
        ...manualTopics,
        ...(Array.isArray(t)
          ? Object.fromEntries(t.map((x) => [x.questionId, x.topicId]))
          : t),
      };
    }
  }
  async function mergeFile(file, incoming, key) {
    const h = await sha256(JSON.stringify(incoming));
    if (state[key]?.incoming === h) return;
    if (await exists(file)) {
      const current = await read(file);
      if (
        state[key] &&
        (await sha256(JSON.stringify(current))) !== state[key].stored
      ) {
        conflicts.push(key);
        return;
      }
    }
    await write(file, incoming);
    state[key] = { incoming: h, stored: h };
  }
  for (const raw of await objects(path.join(root, "imported/questions"))) {
    assertSafeId(raw.id);
    const oldPath = path.join(data, "questions", raw.id + ".json");
    const old = (await exists(oldPath)) ? await read(oldPath) : null;
    const q = Object.fromEntries(
      Object.entries(raw).filter(([k]) =>
        [
          "id",
          "paperId",
          "number",
          "revision",
          "topicId",
          "stem",
          "context",
          "choices",
          "answer",
          "sourcePage",
          "sourceVerified",
        ].includes(k),
      ),
    );
    q.context = q.context || "";
    q.topicId = manualTopics[q.id] || old?.topicId || classify(q);
    if (q.topicId === "unclassified") q.topicId = classify(q);
    q.contentHash = await sha256(
      JSON.stringify([q.stem, q.context, q.choices]),
    );
    q.revision = old
      ? old.contentHash === q.contentHash
        ? old.revision
        : old.revision + 1
      : 1;
    q.assessmentRevision = old
      ? JSON.stringify(old.answer) === JSON.stringify(q.answer)
        ? old.assessmentRevision || 1
        : (old.assessmentRevision || 1) + 1
      : 1;
    await mergeFile(oldPath, q, "question:" + q.id);
  }
  const importedRefs = new Set();
  for (const raw of await objects(path.join(root, "explanations"))) {
    assertSafeId(raw.questionId);
    const mapped = new Map();
    const refs = [];
    for (const r of raw.references || []) {
      const id =
        "ref-" +
        (
          await sha256(
            JSON.stringify([
              r.url,
              r.article || "",
              r.caseNumber || "",
              r.effectiveDate || "",
            ]),
          )
        ).slice(0, 20);
      mapped.set(r.id, id);
      const ref = { ...r, id };
      if (!importedRefs.has(id)) {
        const file = path.join(data, "references", id + ".json");
        if (!state["reference:" + id] && (await exists(file))) {
          const current = await read(file);
          state["reference:" + id] = {
            stored: await sha256(JSON.stringify(current)),
            incoming: await sha256(JSON.stringify(current)),
          };
        }
        await mergeFile(file, ref, "reference:" + id);
        importedRefs.add(id);
      }
      refs.push(id);
    }
    const e = {
      ...raw,
      referenceIds: [...new Set(refs)],
      options: (raw.options || []).map((o) => ({
        ...o,
        referenceIds: o.referenceIds.map((id) => mapped.get(id) || id),
      })),
    };
    delete e.references;
    const file = path.join(data, "explanations", e.questionId + ".json");
    const old = (await exists(file)) ? await read(file) : null;
    e.revision = old?.revision || 1;
    if (
      old &&
      JSON.stringify({ ...old, revision: 0 }) !==
        JSON.stringify({ ...e, revision: 0 })
    )
      e.revision++;
    await mergeFile(file, e, "explanation:" + e.questionId);
  }
  await write(statePath, state);
  await write(path.join(root, "reports/import-conflicts.json"), conflicts);
  if (!(await exists(path.join(root, ".git")))) {
    execFileSync("git", ["init", "-q", root]);
    await fs.writeFile(
      path.join(root, ".gitignore"),
      "secrets/\nimported/\nreleases/\noriginals/\n*.key\n*.tmp\n",
    );
  }
  console.log(
    JSON.stringify({
      papers: papers.length,
      questions: (await objects(path.join(data, "questions"))).length,
      conflicts: conflicts.length,
    }),
  );
  if (conflicts.length)
    throw Error(
      "편집본과 충돌합니다. 비공개 reports/import-conflicts.json을 확인하세요.",
    );
}
async function load() {
  const refs = new Map(
    (await objects(path.join(data, "references"))).map((x) => [x.id, x]),
  );
  return {
    schemaVersion: 1,
    papers: await read(path.join(data, "papers.json")),
    topics: await read(path.join(data, "topics.json")),
    questions: await objects(path.join(data, "questions")),
    explanations: (await objects(path.join(data, "explanations"))).map((e) => {
      const { referenceIds, ...rest } = e;
      return {
        ...rest,
        references: (referenceIds || [])
          .map((id) => refs.get(id))
          .filter(Boolean),
      };
    }),
  };
}
export function checkIntegrity(content) {
  const errors = [];
  const unique = (rows, key, label) => {
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r[key])) errors.push(`${label}: duplicate ${r[key]}`);
      seen.add(r[key]);
    }
    return seen;
  };
  const papers = unique(content.papers, "id", "paper"),
    questions = unique(content.questions, "id", "question"),
    topicIds = unique(content.topics, "id", "topic");
  unique(content.explanations, "questionId", "explanation");
  for (const q of content.questions) {
    if (!papers.has(q.paperId)) errors.push(`paper missing: ${q.id}`);
    if (!topicIds.has(q.topicId)) errors.push(`topic missing: ${q.id}`);
    const choices = unique(q.choices, "id", q.id);
    for (const a of q.answer.choices)
      if (!choices.has(a)) errors.push(`answer choice missing: ${q.id}`);
    if (!q.answer.choices.length && q.answer.status !== "cancelled")
      errors.push(`empty answer: ${q.id}`);
  }
  for (const p of content.papers) {
    const qs = content.questions.filter((q) => q.paperId === p.id);
    if (qs.length !== p.questionCount) errors.push(`question count: ${p.id}`);
    const nums = new Set(qs.map((q) => q.number));
    if (nums.size !== qs.length || qs.some((q) => q.number > p.questionCount))
      errors.push(`question numbering: ${p.id}`);
  }
  for (const e of content.explanations) {
    if (!questions.has(e.questionId))
      errors.push(`orphan explanation: ${e.questionId}`);
    const q = content.questions.find((q) => q.id === e.questionId);
    const refs = unique(e.references, "id", e.questionId);
    unique(e.options, "choiceId", e.questionId);
    for (const o of e.options) {
      if (!q?.choices.some((c) => c.id === o.choiceId))
        errors.push(`orphan explanation choice: ${e.questionId}`);
      for (const id of o.referenceIds)
        if (!refs.has(id)) errors.push(`reference missing: ${e.questionId}`);
    }
    if (
      e.status === "verified" &&
      (e.legalStatus === "unreviewed" ||
        !e.checkedAt ||
        e.options.length !== q?.choices.length ||
        e.options.some(
          (o) =>
            !o.text.trim() || o.verdict === "unknown" || !o.referenceIds.length,
        ))
    )
      errors.push(`verification incomplete: ${e.questionId}`);
    for (const r of e.references) {
      try {
        if (new URL(r.url).protocol !== "https:")
          errors.push(`unsafe reference: ${r.id}`);
      } catch {
        errors.push(`invalid reference: ${r.id}`);
      }
    }
  }
  return errors;
}
async function validate(content, { strict = false } = {}) {
  const schema = await read(path.join(repo, "schema/content.schema.json"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const valid = ajv.compile(schema);
  const errors = [];
  if (!valid(content))
    errors.push(...valid.errors.map((e) => `${e.instancePath}: ${e.message}`));
  if (!errors.length) errors.push(...checkIntegrity(content));
  const stats = {
    papers: content.papers.length,
    questions: content.questions.length,
    sourceVerified: content.questions.filter((q) => q?.sourceVerified).length,
    explanations: content.explanations.length,
    verified: content.explanations.filter((e) => e?.status === "verified")
      .length,
    changed: content.explanations.filter((e) => e?.legalStatus === "changed")
      .length,
  };
  if (
    strict &&
    (stats.verified !== stats.questions ||
      stats.sourceVerified !== stats.questions)
  )
    errors.push("전체 원문·해설 검증이 완료되지 않았습니다.");
  await write(path.join(root, "reports/validation.json"), {
    checkedAt: new Date().toISOString(),
    ...stats,
    errors,
  });
  console.log(JSON.stringify({ ...stats, errors: errors.length }));
  if (errors.length)
    throw Error(
      `자료 검사 실패 (${errors.length}). 비공개 reports/validation.json 참조.`,
    );
  return stats;
}
async function diff(content) {
  const p = path.join(root, "releases/latest-source.json");
  const before = (await exists(p))
    ? await read(p)
    : { questions: [], explanations: [] };
  const prev = new Map(before.questions.map((q) => [q.id, q])),
    now = new Map(content.questions.map((q) => [q.id, q]));
  const report = {
    added: [],
    removed: [],
    text: [],
    answer: [],
    topic: [],
    explanation: [],
  };
  for (const q of content.questions) {
    const old = prev.get(q.id);
    if (!old) {
      report.added.push(q.id);
      continue;
    }
    for (const [k, fields] of [
      ["text", ["stem", "context", "choices"]],
      ["answer", ["answer"]],
      ["topic", ["topicId"]],
    ])
      if (fields.some((f) => JSON.stringify(old[f]) !== JSON.stringify(q[f])))
        report[k].push(q.id);
  }
  for (const id of prev.keys()) if (!now.has(id)) report.removed.push(id);
  const es = new Map(before.explanations.map((e) => [e.questionId, e]));
  for (const e of content.explanations)
    if (JSON.stringify(e) !== JSON.stringify(es.get(e.questionId)))
      report.explanation.push(e.questionId);
  await write(path.join(root, "reports/diff.json"), report);
  console.log(
    JSON.stringify(
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length])),
    ),
  );
  return report;
}
async function key() {
  const keyFile = await realTarget(
    path.resolve(arg("key-file", path.join(root, "secrets/content.key"))),
  );
  if (keyFile.startsWith(repo + path.sep))
    throw Error("키는 저장소 밖에 보관하세요.");
  if (!(await exists(keyFile))) {
    await fs.mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(keyFile, newKey(), { mode: 0o600 });
  }
  return (await fs.readFile(keyFile, "utf8")).trim();
}
export async function normalizeRevisions(content, before) {
  const previous = new Map(before.questions.map((q) => [q.id, q]));
  for (const q of content.questions) {
    const old = previous.get(q.id),
      hash = await sha256(JSON.stringify([q.stem, q.context, q.choices]));
    q.contentHash = hash;
    if (!old) {
      q.revision = Math.max(1, q.revision || 1);
      q.assessmentRevision = Math.max(1, q.assessmentRevision || 1);
      continue;
    }
    const changed =
      JSON.stringify([old.stem, old.context, old.choices]) !==
      JSON.stringify([q.stem, q.context, q.choices]);
    q.revision = Math.max(q.revision || 1, old.revision + (changed ? 1 : 0));
    q.assessmentRevision = Math.max(
      q.assessmentRevision || 1,
      (old.assessmentRevision || 1) +
        (JSON.stringify(old.answer) !== JSON.stringify(q.answer) ? 1 : 0),
    );
  }
  const previousExplanations = new Map(
    before.explanations.map((e) => [e.questionId, e]),
  );
  for (const e of content.explanations) {
    const old = previousExplanations.get(e.questionId);
    e.revision = Math.max(
      e.revision || 1,
      old
        ? (old.revision || 1) +
            (JSON.stringify({ ...old, revision: 0 }) !==
            JSON.stringify({ ...e, revision: 0 })
              ? 1
              : 0)
        : 1,
    );
  }
  return content;
}
async function release(content) {
  const prior = path.join(root, "releases/latest-source.json");
  await normalizeRevisions(
    content,
    (await exists(prior))
      ? await read(prior)
      : { questions: [], explanations: [] },
  );
  const stats = await validate(content, {
    strict: !args.includes("--allow-unverified"),
  });
  const changes = await diff(content);
  if (changes.removed.length && !args.includes("--allow-removals"))
    throw Error(
      "문항 삭제가 감지되었습니다. diff 확인 후 --allow-removals가 필요합니다.",
    );
  const raw = await key(),
    id =
      new Date().toISOString().replace(/[-:.]/g, "") +
      "-" +
      (await sha256(JSON.stringify(content))).slice(0, 8),
    dir = path.join(pub, "releases", id);
  await fs.mkdir(dir, { recursive: true });
  const chunks = [];
  for (const topic of content.topics) {
    const qs = content.questions.filter((q) => q.topicId === topic.id);
    if (!qs.length) continue;
    const ids = new Set(qs.map((q) => q.id));
    const env = await encryptJson(
      {
        questions: qs,
        explanations: content.explanations.filter((e) => ids.has(e.questionId)),
      },
      raw,
      `content:${id}:${topic.id}`,
    );
    const body = JSON.stringify(env);
    const name = (await sha256(body)).slice(0, 24) + ".enc.json";
    await fs.writeFile(path.join(dir, name), body);
    chunks.push({
      topicId: topic.id,
      path: `releases/${id}/${name}`,
      sha256: await sha256(body),
      count: qs.length,
    });
  }
  const es = new Map(content.explanations.map((e) => [e.questionId, e]));
  const catalog = {
    schemaVersion: 1,
    releaseId: id,
    createdAt: new Date().toISOString(),
    counts: {
      questions: stats.questions,
      verified: stats.verified,
      sourceVerified: stats.sourceVerified,
    },
    papers: content.papers.map(({ sourcePath, ...p }) => p),
    topics: content.topics,
    entries: content.questions.map((q) => ({
      id: q.id,
      paperId: q.paperId,
      number: q.number,
      topicId: q.topicId,
      revision: q.revision,
      assessmentRevision: q.assessmentRevision || 1,
      legalStatus: es.get(q.id)?.legalStatus || "unreviewed",
      explanationStatus: es.get(q.id)?.status || "missing",
      sourceVerified: q.sourceVerified,
    })),
    chunks,
  };
  const body = JSON.stringify(
    await encryptJson(catalog, raw, `content:${id}:index`),
  );
  await fs.writeFile(path.join(dir, "index.enc.json"), body);
  const pointer = {
    schemaVersion: 1,
    id,
    index: `releases/${id}/index.enc.json`,
    sha256: await sha256(body),
  };
  await write(path.join(root, "releases", id + ".json"), content);
  await write(path.join(root, "releases/latest-source.json"), content);
  await fs.mkdir(path.join(root, "secrets"), { recursive: true });
  await fs.writeFile(
    path.join(root, "secrets/study-link.txt"),
    `https://nhahan.github.io/gongsiru/#key=${raw}\n`,
    { mode: 0o600 },
  );
  await write(path.join(pub, "current.json"), pointer);
  console.log(
    JSON.stringify({
      release: id,
      questions: stats.questions,
      verified: stats.verified,
      complete:
        stats.verified === stats.questions &&
        stats.sourceVerified === stats.questions,
    }),
  );
}
async function rollback() {
  const id = arg("release");
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id))
    throw Error("--release ID를 지정하세요.");
  const source = await read(path.join(root, "releases", id + ".json"));
  const file = path.join(pub, "releases", id, "index.enc.json");
  const body = await fs.readFile(file, "utf8");
  await write(path.join(pub, "current.json"), {
    schemaVersion: 1,
    id,
    index: `releases/${id}/index.enc.json`,
    sha256: await sha256(body),
  });
  await write(path.join(root, "releases/latest-source.json"), source);
  console.log("콘텐츠 배포판 복원 완료.");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (command === "import") await importContent();
    else if (command === "rollback") await rollback();
    else {
      const content = await load();
      if (command === "validate")
        await validate(content, { strict: args.includes("--strict") });
      else if (command === "diff") await diff(content);
      else if (command === "release") await release(content);
      else throw Error("import | validate | diff | release | rollback");
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
