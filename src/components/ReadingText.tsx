import type { Highlight } from "../lib/model";
import { locateHighlight } from "../lib/study";
export default function ReadingText({
  text,
  blockId,
  questionId,
  highlights,
  onRemove,
}: {
  text: string;
  blockId: string;
  questionId: string;
  highlights: Highlight[];
  onRemove: (id: string) => void;
}) {
  const ranges = highlights
    .filter((h) => h.blockId === blockId && h.questionId === questionId)
    .map((h) => ({ h, range: locateHighlight(text, h) }))
    .filter((x) => x.range !== null)
    .sort((a, b) => a.range![0] - b.range![0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const { h, range } of ranges) {
    const [start, end] = range!;
    if (start < cursor) continue;
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        className={h.color}
        key={h.id}
        role="button"
        tabIndex={0}
        aria-label={`형광펜 지우기: ${h.text}`}
        title="표시 지우기"
        onClick={() => onRemove(h.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRemove(h.id);
          }
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  const orphaned = highlights.filter(
    (h) =>
      h.blockId === blockId &&
      h.questionId === questionId &&
      locateHighlight(text, h) === null,
  );
  parts.push(text.slice(cursor));
  return (
    <>
      <span
        data-block={blockId}
        data-question={questionId}
        className="reading-text"
      >
        {parts}
      </span>
      {orphaned.length > 0 && (
        <span className="orphaned-marks">
          본문 변경으로 위치를 찾지 못한 형광펜{" "}
          {orphaned.map((h) => (
            <button
              key={h.id}
              className="text-button"
              title="기존 표시 삭제"
              onClick={() => onRemove(h.id)}
            >
              “{h.text.slice(0, 30)}” 지우기
            </button>
          ))}
        </span>
      )}
    </>
  );
}
