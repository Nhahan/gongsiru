import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../src/lib/crypto.mjs";
import { applySourceReview } from "./source-review.mjs";

const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function optional(file) {
  try {
    return await read(file);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

export async function checkExplanationEvidence(raw, question, review) {
  const errors = [];
  const fail = (s) => errors.push(`explanation review ${question.id}: ${s}`);
  if (!raw || !review) {
    fail("검증 기록 없음");
    return errors;
  }
  if (
    review.questionId !== question.id ||
    review.explanationHash !== (await sha256(JSON.stringify(raw)))
  )
    fail("검증 대상 해설 버전 불일치");
  if (
    !/^\d{4}-\d{2}-\d{2}/.test(review.reviewedAt || "") ||
    !review.currentLawCheck?.trim()
  )
    fail("현행법 확인 기록 누락");
  const evidence = review.optionEvidence || [];
  if (
    evidence.length !== question.choices.length ||
    new Set(evidence.map((x) => x.choiceId)).size !== evidence.length
  )
    fail("선지별 검토 수 불일치");
  for (const choice of question.choices) {
    const item = evidence.find((x) => x.choiceId === choice.id);
    const option = raw.options?.find((x) => x.choiceId === choice.id);
    if (
      !item?.reason?.trim() ||
      !item.referenceIds?.length ||
      !option ||
      item.referenceIds.some(
        (id) =>
          !option.referenceIds.includes(id) ||
          !raw.references?.some((r) => r.id === id),
      )
    )
      fail(`${choice.id}: 검토 이유 또는 직접 근거 누락`);
  }
  return errors;
}

export async function auditReviewEvidence(root, content) {
  const errors = [],
    sources = new Map(),
    explanations = new Map();
  for (const grade of ["grade9", "grade7"])
    for (const r of await optional(
      path.join(root, "research/source-review", grade + ".json"),
    )) {
      if (sources.has(r.questionId))
        errors.push(`duplicate source review ${r.questionId}`);
      sources.set(r.questionId, r);
    }
  for (const group of (
    await fs
      .readdir(path.join(root, "research"), { withFileTypes: true })
      .catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      })
  )
    .filter((d) => d.isDirectory())
    .map((d) => d.name))
    for (const r of await optional(
      path.join(root, "research", group, "verification.json"),
    )) {
      if (explanations.has(r.questionId))
        errors.push(`duplicate explanation review ${r.questionId}`);
      explanations.set(r.questionId, r);
    }
  for (const q of content.questions) {
    try {
      const raw = await read(
        path.join(root, "imported/questions", q.id + ".json"),
      );
      const reviewed = await applySourceReview(
        raw,
        content.papers.find((p) => p.id === q.paperId),
        sources.get(q.id),
      );
      if (
        !reviewed.sourceVerified ||
        JSON.stringify([
          reviewed.stem,
          reviewed.context || "",
          reviewed.choices,
        ]) !== JSON.stringify([q.stem, q.context || "", q.choices])
      )
        errors.push(`source review ${q.id}: 검토본과 배포본 불일치`);
      const explanation = await optional(
        path.join(root, "explanations", q.id + ".json"),
      );
      errors.push(
        ...(await checkExplanationEvidence(
          Array.isArray(explanation) ? null : explanation,
          q,
          explanations.get(q.id),
        )),
      );
      const deployed = content.explanations.find((e) => e.questionId === q.id);
      if (
        deployed &&
        !Array.isArray(explanation) &&
        JSON.stringify(semanticExplanation(explanation)) !==
          JSON.stringify(semanticExplanation(deployed))
      )
        errors.push(`explanation review ${q.id}: 검토본과 배포본 불일치`);
    } catch (e) {
      errors.push(e.message);
    }
  }
  const ids = new Set(content.questions.map((q) => q.id));
  for (const id of [...sources.keys(), ...explanations.keys()])
    if (!ids.has(id)) errors.push(`orphan review ${id}`);
  return errors;
}

// Import normalizes reference IDs and may share reference labels across questions.
// Compare the substantive text and source identities, not those display IDs.
function semanticExplanation(e) {
  const source = (r) => [
    r?.url || "",
    r?.article || "",
    r?.caseNumber || "",
    r?.effectiveDate || "",
  ];
  return [
    e.status,
    e.legalStatus,
    e.checkedAt,
    e.summary,
    e.currentNote || "",
    e.options.map((o) => [
      o.choiceId,
      o.verdict,
      o.text,
      o.referenceIds
        .map((id) => source(e.references.find((r) => r.id === id)))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]),
  ];
}
