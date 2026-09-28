# CLICK SCIENCE · 클릭 사이언스

눌러 보고 바꿔 보며 배우는 중학교 과학 시뮬레이션·가상 실험실 모음입니다.
https://scienceisjo.github.io/sim-lab/

[교육과정 탐구 지도](https://scienceisjo.github.io/sim-lab/curriculum/)에서 23개 단원에 연결된 자체 실험실 63개를 찾을 수 있습니다. 메인 갤러리에는 자체 실험실의 모형·학습 모드와 기존 외부 수업 자료가 함께 있습니다.

- `sims.js` — 목록. 새 시뮬은 여기에 한 줄 추가합니다.
- `thumbs/<id>.jpg` — 카드 그림(640×400). 없으면 빈칸으로 둡니다.
- 자체 실험실은 `labs/<id>/index.html`, 공통 틀은 `labs/_kit/`에 있습니다. 외부 자료는 원래 사이트로 연결합니다.

자체 실험실은 `?mode=model`(자유 조작·교사 시연)과 `?mode=learn`(미션·측정·기록·확인 문제)으로 열 수 있습니다. 머리글에서 전환하며 두 모드는 같은 물리 계산을 사용합니다. 처음 방문할 때 두 카드로 고르고, 마지막 선택을 기기에 저장합니다.

학습 진행·기록·확인 문제는 이 브라우저에만 저장됩니다. 미션의 **다시 하기**로 함께 지웁니다. 기록장의 표·조건별 평균·그래프·CSV는 교실 실험 결과를 비교하는 데 쓸 수 있습니다. 측정 흔들림은 모형 운동에 영향을 주지 않습니다.

- [두 모드 설계](docs/phase1-design.md)
- [공통 학습 부품 사용법과 검증](docs/learning-kit.md)
- [1단계 검증과 반박 검토](docs/phase1-review.md)
- [교육과정 대응표](docs/curriculum-coverage.md)
- [교육과정 실험실 검증과 반박 검토](docs/curriculum-review.md)
- [갤러리 등록과 공개 배포 기록](docs/gallery-release.md)
- [온도색과 전도·대류 재설계 검증](docs/thermal-remodel-review.md)
- [중학 1·2·3 갤러리 배치](docs/grade-catalog.md)
