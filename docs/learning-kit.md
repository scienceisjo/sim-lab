# 두 모드와 공통 학습 부품

정본 API는 `labs/_kit/kit.js` 머리 주석이다. `lab.mode`는 활동 모드(model/learn), `lab.state.mode`는 개별 실험의 조작값이다. 서로 섞지 않는다.

## 표시와 물리의 분리

- `cfg.step(dt, lab)`와 `cfg.draw(ctx, lab)`는 두 모드가 공유한다. 고정 DT를 사용한다.
- `lab.modelVisible`이 false이면 힘 화살표·설명·자국 등 보조 층을 끈다. 물리 상태는 유지한다.
- `lab.ui.learnOnly(element)`는 학습 부품을 모형 모드에서 숨긴다.
- `lab.measure(id, exactValue, {amplitude, fresh, zero})`는 학습 모드에서만 독립 균등 오차를 더한다. 기본적으로 250 ms 동안 같은 읽음값을 유지하고, `fresh:true`이면 다시 잰다. 영점은 0에 고정한다(`zero:false`로 바꿀 수 있음). 반환값을 물리 엔진이나 힘 화살표 길이에 넣지 않는다.
- `cfg.onModeChange`에서 실험을 멈추고 진행 중 실험·미션 증거를 초기화한다. 이미 완료한 미션과 저장된 기록은 유지한다.
- `cfg.assumptions`는 학생용 가정 3~5문장, `cfg.sceneNote`는 실험판 아래의 추가 설명이다.

## 기록장

```js
const book = lab.ui.records({
  id:'trials', version:1,
  columns:[
    {key:'condition',label:'조건'},
    {key:'force',label:'힘(N)',numeric:true,digits:2}
  ],
  conditions:['condition'], measure:'force', x:'condition', y:'force',
  validate: row => row.force >= 0
});
book.add({condition:'조건 A', force:measuredValue});
```

- 열 정의와 `validate`로 저장값을 검증한다. `format`은 표시용이며 원본 값으로 조건을 묶는다.
- `conditions`가 모두 같은 행끼리 `measure`의 산술평균을 구한다. 평균도 오차가 남을 수 있음을 안내한다.
- 가로축은 숫자 또는 범주, 세로축은 숫자다. 산점도는 선으로 잇지 않는다. 정확히 같은 데이터의 표가 바로 아래 있다. 모바일은 그래프 내부만 좌우로 이동한다.
- 저장 키: `cs-lab-<id>-v<cfg.version>-records-<recordId>-v<recordVersion>`.
- 모형 모드의 `add`는 거부한다. 500행까지 저장하고 한도를 안내한다. CSV는 UTF-8 BOM·CRLF·따옴표 escaping을 쓰며 숫자의 음수는 보존한다.
- `legacy:{key,convert}`로 이전 데이터를 한 번 이관할 수 있다. 모르는 조건을 지어내지 않는다. 이전 행의 미션 증거는 지운다.
- 미션의 다시 하기는 모든 기록장·문제·설계·진도를 함께 초기화한다. 실험의 처음부터는 조건을 유지하고 운동만 초기화한다.

## 변인 고르기와 확인 문제

```js
variables:{
  options:[['surface','접촉면'],['weight','전체 무게'],['force','측정한 힘']],
  change:'surface', keep:['weight'], measure:'force', recordId:'trials'
}
```

정확한 역할을 제출한 뒤, 그 설계와 현재 미션에 연결된 기록 2개 이상에서 독립 변인은 서로 달라야 하고 모든 통제 변인은 같아야 통과한다. 설계를 바꾸면 다시 제출하고 새 기록을 모은다. 반복 측정만으로 통과하지 않는다. 설계 제출은 결과 예측 문항과 별개다.

`cfg.quiz`는 `{kind,question,options,answer,feedback}`의 배열(2~4문항)이다. 선택한 선지만 확인하며 오답별 이유를 제공한다. 서술형 자동 채점은 하지 않는다. 퀴즈는 실험 미션 진행 점과 별도로 저장한다.

`lab.ui.graphData({columns,getRows})`는 캔버스 시간 그래프의 표를 제공한다. 펼치거나 새로 고침하면 그 시점의 데이터를 읽는다. 원래 그래프는 계속 재생할 수 있으므로 표가 어느 시점인지 명시한다.

## 검증 실행

Node와 Chrome, puppeteer-core 23이 있는 환경에서 워크트리 루트를 127.0.0.1의 7100~7199 포트로 제공한다. 아래 기본 주소는 7101이다. 사용자 프로필 대신 임시 브라우저 프로필을 사용한다.

```powershell
$env:PUPPETEER_PATH = '설치된 puppeteer-core 패키지의 절대 경로'
$env:TEST_OUTPUT = '스크린샷과 결과를 저장할 절대 경로'
$env:LAB_URL = 'http://127.0.0.1:7101'
node tests/phase1.cjs
node tests/phase1-edge.cjs
```

기본 Chrome 경로는 Windows Program Files 아래다. 필요하면 `CHROME_PATH`로 바꾼다. 검증 도구는 테스트용 기기의 localStorage를 지우므로 실제 수업 프로필에 연결하지 않는다. 인계된 `fbv2.mjs`, `frtest2.mjs`, `kitcheck.mjs`는 URL에 `?mode=learn` 또는 `?mode=model`을 붙여 실행한다. 이전 마찰 기록 키 참조는 `lab.recordBooks.trials.rows`로 바꾸면 된다.
