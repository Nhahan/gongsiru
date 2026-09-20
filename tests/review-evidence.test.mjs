import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../src/lib/crypto.mjs";
import { checkExplanationEvidence } from "../tools/review-evidence.mjs";
test("explanation proof must cover every option and the reviewed content version", async () => {
  const q = { id: "q", choices: [{ id: "a" }, { id: "b" }] };
  const raw = {
    questionId: "q",
    options: q.choices.map((c) => ({ choiceId: c.id, referenceIds: ["r"] })),
    references: [{ id: "r" }],
  };
  const review = {
    questionId: "q",
    reviewedAt: "2026-09-20",
    currentLawCheck: "현행 조문과 판시 확인",
    explanationHash: await sha256(JSON.stringify(raw)),
    optionEvidence: q.choices.map((c) => ({
      choiceId: c.id,
      referenceIds: ["r"],
      reason: "직접 근거 확인",
    })),
  };
  assert.deepEqual(await checkExplanationEvidence(raw, q, review), []);
  assert(
    (
      await checkExplanationEvidence(raw, q, {
        ...review,
        explanationHash: "changed",
      })
    ).length,
  );
  assert(
    (
      await checkExplanationEvidence(raw, q, {
        ...review,
        optionEvidence: review.optionEvidence.slice(1),
      })
    ).length,
  );
  assert(
    (await checkExplanationEvidence(raw, q, { ...review, currentLawCheck: "" }))
      .length,
  );
});
