import { useState } from "react";
import type {
  Question,
  Explanation,
  Paper,
  StudyState,
  ReadingRecord,
  Highlight,
} from "../lib/model";
import ReadingText from "./ReadingText";
import { readingText, splitStem } from "../lib/typography";
const labels = { keep: "계속 보기", unsure: "헷갈림", known: "익숙함" };
export const choiceLabel = (id: string) =>
  String.fromCodePoint(0x2460 + "abcd".indexOf(id));
function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export default function QuestionView({
  q,
  e,
  p,
  state,
  onRecord,
  onRead,
  onRemove,
  onCurrent,
}: {
  q: Question;
  e?: Explanation;
  p: Paper;
  state: StudyState;
  onRecord: (r: ReadingRecord) => void;
  onRead: () => void;
  onRemove: (id: string) => void;
  onCurrent: () => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [showAll, setShowAll] = useState(false),
    [showDraft, setShowDraft] = useState(false),
    [reveal, setReveal] = useState(false);
  const record = state.records[q.id] || {
    state: "keep",
    read: false,
    assessmentRevision: q.assessmentRevision || 1,
  };
  const revisionChanged =
    record.assessmentRevision !== (q.assessmentRevision || 1);
  const collapsed =
    record.state === "known" &&
    state.collapseKnown &&
    !expanded &&
    !revisionChanged;
  const marks = state.highlights.filter((h) => h.questionId === q.id);
  const markedOnly = state.onlyHighlights && !showAll;
  const text = (s: string, id: string) => (
    <ReadingText
      text={id === "context" ? s : readingText(s)}
      blockId={id}
      questionId={q.id}
      highlights={marks}
      onRemove={onRemove}
    />
  );
  const stem = splitStem(q.stem);
  const hasMark = (id: string) => marks.some((h) => h.blockId === id);
  const renderText = (s: string, id: string) =>
    !markedOnly || hasMark(id) ? text(s, id) : null;
  return (
    <article
      className={`question ${collapsed ? "collapsed" : ""}`}
      id={`question-${q.id}`}
      data-qid={q.id}
      onFocus={onCurrent}
      onPointerDown={onCurrent}
    >
      <div className="question-meta">
        <span>
          {p.year} {p.examType === "national" ? "국가직" : "지방직"} {p.grade}급
          {p.round !== "regular"
            ? ` · ${p.round === "labor" ? "근로감독" : "추가시험"}`
            : ""}
        </span>
        <span>
          {q.number}번 <span className="booklet">· {p.booklet}책형</span>
        </span>
        {record.read && <span className="read-label">읽음</span>}
        {collapsed && (
          <button className="text-button" onClick={() => setExpanded(true)}>
            펼치기
          </button>
        )}
      </div>
      {collapsed ? (
        <div className="collapsed-summary">{q.stem}</div>
      ) : (
        <>
          {revisionChanged && (
            <div className="notice">
              정답 정보가 변경됐습니다. 다시 확인해 주세요.
            </div>
          )}
          {!q.sourceVerified && (
            <div className="small-notice">
              원문 대조 진행 중 · 표현이 이상하면 공식 원문을 확인해 주세요.
            </div>
          )}
          {!state.cycleIds.includes(q.id) && (
            <p className="small-notice">
              이번 회독의 범위 밖 문항입니다. 읽음 표시는 보관하며 다음 회독에
              포함할 수 있습니다.
            </p>
          )}
          <h2 className="question-stem">{text(stem.prompt, "stem")}</h2>
          {stem.cases && (
            <div className="question-context">
              {text(stem.cases, "stem:cases")}
            </div>
          )}
          {q.context && (!markedOnly || hasMark("context")) && (
            <div className="question-context">{text(q.context, "context")}</div>
          )}
          <ol className="choices">
            {q.choices.map((c) => {
              const content = renderText(c.text, `choice:${c.id}`);
              return (
                content && (
                  <li key={c.id}>
                    <span className="choice-number">{choiceLabel(c.id)}</span>
                    <div>{content}</div>
                  </li>
                )
              );
            })}
          </ol>
          {markedOnly && (
            <button
              className="text-button restore-context"
              onClick={() => setShowAll(true)}
            >
              문제·해설 전체 보기
            </button>
          )}
          {state.hideAnswers && !reveal ? (
            <button
              className="outline-button reveal"
              onClick={() => setReveal(true)}
            >
              정답·해설 보기
            </button>
          ) : (
            <section className="explanation" aria-label="정답과 해설">
              <div className="answer-row">
                <strong>
                  {q.answer.status === "cancelled"
                    ? "정답 없음 · 전원 정답"
                    : `정답 ${q.answer.choices.map(choiceLabel).join(", ")}`}
                </strong>
                {q.answer.status === "provisional" && (
                  <span className="notice-label">정답가안</span>
                )}
                {state.hideAnswers && (
                  <button
                    className="text-button"
                    onClick={() => setReveal(false)}
                  >
                    다시 가리기
                  </button>
                )}
              </div>
              {e?.legalStatus === "changed" && (
                <div className="notice">
                  <strong>법령·판례 변경</strong>
                  <p>
                    {e.currentNote ||
                      "당시 정답과 현재 판단을 구분해 읽어 주세요."}
                  </p>
                </div>
              )}
              {!e ? (
                <p className="pending-explanation">
                  선지별 해설을 검증하고 있습니다. 현재는 공식 정답과 문제
                  원문을 볼 수 있습니다.
                </p>
              ) : (
                <>
                  <div className="explanation-status">
                    {e.status === "verified"
                      ? `근거 대조 완료 · ${e.checkedAt}`
                      : "검토 중인 해설 · 확정 해설이 아닙니다"}
                    {e.legalStatus === "unreviewed"
                      ? " · 현행법 대조 미완료"
                      : ""}
                  </div>
                  {e.status !== "verified" && !showDraft ? (
                    <button
                      className="outline-button"
                      onClick={() => setShowDraft(true)}
                    >
                      검토 중 해설 펼치기
                    </button>
                  ) : (
                    <>
                      {e.summary && (
                        <p>{renderText(e.summary, "explanation:summary")}</p>
                      )}
                      <div className="option-explanations">
                        {e.options.map((o) => (
                          <div className="option-explanation" key={o.choiceId}>
                            <div className="option-heading">
                              <span>{choiceLabel(o.choiceId)}</span>
                              <span className="verdict">
                                {
                                  {
                                    true: "옳은 내용",
                                    false: "옳지 않은 내용",
                                    conditional: "조건 확인",
                                    unknown: "판단 검토 중",
                                  }[o.verdict]
                                }
                              </span>
                            </div>
                            <p>
                              {renderText(o.text, `explanation:${o.choiceId}`)}
                            </p>
                          </div>
                        ))}
                      </div>
                      {e.currentNote && e.legalStatus !== "changed" && (
                        <p className="small-notice">{e.currentNote}</p>
                      )}
                      {e.references.length > 0 && (
                        <details className="references">
                          <summary>
                            법령·판례 근거 {e.references.length}건
                          </summary>
                          <ul>
                            {e.references.map((r) => (
                              <li key={r.id}>
                                <a
                                  href={safeUrl(r.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {r.label}
                                </a>
                                {r.article && <span> · {r.article}</span>}
                                {r.caseNumber && <span> · {r.caseNumber}</span>}
                                <small>
                                  {r.effectiveDate
                                    ? `시행 ${r.effectiveDate} · `
                                    : ""}
                                  확인 {r.checkedAt}
                                </small>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="source-links">
                <a
                  href={safeUrl(p.sourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  공식 문제 원문 · {q.sourcePage}쪽
                </a>
                <a
                  href={safeUrl(p.answerSourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  공식 정답표
                </a>
              </div>
            </section>
          )}
        </>
      )}
      <div className="question-actions">
        <div className="status-options" aria-label="익숙한 정도">
          {(["keep", "unsure", "known"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={record.state === s && !revisionChanged}
              className={record.state === s ? "selected" : ""}
              onClick={() =>
                onRecord({
                  ...record,
                  state: s,
                  assessmentRevision: q.assessmentRevision || 1,
                })
              }
            >
              {labels[s]}
            </button>
          ))}
        </div>
        <button
          className={`read-button ${record.read ? "is-read" : ""}`}
          disabled={revisionChanged}
          title={
            revisionChanged
              ? "수정된 내용을 확인하고 익숙한 정도를 다시 선택해 주세요."
              : undefined
          }
          onClick={onRead}
        >
          {record.read ? "읽음 취소" : "읽음 표시"}
        </button>
      </div>
    </article>
  );
}
