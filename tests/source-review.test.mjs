import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySourceReview,
  sourceContentHash,
} from "../tools/source-review.mjs";
test("visual review is bound to both PDF and extracted text", async () => {
  const raw = {
    id: "q",
    stem: "질문",
    context: "",
    choices: [{ id: "a", text: "선지" }],
    sourcePage: 1,
    sourceVerified: true,
  };
  const paper = { sha256: "paper" };
  assert.equal((await applySourceReview(raw, paper)).sourceVerified, false);
  const review = {
    questionId: "q",
    paperSha256: "paper",
    sourceContentHash: await sourceContentHash(raw),
    sourcePages: [1],
    reviewedAt: "2026-09-20",
    method: "rendered-pdf-visual",
    notes: "본문과 선지 직접 대조",
    corrected: { stem: "교정 질문" },
  };
  const corrected = await applySourceReview(raw, paper, review);
  assert.equal(corrected.stem, "교정 질문");
  assert.equal(corrected.sourceVerified, true);
  assert.equal(raw.stem, "질문");
  await assert.rejects(
    applySourceReview({ ...raw, stem: "다른 버전" }, paper, review),
  );
  await assert.rejects(applySourceReview(raw, { sha256: "other" }, review));
  await assert.rejects(
    applySourceReview(raw, paper, {
      ...review,
      corrected: { answer: { choices: ["a"] } },
    }),
  );
});
