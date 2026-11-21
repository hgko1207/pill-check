// 검색어 다듬기 (plan.md 67). 순수 함수라 Node로 바로 검사한다(scripts/gate-search/check-search-query.mjs).
// 2026-11-21 운영 중계로 확인: 영양제(I0030)는 조건이 주소 경로에 들어가 `/`·`?`면 12초 뒤 504, `%`면 406.
// 의약품은 `%`만 12초 뒤 504(`/`·`?`는 0건으로 정상 응답).

/** 그 글자들로 나눈 조각 중 가장 긴 것 (길이가 같으면 앞 조각). 모두 비면 '' */
function longestPiece(name: string, sep: RegExp): string {
  return name
    .split(sep)
    .map((s) => s.trim())
    .reduce((best, s) => (s.length > best.length ? s : best), '')
}

/** 영양제 이름 검색어: "비타민D/K" → "비타민D" */
export const healthFoodQuery = (name: string) => longestPiece(name, /[/%?]/)

/** 의약품 이름 검색어: "100%" → "100" */
export const drugQuery = (name: string) => longestPiece(name, /%/)
