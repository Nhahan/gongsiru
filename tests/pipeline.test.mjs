import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decryptJson } from "../src/lib/crypto.mjs";
import { assertSafeId } from "../tools/content.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("unsafe source IDs cannot escape private directory", () => {
  for (const id of ["../q", "a/b", "a\\b", "", ".."])
    assert.throws(() => assertSafeId(id));
  assertSafeId("al-national-9-2026-regular-가-q01");
});
test("import, release, manual revision, strict gate and rollback work end-to-end", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongsiru-pipeline-"));
  const output = path.join(root, "output");
  const write = async (p, v) => {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(v));
  };
  const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
  const run = (cmd, ...args) =>
    execFileSync(
      process.execPath,
      ["tools/content.mjs", cmd, "--root", root, "--output", output, ...args],
      { cwd: repo, encoding: "utf8", stdio: "pipe" },
    );
  try {
    const q = {
      id: "q",
      paperId: "p",
      number: 1,
      revision: 1,
      topicId: "foundations",
      stem: "테스트 전용 가상 질문",
      context: "",
      choices: [
        { id: "a", text: "가상 선지 A" },
        { id: "b", text: "가상 선지 B" },
      ],
      answer: { status: "final", choices: ["a"] },
      sourcePage: 1,
      sourceVerified: false,
    };
    const p = {
      id: "p",
      subjectId: "administrative-law",
      title: "가상 시험",
      year: 2026,
      examType: "national",
      grade: 9,
      round: "regular",
      booklet: "A",
      sourceUrl: "https://example.com/question",
      answerSourceUrl: "https://example.com/answer",
      answerStatus: "final",
      questionCount: 1,
    };
    await write(path.join(root, "imported/papers.json"), [p]);
    await write(path.join(root, "imported/questions/q.json"), q);
    run("import");
    const first = await fs.readFile(
      path.join(root, "content/questions/q.json"),
      "utf8",
    );
    run("import");
    assert.equal(
      await fs.readFile(path.join(root, "content/questions/q.json"), "utf8"),
      first,
    );
    assert.throws(() => run("release"));
    await assert.rejects(fs.access(path.join(output, "current.json")));
    run("release", "--allow-unverified");
    const one = await read(path.join(output, "current.json"));
    const current = await read(path.join(root, "content/questions/q.json"));
    current.answer.choices = ["b"];
    current.stem = "수동으로 수정한 가상 질문";
    await write(path.join(root, "content/questions/q.json"), current);
    run("release", "--allow-unverified");
    const two = await read(path.join(output, "current.json"));
    assert.notEqual(one.id, two.id);
    const snapshot = await read(path.join(root, "releases", two.id + ".json"));
    assert.equal(snapshot.questions[0].revision, 2);
    assert.equal(snapshot.questions[0].assessmentRevision, 2);
    const key = (
      await fs.readFile(path.join(root, "secrets/content.key"), "utf8")
    ).trim();
    const catalog = await decryptJson(
      await read(path.join(output, two.index)),
      key,
      `content:${two.id}:index`,
    );
    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0].assessmentRevision, 2);
    run("rollback", "--release", one.id);
    assert.equal((await read(path.join(output, "current.json"))).id, one.id);
    assert.equal(
      (await read(path.join(root, "releases/latest-source.json"))).questions[0]
        .revision,
      1,
    );
    q.stem = "외부 수입본 변경";
    await write(path.join(root, "imported/questions/q.json"), q);
    assert.throws(() => run("import"));
    assert.equal(
      (await read(path.join(root, "content/questions/q.json"))).stem,
      current.stem,
    );
    assert.throws(() => run("release", "--allow-unverified"));
    run("resolve", "--item", "question:q", "--keep-local");
    run("import");
    assert.equal(
      (await read(path.join(root, "content/questions/q.json"))).stem,
      current.stem,
    );
    q.stem = "두 번째 외부 변경";
    await write(path.join(root, "imported/questions/q.json"), q);
    assert.throws(() => run("import"));
    run("resolve", "--item", "question:q", "--use-incoming");
    run("import");
    assert.equal(
      (await read(path.join(root, "content/questions/q.json"))).stem,
      q.stem,
    );
    const papers = await read(path.join(root, "content/papers.json"));
    papers[0].title = "수동 메타데이터";
    await write(path.join(root, "content/papers.json"), papers);
    p.title = "새 수입 메타데이터";
    await write(path.join(root, "imported/papers.json"), [p]);
    assert.throws(() => run("import"));
    run("resolve", "--item", "metadata:papers", "--keep-local");
    run("import");
    assert.equal(
      (await read(path.join(root, "content/papers.json")))[0].title,
      "수동 메타데이터",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
