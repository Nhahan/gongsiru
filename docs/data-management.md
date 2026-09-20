# 자료 관리

## 파일 단위와 식별자

개인 자료 루트 기본값은 저장소 옆 `gongsiru-private/`입니다. `GONGSIRU_CONTENT_ROOT` 또는 명령의 `--root`로 바꿀 수 있습니다. 공개 저장소 안의 경로는 거부합니다.

```text
개인 자료 루트/
  imported/papers.json          원본 시험 메타데이터
  imported/questions/*.json    PDF에서 추출한 문항
  explanations/*.json          출처를 포함한 해설 입력
  research/<분류>/topics.json   문항 ID → 단원 ID
  research/<분류>/verification.json 선지별 공식 근거·현행법 검토 기록
  research/source-review/grade{7,9}.json 원본 이미지 대조·교정 기록
  content/
    papers.json, topics.json
    questions/<문항 ID>.json    편집 가능한 정규 원문
    explanations/<문항 ID>.json
    references/<출처 ID>.json   공유 근거 자료
  import-state.json             수입 충돌 탐지 기준
  reports/                     검증·변경·충돌 보고서
  releases/                    배포 당시 평문 스냅숏(비공개)
  secrets/content.key          개인키(커밋 금지)
  secrets/study-link.txt        개인 링크(커밋 금지)
```

문항 ID는 과목·시험·급수·시험연도·회차·책형·번호의 조합입니다. 단원과 표시 순서를 바꿔도 ID는 바꾸지 않습니다. 시행 연도와 실제 시행일은 별도입니다. 원본 PDF SHA-256과 공식 문제·정답 출처를 시험 단위에 보존합니다. 출처 ID는 URL·조문·사건번호·시행일의 해시입니다.

공개 `schema/content.schema.json`이 형식의 기준이며 TypeScript 타입은 자동 생성합니다. 타입 파일을 직접 고치지 않습니다. 새 과목도 동일한 문항·해설 스키마를 재사용할 수 있으나, 현재 화면과 기본 분류는 행정법 전용입니다.

## 작업 순서

```sh
# 1. 개인 공간의 PDF 추출 도구로 imported/를 준비한 뒤
npm run content:import

# 2. 누락·중복·답지·근거 연결 검사
npm run content:validate -- --strict

# 3. 내용·정답·분류·해설 변경 확인
npm run content:diff

# 4. 전체 원문과 해설 검증을 마친 정식 자료 배포
npm run content:release

# 검토 중 상태를 그대로 표시하는 프로토타입만 명시적으로 허용
npm run content:release -- --allow-unverified

# 5. 공개 파일 안전 검사 후 앱 검사·빌드
npm run check:public
npm test
npm run build

# 실제 사이트에서 모든 암호문을 내려받아 로컬에서 복호화·개수 검사
node tools/verify-deployment.mjs --strict
```

`content:import`는 같은 입력에 재실행할 수 있습니다. 정규 파일을 수동 편집한 상태에서 수입 내용도 바뀌면 덮어쓰지 않고 충돌 보고서를 생성합니다. 변경한 정규 파일을 유지할지 새 수입본을 채택할지 직접 대조해 결정하세요. 공통 출처의 표시 이름은 정렬상 첫 입력을 사용합니다. 독립적인 근거라면 다른 조문/사건번호/시행일을 지정해야 합니다.

검토 작업의 원문 교정은 `research/source-review/`의 `corrected`에, 해설은 `explanations/`에 반영한 뒤 다시 수입합니다. 정규 파일을 직접 수정할 수도 있지만, 정식 배포에서는 검토본과 정규 파일이 일치해야 합니다. 수정 후 반드시 validate·diff를 실행합니다. 배포 시 이전 배포본과 비교하여 본문·정답 버전의 하한을 보정하므로 수동 수정도 학습 기록 갱신에서 누락되지 않습니다. 정규 JSON의 revision보다 배포판 revision이 높을 수 있습니다.

충돌 항목과 새 입력은 개인 `reports/import-conflicts.json`, `reports/import-pending.json`에서 대조합니다. 결정한 뒤 다음 중 하나를 실행합니다. 해결 전에는 배포를 차단합니다.

```sh
npm run content:resolve -- --item question:문항ID --keep-local
# 또는 새 수입본 채택(현재 편집본을 대체하므로 먼저 비교)
npm run content:resolve -- --item question:문항ID --use-incoming
```

`explanation:문항ID`, `reference:출처ID`, `metadata:papers`도 같은 방식입니다. 로컬 유지로 결정하면 다음 입력 변경도 자동 덮어쓰지 않고 다시 충돌로 표시합니다. `--output`은 암호문을 다른 디렉터리로 내보내거나 격리 테스트할 때 사용하며 기본값은 `public/data`입니다.

정답 없는 문항은 `answer.status=cancelled`, 잠정 답안은 `provisional`로 구분합니다. 최종답안이 발표되면 실제 공식표를 대조한 뒤 답안 상태·출처를 수정합니다. 과거 출제문은 현행법에 맞춰 바꾸지 않습니다. 현행법 변화는 해설의 `legalStatus=changed`와 `currentNote`에 따로 기록합니다.

## 검증 기준

| 필드                     | 뜻                                            |
| ------------------------ | --------------------------------------------- |
| `sourceVerified`         | 원본 이미지와 문항의 내용 대조 완료           |
| `status=needs-review`    | 해설 초안, 근거/법리의 추가 검토 필요         |
| `status=verified`        | 모든 선택지 설명·개별 근거와 현행법 검토 완료 |
| `legalStatus=unreviewed` | 현재 적용되는 법령·판례와 대조 미완료         |
| `legalStatus=changed`    | 과거와 현재 판단이 달라질 수 있음             |

자동 검사는 법률 해설의 진실성을 증명하지 않습니다. `verified`는 모든 선택지·근거 연결·확인일·현행법 상태를 요구하지만, 실제 공식 법령·판례를 읽고 판단하는 내용 검토는 별도로 수행해야 합니다. AI가 검토한 자료를 사람이나 법률전문가가 감수했다고 표시하지 않습니다. 답만 보고 나머지 선택지를 모두 거짓으로 표시하면 안 됩니다. 조합형은 개별 보기와 답지 조합을 구분하세요.

`content:validate -- --strict`와 정식 배포는 검토 기록까지 대조합니다. `sourceVerified`를 직접 켜는 것으로는 통과하지 않습니다. 원문 기록은 문항 ID, PDF 해시, 검토 페이지, 확인일, `method=rendered-pdf-visual`, 대조 메모와 `sourceContentHash`를 보존합니다. 이 해시는 `SHA256(JSON.stringify([raw.stem, raw.context || '', raw.choices]))`입니다. 교정 가능한 필드는 `stem`, `context`, `choices`뿐이며 답안과 문항 식별자는 교정 기록으로 바꿀 수 없습니다.

해설 기록은 문항 ID·확인일·`optionEvidence`·`currentLawCheck`·`explanationHash`를 보존합니다. 모든 선지에 실제 읽은 근거 ID와 적용 이유가 있어야 합니다. 해설 해시는 `SHA256(JSON.stringify(rawExplanation))`이며, 근거 ID는 수입 전 해설 파일의 ID를 사용합니다. 해설을 수정하면 해당 검토도 갱신해야 합니다. 검토 기록은 비공개 공간에 남고 사이트에는 포함하지 않습니다.

## 롤백과 백업

```sh
npm run content:rollback -- --release 배포판ID
npm run check:public
```

이전 암호화 배포판은 보존합니다. 롤백은 공개 포인터와 개인 diff 기준을 함께 복원합니다. 이후 변경을 GitHub에 반영해야 사이트도 갱신됩니다. 학습 기록은 롤백하지 않습니다.

개인 자료 루트의 `content/`, `research/`, 추출 도구·원본 PDF, `releases/`를 백업하세요. 키는 자료와 별도로 보관합니다. 로컬 Git은 초기화하지만 원격 저장소로 자동 전송하지 않습니다. 키를 커밋하지 않는 것은 암호문 백업과 별개의 필수 조건입니다.
