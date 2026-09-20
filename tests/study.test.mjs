import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { newKey, encryptJson } from "../src/lib/crypto.mjs";
import { defaultStudy } from "../src/lib/model.ts";
import {
  validateStudy,
  locateHighlight,
  saveStudy,
  loadStudy,
  storageName,
  importStudy,
  reconcileStudy,
} from "../src/lib/study.ts";
import { readingText, splitStem } from "../src/lib/typography.ts";
beforeEach(() => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
});
const mark = {
  id: "m",
  questionId: "q",
  blockId: "stem",
  text: "정답",
  prefix: "앞 ",
  suffix: " 뒤",
  start: 2,
  end: 4,
  revision: 1,
  color: "yellow",
};
test("highlight reanchor is contextual and rejects ambiguity", () => {
  assert.deepEqual(locateHighlight("앞 정답 뒤", mark), [2, 4]);
  assert.deepEqual(locateHighlight("추가 앞 정답 뒤", mark), [5, 7]);
  assert.equal(locateHighlight("앞 정답 새문맥", mark), null);
  assert.equal(
    locateHighlight("정답 또 정답", {
      ...mark,
      start: 100,
      end: 102,
      prefix: "",
      suffix: "",
    }),
    null,
  );
  assert.equal(locateHighlight("text", { ...mark, text: "" }), null);
});
test("backup shape rejects empty highlight, unknown version, invalid flags", () => {
  assert.equal(validateStudy(defaultStudy()).version, 1);
  for (const s of [
    { ...defaultStudy(), highlights: [{ ...mark, text: "" }] },
    { ...defaultStudy(), version: 2 },
    { ...defaultStudy(), hideAnswers: "yes" },
    { ...defaultStudy(), records: [] },
  ])
    assert.throws(() => validateStudy(s));
});
test("queued writes preserve newest state; plaintext never stored", async () => {
  const k = newKey(),
    a = defaultStudy();
  a.highlights = [mark];
  const b = { ...a, cycle: 2 };
  await Promise.all([saveStudy(k, a), saveStudy(k, b)]);
  assert.equal((await loadStudy(k)).cycle, 2);
  const saved = localStorage.getItem(await storageName(k));
  assert(!saved.includes("정답"));
  assert(!saved.includes(k));
});
test("restore uses same key and retains old encrypted record", async () => {
  const k = newKey(),
    old = defaultStudy();
  await saveStudy(k, old);
  const body = await encryptJson({ ...old, cycle: 3 }, k, "study-backup");
  const restored = await importStudy(
    k,
    new File([JSON.stringify(body)], "backup.json"),
  );
  assert.equal(restored.cycle, 3);
  assert(localStorage.getItem((await storageName(k)) + "-before-restore"));
  await assert.rejects(
    importStudy(newKey(), new File([JSON.stringify(body)], "backup.json")),
  );
});
test("answer revision invalidates known/read but preserves marks and cycle", () => {
  const s = defaultStudy();
  s.records.q = { state: "known", read: true, assessmentRevision: 1 };
  s.highlights = [mark];
  s.cycleIds = ["q", "removed"];
  const next = reconcileStudy(s, {
    entries: [{ id: "q", assessmentRevision: 2 }],
  });
  assert.equal(next.records.q.state, "unsure");
  assert.equal(next.records.q.read, false);
  assert.equal(next.records.q.assessmentRevision, 1);
  assert.deepEqual(next.highlights, s.highlights);
  assert.deepEqual(next.cycleIds, s.cycleIds);
});
test("reading typography joins PDF linewraps, preserves case markers", () => {
  assert.deepEqual(splitStem("질문?\nㄱ . 보기"), {
    prompt: "질문?",
    cases: "ㄱ . 보기",
  });
  assert.equal(readingText("ㄱ . 첫\n내용\nㄴ . 둘"), "ㄱ . 첫 내용\nㄴ . 둘");
  assert.equal(
    readingText("문장 앞\n문장 뒤\nㄱ. 첫\n내용\nㄴ. 둘"),
    "문장 앞 문장 뒤\nㄱ. 첫 내용\nㄴ. 둘",
  );
  assert.deepEqual(splitStem("질문?\nㄱ. 보기"), {
    prompt: "질문?",
    cases: "ㄱ. 보기",
  });
});
