/* Shared catalogue order: 2022 curriculum, the project's middle-school 1–3 sequence.
 * Unit IDs match units.json. Keep subject/topic filters independent of grade.
 */
(function(root){
 'use strict';
 const groups=[
  {grade:1,label:'중학 1',titles:['과학과 인류의 지속가능한 삶','생물의 구성과 다양성','열','물질의 상태 변화','힘의 작용','기체의 성질','태양계']},
  {grade:2,label:'중학 2',titles:['물질의 특성','지권의 변화','빛과 파동','물질의 구성','식물과 에너지','동물과 에너지','전기와 자기','별과 우주']},
  {grade:3,label:'중학 3',titles:['화학 반응의 규칙성','날씨와 기후변화','수권과 해수의 순환','운동과 에너지','자극과 반응','생식과 유전','재해⋅재난과 안전','과학과 나의 미래']}
 ];
 let n=0;const units=groups.flatMap(g=>g.titles.map((title,i)=>({id:'m13-'+String(++n).padStart(2,'0'),title,grade:g.grade,sequence:i+1,order:n})));
 const extra={id:'extra',title:'공통 도구·심화 탐구',grade:0,sequence:0,order:99};
 const aliases={'혼합물의 분리':'물질의 특성','지구계':'지권의 변화'};
 function locate(s){if(['심화','고1','영재','축제 부스','자율 탐구'].includes(s.grade))return extra;return units.find(u=>u.title===(aliases[s.unit]||s.unit))||extra;}
 root.CurriculumOrder={groups,units,extra,locate};
})(globalThis);
