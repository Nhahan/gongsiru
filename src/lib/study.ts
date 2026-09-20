import { decryptJson, encryptJson, sha256 } from "./crypto.mjs";
import {
  defaultStudy,
  type StudyState,
  type Highlight,
  type Catalog,
} from "./model";
export async function storageName(key: string) {
  return "gongsiru-study-" + (await sha256("local-record:" + key)).slice(0, 24);
}
export function validateStudy(s: unknown): StudyState {
  const v = s as StudyState;
  if (
    !v ||
    v.version !== 1 ||
    !Number.isInteger(v.cycle) ||
    v.cycle < 1 ||
    !Array.isArray(v.cycleIds) ||
    !v.cycleIds.every((x) => typeof x === "string") ||
    !Array.isArray(v.highlights) ||
    !v.records ||
    Array.isArray(v.records) ||
    typeof v.records !== "object" ||
    !v.filters ||
    !["continuous", "single"].includes(v.mode) ||
    ![16, 18, 20].includes(v.fontSize) ||
    !["hideAnswers", "collapseKnown", "onlyHighlights"].every(
      (k) => typeof (v as unknown as Record<string, unknown>)[k] === "boolean",
    ) ||
    !["currentId", "cycleRelease", "updatedAt"].every(
      (k) => typeof (v as unknown as Record<string, unknown>)[k] === "string",
    )
  )
    throw new Error("지원하지 않거나 손상된 학습 기록입니다.");
  if (v.cycleIds.length > 100000 || v.highlights.length > 50000)
    throw new Error("학습 기록 크기가 너무 큽니다.");
  for (const r of Object.values(v.records))
    if (
      !r ||
      !["keep", "unsure", "known"].includes(r.state) ||
      typeof r.read !== "boolean" ||
      !Number.isInteger(r.assessmentRevision)
    )
      throw new Error("문항 상태가 손상되었습니다.");
  for (const h of v.highlights)
    if (
      !h ||
      !["id", "questionId", "blockId", "text", "prefix", "suffix"].every(
        (k) => typeof (h as unknown as Record<string, unknown>)[k] === "string",
      ) ||
      !h.text ||
      !["yellow", "pink"].includes(h.color) ||
      !Number.isInteger(h.revision) ||
      h.revision < 1 ||
      !Number.isInteger(h.start) ||
      !Number.isInteger(h.end) ||
      h.start < 0 ||
      h.end - h.start !== h.text.length
    )
      throw new Error("형광펜 기록이 손상되었습니다.");
  if (
    !["grade", "exam", "year", "topic"].every(
      (k) =>
        typeof (v.filters as unknown as Record<string, unknown>)[k] ===
        "string",
    ) ||
    !["topic", "paper"].includes(v.filters.order) ||
    typeof v.filters.includeChanged !== "boolean" ||
    typeof v.filters.onlyUnsure !== "boolean"
  )
    throw new Error("필터 기록이 손상되었습니다.");
  return { ...defaultStudy(), ...v };
}
export async function loadStudy(key: string) {
  const name = await storageName(key),
    raw = localStorage.getItem(name);
  if (!raw) return defaultStudy();
  return validateStudy(await decryptJson(JSON.parse(raw), key, "study"));
}
let queue: Promise<unknown> = Promise.resolve();
export function saveStudy(key: string, state: StudyState): Promise<void> {
  const snapshot = { ...state, updatedAt: new Date().toISOString() };
  const save = async () => {
    const envelope = await encryptJson(snapshot, key, "study");
    localStorage.setItem(await storageName(key), JSON.stringify(envelope));
  };
  const task = queue.then(save, save);
  queue = task.catch(() => {});
  return task;
}
export async function exportStudy(key: string, state: StudyState) {
  const body = JSON.stringify(await encryptJson(state, key, "study-backup"));
  const url = URL.createObjectURL(
    new Blob([body], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `gongsiru-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importStudy(key: string, file: File) {
  if (file.size > 20_000_000) throw new Error("백업 파일 크기가 너무 큽니다.");
  const next = validateStudy(
    await decryptJson(JSON.parse(await file.text()), key, "study-backup"),
  );
  const name = await storageName(key),
    old = localStorage.getItem(name);
  if (old) localStorage.setItem(name + "-before-restore", old);
  await saveStudy(key, next);
  return next;
}
export function locateHighlight(
  text: string,
  h: Highlight,
): [number, number] | null {
  if (!h.text) return null;
  const context = (pos: number) =>
    (!h.prefix ||
      text.slice(Math.max(0, pos - h.prefix.length), pos) === h.prefix) &&
    (!h.suffix ||
      text.slice(pos + h.text.length, pos + h.text.length + h.suffix.length) ===
        h.suffix);
  if (text.slice(h.start, h.end) === h.text && context(h.start))
    return [h.start, h.end];
  const hits: number[] = [];
  let pos = text.indexOf(h.text);
  while (pos >= 0) {
    if (
      (!h.prefix ||
        text.slice(Math.max(0, pos - h.prefix.length), pos) === h.prefix) &&
      (!h.suffix ||
        text.slice(
          pos + h.text.length,
          pos + h.text.length + h.suffix.length,
        ) === h.suffix)
    )
      hits.push(pos);
    pos = text.indexOf(h.text, pos + 1);
  }
  return hits.length === 1 ? [hits[0], hits[0] + h.text.length] : null;
}
export function reconcileStudy(
  state: StudyState,
  catalog: Catalog,
): StudyState {
  const records = { ...state.records };
  let changed = false;
  for (const e of catalog.entries) {
    const r = records[e.id];
    if (
      r &&
      r.assessmentRevision !== e.assessmentRevision &&
      (r.state !== "unsure" || r.read)
    ) {
      records[e.id] = { ...r, state: "unsure", read: false };
      changed = true;
    }
  }
  return changed ? { ...state, records } : state;
}
