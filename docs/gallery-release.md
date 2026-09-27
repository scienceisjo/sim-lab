# CLICK SCIENCE 갤러리 등록과 공개 배포

2026-09-27 사용자의 명시 요청에 따라 교육과정 실험실을 메인 갤러리에 등록하고 기존 GitHub Pages 배포 경로에 반영한다. 앞선 curriculum-review.md의 ‘로컬 검토본·미배포’는 이 승인 이전 상태를 기록한 것이다.

## 변경

- 자체 실험실 63개를 sims.js에 등록했다. 기존 외부 자료 71개는 유지하여 전체 134개 카드가 된다.
- 자체 실험실마다 모형·학습 모드 단추, 저장된 미션 진행점, 실제 캔버스에서 만든 640×400 썸네일을 제공한다.
- 메인에서 23개 단원의 교육과정 탐구 지도로 이동할 수 있다.
- 힘의 작용 여섯 실험실을 모두 연결하고 알짜힘 경로를 실제 motion 폴더로 바로잡았다.
- 기존 마찰력과 외부 마찰 전기가 friction 식별자를 공유하던 문제를 고쳤다. 외부 자료는 electric-friction 식별자와 별도 썸네일로 보존한다.
- 자체 실험실의 계산·미션 엔진은 이번 등록 작업에서 바꾸지 않았다. 과학 검증은 기존 검토 보고서를 따른다.

## 공개 전·후 확인

tests/gallery-publish.cjs는 63개 자체 실험실의 두 모드, 134개 카드의 고유 식별자·썸네일, 네 화면의 가로 넘침, 검색, 저장 진도, 교육과정 지도 연결을 검사한다. 로컬에서 GENERATE_THUMBS=1로 썸네일을 만들고, 공개 후 LAB_URL=https://scienceisjo.github.io/sim-lab로 같은 경로 검사를 수행한다. 실행 결과와 화면은 작업 출력 폴더의 publish/ 및 published/에 저장한다.

배포는 scienceisjo/sim-lab 저장소의 main 브랜치 루트를 사용하는 기존 GitHub Pages 설정을 유지한다. 최신 origin/main이 작업 HEAD의 조상인지 확인하고 일반 fast-forward push만 사용한다. 강제 push와 원본 체크아웃 수정은 하지 않는다. GitHub Pages 작업 성공과 공개 HTTP/브라우저 확인을 모두 마친 뒤 완료를 보고한다.

- 메인: https://scienceisjo.github.io/sim-lab/
- 교육과정 탐구 지도: https://scienceisjo.github.io/sim-lab/curriculum/
