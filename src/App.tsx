import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { openCatalog, openTopic } from "./lib/content";
import {
  loadStudy,
  saveStudy,
  exportStudy,
  importStudy,
  reconcileStudy,
  storageName,
} from "./lib/study";
import {
  type Catalog,
  type StudyState,
  type TopicContent,
  type Highlight,
  defaultFilters,
  defaultStudy,
} from "./lib/model";
import QuestionView from "./components/QuestionView";

export default function App() {
  const [loaded, setLoaded] = useState<{
      catalog: Catalog;
      state: StudyState;
      key: string;
    } | null>(null),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(false);
  const [recovery, setRecovery] = useState<{
    catalog: Catalog;
    key: string;
  } | null>(null);
  useEffect(() => {
    let generation = 0;
    const open = async () => {
      const n = ++generation;
      setLoaded(null);
      setRecovery(null);
      setError("");
      setWaiting(false);
      const key = new URLSearchParams(location.hash.slice(1)).get("key");
      if (!key) return;
      setWaiting(true);
      try {
        const catalog = await openCatalog(key);
        try {
          const state = await loadStudy(key);
          if (n === generation)
            setLoaded({ catalog, state: reconcileStudy(state, catalog), key });
        } catch {
          if (n === generation) {
            setRecovery({ catalog, key });
            setError(
              "학습 자료는 열었지만 저장된 기록을 읽지 못했습니다. 기록을 덮어쓰지 않았습니다. 백업을 복원하거나 기존 기록을 보존하고 새로 시작할 수 있습니다.",
            );
          }
        }
      } catch {
        if (n === generation)
          setError(
            "열쇠가 맞지 않거나 자료를 불러오지 못했습니다. 원래 학습 링크와 연결 상태를 확인해 주세요.",
          );
      } finally {
        if (n === generation) setWaiting(false);
      }
    };
    void open();
    window.addEventListener("hashchange", open);
    return () => {
      generation++;
      window.removeEventListener("hashchange", open);
    };
  }, []);
  if (loaded)
    return (
      <Reader
        key={loaded.key}
        catalog={loaded.catalog}
        initial={loaded.state}
        secret={loaded.key}
      />
    );
  return (
    <>
      <header className="topbar">
        <strong className="wordmark">공시루</strong>
      </header>
      <main className="locked">
        <span className="eyebrow">개인 서재</span>
        <h1>
          {waiting
            ? "서재를 여는 중입니다."
            : recovery
              ? "학습 기록을 확인해 주세요."
              : "학습 링크로 열어 주세요."}
        </h1>
        <p>
          {error ||
            "키가 포함된 주소에서 문제와 해설을 읽을 수 있습니다. 이 페이지에는 공개된 학습 자료가 없습니다."}
        </p>
        {error && (
          <button className="outline-button" onClick={() => location.reload()}>
            다시 시도
          </button>
        )}
        {recovery && (
          <div className="settings-section">
            <label className="field">
              암호화 백업 복원
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const state = await importStudy(recovery.key, file);
                    setLoaded({
                      ...recovery,
                      state: reconcileStudy(state, recovery.catalog),
                    });
                  } catch {
                    setError(
                      "백업을 복원하지 못했습니다. 키·파일 또는 브라우저 저장 공간을 확인해 주세요.",
                    );
                  }
                }}
              />
            </label>
            <button
              className="outline-button"
              onClick={async () => {
                if (
                  !confirm(
                    "기존 암호화 기록을 별도로 보존하고 새 기록으로 시작할까요?",
                  )
                )
                  return;
                try {
                  const name = await storageName(recovery.key),
                    raw = localStorage.getItem(name);
                  if (raw)
                    localStorage.setItem(
                      name + "-before-reset-" + Date.now(),
                      raw,
                    );
                  localStorage.removeItem(name);
                  setLoaded({ ...recovery, state: defaultStudy() });
                } catch {
                  setError(
                    "기존 기록을 보존하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.",
                  );
                }
              }}
            >
              기존 기록 보존 후 새로 시작
            </button>
          </div>
        )}
      </main>
    </>
  );
}
function Reader({
  catalog,
  initial,
  secret,
}: {
  catalog: Catalog;
  initial: StudyState;
  secret: string;
}) {
  const [state, setRawState] = useState<StudyState>(() =>
    reconcileStudy(
      initial.cycleRelease
        ? initial
        : {
            ...initial,
            cycleRelease: catalog.releaseId,
            cycleIds: catalog.entries
              .filter((e) => e.legalStatus !== "changed")
              .map((e) => e.id),
          },
      catalog,
    ),
  );
  const setState: Dispatch<SetStateAction<StudyState>> = (next) =>
    setRawState((p) =>
      reconcileStudy(typeof next === "function" ? next(p) : next, catalog),
    );
  const [chunks, setChunks] = useState<Record<string, TopicContent>>({}),
    [notice, setNotice] = useState(""),
    [panel, setPanel] = useState<
      "filter" | "settings" | "chapters" | "cycle" | null
    >(null),
    [limit, setLimit] = useState(12),
    [selection, setSelection] = useState<Omit<
      Highlight,
      "id" | "color"
    > | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    upload = useRef<HTMLInputElement>(null),
    loading = useRef(new Set<string>());
  const patch = (s: Partial<StudyState>) => setState((p) => ({ ...p, ...s }));
  const papers = useMemo(
    () => new Map(catalog.papers.map((p) => [p.id, p])),
    [catalog],
  );
  const entries = useMemo(
    () =>
      catalog.entries
        .filter((e) => {
          const p = papers.get(e.paperId)!,
            f = state.filters;
          return (
            (f.grade === "all" || String(p.grade) === f.grade) &&
            (f.exam === "all" || p.examType === f.exam) &&
            (f.year === "all" || String(p.year) === f.year) &&
            (f.topic === "all" || e.topicId === f.topic) &&
            (f.includeChanged || e.legalStatus !== "changed") &&
            (!f.onlyUnsure || state.records[e.id]?.state === "unsure")
          );
        })
        .sort((a, b) => {
          const ap = papers.get(a.paperId)!,
            bp = papers.get(b.paperId)!;
          return (
            (state.filters.order === "topic"
              ? catalog.topics.findIndex((t) => t.id === a.topicId) -
                catalog.topics.findIndex((t) => t.id === b.topicId)
              : 0) ||
            bp.year - ap.year ||
            bp.grade - ap.grade ||
            ap.id.localeCompare(bp.id) ||
            a.number - b.number
          );
        }),
    [catalog, papers, state.filters, state.records],
  );
  const index = Math.max(
    0,
    entries.findIndex((e) => e.id === state.currentId),
  );
  const visible =
    state.mode === "single"
      ? entries.slice(index, index + 1)
      : entries.slice(0, Math.max(limit, index + 1));
  const needed = Array.from(new Set(visible.map((e) => e.topicId))).join(",");
  useEffect(() => {
    for (const id of needed.split(",").filter(Boolean)) {
      if (chunks[id] || loading.current.has(id)) continue;
      loading.current.add(id);
      openTopic(catalog, id, secret)
        .then((c) => setChunks((p) => ({ ...p, [id]: c })))
        .catch(() =>
          setNotice(
            "단원 자료를 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.",
          ),
        )
        .finally(() => loading.current.delete(id));
    }
  }, [needed, catalog, secret, chunks]);
  useEffect(() => {
    saveStudy(secret, state).catch(() =>
      setNotice(
        "학습 기록을 저장하지 못했습니다. 저장 공간을 확인하고 백업을 내려받아 주세요.",
      ),
    );
  }, [secret, state]);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  const resumed = useRef(!initial.currentId);
  useEffect(() => {
    if (
      !resumed.current &&
      state.mode === "continuous" &&
      state.currentId &&
      document.getElementById("question-" + state.currentId)
    ) {
      resumed.current = true;
      document.getElementById("question-" + state.currentId)?.scrollIntoView();
    }
  }, [chunks, state.currentId, state.mode]);
  useEffect(() => {
    if (state.mode !== "continuous") return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("[data-qid]"),
        );
        const el = els.find((el) => el.getBoundingClientRect().bottom > 100);
        if (el)
          setState((p) =>
            p.currentId === el.dataset.qid
              ? p
              : { ...p, currentId: el.dataset.qid! },
          );
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, [state.mode]);
  const filter = (key: string, value: string | boolean) => {
    setLimit(12);
    window.scrollTo({ top: 0 });
    setState((p) => ({
      ...p,
      currentId: "",
      filters: { ...p.filters, [key]: value },
    }));
  };
  function jump(n: number) {
    const target = entries[n];
    if (target) {
      patch({ currentId: target.id });
      if (state.mode === "single") window.scrollTo({ top: 0 });
      else
        requestAnimationFrame(() =>
          document.getElementById("question-" + target.id)?.scrollIntoView(),
        );
    }
  }
  function capture() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || s.rangeCount === 0) return;
    const r = s.getRangeAt(0),
      el = (
        r.startContainer.nodeType === 1
          ? r.startContainer
          : r.startContainer.parentElement
      ) as Element;
    const block = el.closest<HTMLElement>("[data-block]");
    if (!block || !block.contains(r.endContainer)) return;
    const prefix = r.cloneRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(r.startContainer, r.startOffset);
    const start = prefix.toString().length,
      text = r.toString(),
      whole = block.textContent || "",
      questionId = block.dataset.question!;
    setSelection({
      questionId,
      blockId: block.dataset.block!,
      text,
      start,
      end: start + text.length,
      prefix: whole.slice(Math.max(0, start - 24), start),
      suffix: whole.slice(start + text.length, start + text.length + 24),
      revision: catalog.entries.find((e) => e.id === questionId)!.revision,
    });
  }
  const readCount = state.cycleIds.filter(
    (id) => state.records[id]?.read,
  ).length;
  const chapters = (
    <nav aria-label="단원">
      <button
        className={state.filters.topic === "all" ? "chapter active" : "chapter"}
        onClick={() => {
          filter("topic", "all");
          setPanel(null);
        }}
      >
        전체 문제 <span>{catalog.entries.length}</span>
      </button>
      {catalog.topics
        .filter((t) => catalog.entries.some((e) => e.topicId === t.id))
        .map((t) => (
          <button
            className={
              state.filters.topic === t.id ? "chapter active" : "chapter"
            }
            key={t.id}
            onClick={() => {
              filter("topic", t.id);
              setPanel(null);
            }}
          >
            {t.title}
            <span>
              {catalog.entries.filter((e) => e.topicId === t.id).length}
            </span>
          </button>
        ))}
    </nav>
  );
  const modes = (
    <div className="mode-switch" aria-label="읽기 방식">
      {(["continuous", "single"] as const).map((m) => (
        <button
          key={m}
          aria-pressed={state.mode === m}
          onClick={() => patch({ mode: m })}
        >
          {m === "continuous" ? "이어 읽기" : "한 문제씩"}
        </button>
      ))}
    </div>
  );
  return (
    <div style={{ "--body-size": state.fontSize + "px" } as CSSProperties}>
      <header className="topbar">
        <strong className="wordmark">공시루</strong>
        <span className="subject-label">행정법</span>
        <div className="header-tools">
          {modes}
          <button className="text-button" onClick={() => setPanel("filter")}>
            범위 설정
          </button>
          <button className="text-button" onClick={() => setPanel("settings")}>
            읽기 설정
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <div className="cycle-heading">
          <span>{state.cycle}회독</span>
          <strong>
            {readCount} <small>/ {state.cycleIds.length}</small>
          </strong>
        </div>
        <progress
          aria-label="이번 회독 읽은 문항"
          value={readCount}
          max={state.cycleIds.length || 1}
        />
        {chapters}
        <button
          className="outline-button next-cycle"
          onClick={() => setPanel("cycle")}
        >
          다음 회독 시작
        </button>
        <p className="sidebar-note">
          해설 근거 대조 {catalog.counts.verified} / {catalog.counts.questions}
          <br />
          미검증 내용은 별도로 표시합니다.
        </p>
      </aside>
      <div className="mobile-tools">
        <button className="text-button" onClick={() => setPanel("chapters")}>
          단원 · {state.cycle}회독
        </button>
        {modes}
        <button className="text-button" onClick={() => setPanel("filter")}>
          범위
        </button>
        <button className="text-button" onClick={() => setPanel("settings")}>
          설정
        </button>
      </div>
      <main className="reading-area" onMouseUp={capture} onTouchEnd={capture}>
        <div className="reading-header">
          <div>
            <span className="eyebrow">행정법 · {state.cycle}회독</span>
            <h1>
              {catalog.topics.find((t) => t.id === state.filters.topic)
                ?.title || "전체 문제"}
            </h1>
          </div>
          <span>
            {entries.length ? index + 1 : 0} / {entries.length}
          </span>
        </div>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="text-button" onClick={() => setNotice("")}>
              닫기
            </button>
          </div>
        )}
        {entries.length === 0 && (
          <div className="empty">
            <h2>이 범위에는 문제가 없습니다.</h2>
            <button
              className="outline-button"
              onClick={() => patch({ filters: { ...defaultFilters } })}
            >
              필터 초기화
            </button>
          </div>
        )}
        {visible.map((entry) => {
          const c = chunks[entry.topicId],
            q = c?.questions.find((q) => q.id === entry.id);
          return q ? (
            <QuestionView
              key={q.id}
              q={q}
              e={c.explanations.find((e) => e.questionId === q.id)}
              p={papers.get(q.paperId)!}
              state={state}
              onCurrent={() =>
                setState((p) =>
                  p.currentId === q.id ? p : { ...p, currentId: q.id },
                )
              }
              onRecord={(r) =>
                setState((p) => ({
                  ...p,
                  records: { ...p.records, [q.id]: r },
                }))
              }
              onRead={() =>
                setState((p) => ({
                  ...p,
                  records: {
                    ...p.records,
                    [q.id]: {
                      state: p.records[q.id]?.state || "keep",
                      read: !p.records[q.id]?.read,
                      assessmentRevision: q.assessmentRevision || 1,
                    },
                  },
                }))
              }
              onRemove={(id) =>
                setState((p) => ({
                  ...p,
                  highlights: p.highlights.filter((h) => h.id !== id),
                }))
              }
            />
          ) : (
            <div className="loading-question" key={entry.id}>
              문제를 불러오는 중…
            </div>
          );
        })}
        {state.mode === "single" ? (
          <div className="paging">
            <button
              className="outline-button"
              disabled={index === 0}
              onClick={() => jump(index - 1)}
            >
              이전 문제
            </button>
            <span>
              {index + 1} / {entries.length}
            </span>
            <button
              className="primary-button"
              disabled={index >= entries.length - 1}
              onClick={() => jump(index + 1)}
            >
              다음 문제
            </button>
          </div>
        ) : visible.length < entries.length ? (
          <button
            className="outline-button load-more"
            onClick={() => setLimit(Math.max(limit, index + 1) + 12)}
          >
            다음 12문항 읽기
          </button>
        ) : (
          entries.length > 0 && (
            <p className="end-note">선택한 범위의 마지막 문제입니다.</p>
          )
        )}
      </main>
      {selection && (
        <div className="highlight-tools" role="toolbar" aria-label="형광펜">
          <span>선택한 문장</span>
          {(["yellow", "pink"] as const).map((color) => (
            <button
              key={color}
              className={color}
              onClick={() => {
                setState((p) => ({
                  ...p,
                  highlights: [
                    ...p.highlights.filter(
                      (h) =>
                        !(
                          h.questionId === selection.questionId &&
                          h.blockId === selection.blockId &&
                          h.start < selection.end &&
                          h.end > selection.start
                        ),
                    ),
                    { ...selection, id: crypto.randomUUID(), color },
                  ],
                }));
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              {color === "yellow" ? "중요" : "반대·예외"}
            </button>
          ))}
          <button className="text-button" onClick={() => setSelection(null)}>
            취소
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setPanel(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setPanel(null);
        }}
      >
        <div className="panel">
          <div className="panel-heading">
            <h2>
              {
                {
                  filter: "학습 범위",
                  settings: "읽기 설정",
                  chapters: "단원",
                  cycle: "다음 회독",
                }[panel || "settings"]
              }
            </h2>
            <button className="text-button" onClick={() => setPanel(null)}>
              닫기
            </button>
          </div>
          {panel === "chapters" && (
            <>
              {chapters}
              <p>
                {readCount} / {state.cycleIds.length}문항 읽음
              </p>
              <button
                className="outline-button"
                onClick={() => setPanel("cycle")}
              >
                다음 회독 시작
              </button>
            </>
          )}
          {panel === "filter" && (
            <>
              <label className="field">
                급수
                <select
                  value={state.filters.grade}
                  onChange={(e) => filter("grade", e.target.value)}
                >
                  <option value="all">9급 + 7급</option>
                  <option value="9">9급</option>
                  <option value="7">7급</option>
                </select>
              </label>
              <label className="field">
                시험
                <select
                  value={state.filters.exam}
                  onChange={(e) => filter("exam", e.target.value)}
                >
                  <option value="all">국가직 + 지방직</option>
                  <option value="national">국가직</option>
                  <option value="local">지방직</option>
                </select>
              </label>
              <label className="field">
                연도
                <select
                  value={state.filters.year}
                  onChange={(e) => filter("year", e.target.value)}
                >
                  <option value="all">전체 연도</option>
                  {Array.from(new Set(catalog.papers.map((p) => p.year)))
                    .sort((a, b) => b - a)
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select>
              </label>
              <label className="field">
                정렬
                <select
                  value={state.filters.order}
                  onChange={(e) => filter("order", e.target.value)}
                >
                  <option value="topic">단원별</option>
                  <option value="paper">시험·연도별</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={state.filters.includeChanged}
                  onChange={(e) => filter("includeChanged", e.target.checked)}
                />
                법령·판례 변경 문항 포함
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={state.filters.onlyUnsure}
                  onChange={(e) => filter("onlyUnsure", e.target.checked)}
                />
                헷갈리는 문항만
              </label>
              <p className="small-notice">
                필터는 읽을 범위만 바꿉니다. 이번 회독의 전체 문항 수는
                유지됩니다.
              </p>
            </>
          )}
          {panel === "settings" && (
            <>
              <label className="field">
                글자 크기
                <select
                  value={state.fontSize}
                  onChange={(e) =>
                    patch({ fontSize: Number(e.target.value) as 16 | 18 | 20 })
                  }
                >
                  <option value="16">작게 · 16</option>
                  <option value="18">기본 · 18</option>
                  <option value="20">크게 · 20</option>
                </select>
              </label>
              {(
                [
                  ["hideAnswers", "정답·해설 가리기"],
                  ["collapseKnown", "익숙한 문항 접기"],
                  ["onlyHighlights", "형광펜 표시한 부분만 보기"],
                ] as const
              ).map(([k, label]) => (
                <label className="check" key={k}>
                  <input
                    type="checkbox"
                    checked={state[k]}
                    onChange={(e) => patch({ [k]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <div className="settings-section">
                <h3>학습 기록</h3>
                <p className="small-notice">
                  이 브라우저에 암호화해 저장합니다. 다른 기기로 옮기거나
                  브라우저 데이터를 지우기 전에 백업해 주세요.
                </p>
                <button
                  className="outline-button"
                  onClick={() =>
                    exportStudy(secret, state).catch(() =>
                      setNotice("백업을 만들지 못했습니다."),
                    )
                  }
                >
                  암호화 백업
                </button>{" "}
                <button
                  className="outline-button"
                  onClick={() => upload.current?.click()}
                >
                  백업 복원
                </button>
                <input
                  hidden
                  ref={upload}
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (
                      !file ||
                      !confirm(
                        "현재 기록을 백업 내용으로 바꿀까요? 기존 암호화 기록도 별도로 보관합니다.",
                      )
                    )
                      return;
                    try {
                      setState(await importStudy(secret, file));
                      setPanel(null);
                      setNotice("학습 기록을 복원했습니다.");
                    } catch {
                      setNotice("키가 맞지 않거나 백업 파일이 손상되었습니다.");
                      setPanel(null);
                    }
                  }}
                />
              </div>
              <div className="settings-section">
                <p className="small-notice">
                  링크를 가진 사람은 내용을 열 수 있습니다. 링크를 공유하지
                  마세요.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    location.hash = "";
                  }}
                >
                  서재 잠그기
                </button>
              </div>
            </>
          )}
          {panel === "cycle" && (
            <>
              <p>
                현재 선택한 {entries.length}문항으로 {state.cycle + 1}회독을
                시작합니다. 익숙한 정도와 형광펜은 유지하고 읽음 표시만
                초기화합니다.
              </p>
              <button
                className="primary-button"
                disabled={!entries.length}
                onClick={() => {
                  setState((p) => ({
                    ...p,
                    cycle: p.cycle + 1,
                    cycleIds: entries.map((e) => e.id),
                    cycleRelease: catalog.releaseId,
                    currentId: entries[0]?.id || "",
                    records: Object.fromEntries(
                      Object.entries(p.records).map(([id, r]) => [
                        id,
                        { ...r, read: false },
                      ]),
                    ),
                  }));
                  setPanel(null);
                  window.scrollTo({ top: 0 });
                }}
              >
                새 회독 시작
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
