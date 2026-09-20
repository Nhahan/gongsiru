import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIntegrity, normalizeRevisions } from "../tools/content.mjs";
const fixture = () => ({
  papers: [{ id: "p", questionCount: 1 }],
  topics: [{ id: "t" }],
  questions: [
    {
      id: "q",
      paperId: "p",
      topicId: "t",
      number: 1,
      revision: 1,
      assessmentRevision: 1,
      stem: "예제 질문",
      context: "",
      choices: [
        { id: "a", text: "선택 A" },
        { id: "b", text: "선택 B" },
      ],
      answer: { status: "final", choices: ["a"] },
    },
  ],
  explanations: [],
});
test("integrity catches missing options, orphan refs and numbering", () => {
  assert.deepEqual(checkIntegrity(fixture()), []);
  const c = fixture();
  c.questions[0].answer.choices = ["z"];
  assert(checkIntegrity(c).some((e) => e.startsWith("answer choice")));
  c.questions[0].number = 2;
  assert(checkIntegrity(c).some((e) => e.startsWith("question numbering")));
});
test("verified means every option has source and current-law review", () => {
  const c = fixture();
  c.explanations = [
    {
      questionId: "q",
      status: "verified",
      legalStatus: "unreviewed",
      checkedAt: "2026-09-20",
      options: [],
      references: [],
    },
  ];
  assert(
    checkIntegrity(c).some((e) => e.startsWith("verification incomplete")),
  );
});
test("manual canonical edits receive content and answer revisions", async () => {
  const old = fixture(),
    now = structuredClone(old);
  now.questions[0].stem = "수정된 예제";
  now.questions[0].answer.choices = ["b"];
  await normalizeRevisions(now, old);
  assert.equal(now.questions[0].revision, 2);
  assert.equal(now.questions[0].assessmentRevision, 2);
  assert.equal(now.questions[0].contentHash.length, 64);
  await normalizeRevisions(now, now);
  assert.equal(now.questions[0].revision, 2);
});
