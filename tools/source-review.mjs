import { sha256 } from "../src/lib/crypto.mjs";

export const sourceContentHash = (q) =>
  sha256(JSON.stringify([q.stem, q.context || "", q.choices]));

// A review applies only to the exact PDF and extraction inspected by a reviewer.
export async function applySourceReview(raw, paper, review) {
  const q = structuredClone(raw);
  q.sourceVerified = false;
  if (!review) return q;
  const fail = (message) => {
    throw Error(`source review ${raw.id}: ${message}`);
  };
  if (review.questionId !== raw.id || review.paperSha256 !== paper?.sha256)
    fail("문항 또는 원본 PDF 버전 불일치");
  if (review.sourceContentHash !== (await sourceContentHash(raw)))
    fail("검토 이후 추출문이 변경되었습니다.");
  if (
    review.method !== "rendered-pdf-visual" ||
    !review.notes?.trim() ||
    !/^\d{4}-\d{2}-\d{2}/.test(review.reviewedAt || "") ||
    !Array.isArray(review.sourcePages) ||
    !review.sourcePages.length ||
    review.sourcePages.some((p) => !Number.isInteger(p) || p < 1) ||
    !review.sourcePages.includes(raw.sourcePage)
  )
    fail("시각 대조 기록이 불완전합니다.");
  const corrections = review.corrected || {};
  if (
    Object.keys(corrections).some(
      (k) => !["stem", "context", "choices"].includes(k),
    )
  )
    fail("허용되지 않은 교정 필드");
  for (const field of ["stem", "context"])
    if (field in corrections && typeof corrections[field] !== "string")
      fail("본문 교정 형식 오류");
  if (
    corrections.choices &&
    (JSON.stringify(corrections.choices.map((c) => c.id)) !==
      JSON.stringify(raw.choices.map((c) => c.id)) ||
      corrections.choices.some(
        (c) => typeof c.text !== "string" || !c.text.trim(),
      ))
  )
    fail("선지 교정 형식 오류");
  Object.assign(q, corrections, { sourceVerified: true });
  return q;
}
