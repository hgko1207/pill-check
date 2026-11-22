// DUR 응답 읽기(web/src/lib/dur-match.ts의 parseDurPage) 검증 (plan.md 60).
// 응답은 2026-11-21 운영 /api/nedrug 중계로 받은 실제 모양을 줄인 것이다. 네트워크와 키가 필요 없다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-dur-response.mjs   → 기대와 다르면 exit 1
import { parseDurPage } from '../../web/src/lib/dur-match.ts'

let failed = 0
function expect(label, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
}
function tryParse(json) {
  try {
    return { value: parseDurPage(json) }
  } catch (e) {
    return { error: e }
  }
}

// 1) 정상, 행 있음 (노비르정 numOfRows=1). items가 배열
const withRows = {
  header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
  body: { pageNo: 1, totalCount: 427, numOfRows: 1, items: [{ DUR_SEQ: '158', TYPE_NAME: '병용금기', ITEM_SEQ: '201106064' }] },
}
let r = tryParse(withRows)
expect('정상 행 있음 → 1행, 전체 427', !r.error && r.value.items.length === 1 && r.value.total === 427, r.error?.message)

// 2) 정상, 행 하나가 객체로 올 때도 배열로
r = tryParse({ header: { resultCode: '00' }, body: { totalCount: 1, items: { DUR_SEQ: '1' } } })
expect('items가 객체 하나 → 배열 1행', !r.error && Array.isArray(r.value.items) && r.value.items.length === 1, r.error?.message)

// 3) 정상 0건 (없는 품목 999999999). items 칸이 없다 → 0행으로 받아 저장해도 된다
r = tryParse({ header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { pageNo: 1, totalCount: 0, numOfRows: 1 } })
expect('정상 0건 → 0행, 실패 아님', !r.error && r.value.items.length === 0 && r.value.total === 0, r.error?.message)

// 4) 쪽 번호가 넘침 (pageNo=99999). 정상 코드, 전체 건수는 있고 items 없음
r = tryParse({ header: { resultCode: '00' }, body: { pageNo: 99999, totalCount: 427, numOfRows: 1 } })
expect('넘친 쪽 → 0행, 전체 427', !r.error && r.value.items.length === 0 && r.value.total === 427, r.error?.message)

// 5) 오류가 HTTP 200으로 옴 (numOfRows=1000). body가 비어 있다 → 반드시 실패
r = tryParse({ header: { resultCode: '11', resultMsg: 'NO MANDATORY REQUEST PARAMETERS ERROR! \n numOfRows maximum is =[500]' }, body: {} })
expect('resultCode 11 + body {} → 실패', !!r.error, r.error?.message)

// 6) header가 없는 모양 (게이트웨이 오류 OpenAPI_ServiceResponse) → 실패
r = tryParse({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'NO_OPENAPI_SERVICE_ERROR', returnReasonCode: '12' } } })
expect('header 없음 → 실패', !!r.error, r.error?.message)

// 7) 정상 코드인데 전체 건수가 없음 → 실패 (0건으로 단정하지 않는다)
r = tryParse({ header: { resultCode: '00' }, body: {} })
expect('정상 코드, totalCount 없음 → 실패', !!r.error, r.error?.message)

// 8) 빈 값
r = tryParse(null)
expect('null → 실패', !!r.error, r.error?.message)

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`)
process.exit(failed === 0 ? 0 : 1)
