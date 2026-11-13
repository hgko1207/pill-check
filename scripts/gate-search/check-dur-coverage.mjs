// "내 약을 실제로 대조했는가" 판단(web/src/lib/dur-match.ts의 medCoverage) 검증.
// 네트워크와 키가 필요 없다. 식약처 서버가 안 열릴 때도 돌릴 수 있다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-dur-coverage.mjs   → 기대와 다르면 exit 1
import { findDurConflicts, medCoverage, medKey } from '../../web/src/lib/dur-match.ts'

let failed = 0
function expect(label, actual, want) {
  const ok = actual === want
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (기대 ${want})`}`)
}

const norvir = { kind: 'drug', id: '201106064', name: '노비르정', ingredient: '[M259362]리토나비르' }
const simva20 = { kind: 'drug', id: '200200173', name: '심바로드정20', ingredient: '[M089710]심바스타틴' }
const simva40 = { kind: 'drug', id: '200200174', name: '심바로드정40', ingredient: '[M089710]심바스타틴' }
const tylenol = { kind: 'drug', id: '202106092', name: '타이레놀정500', ingredient: '[M040353]아세트아미노펜' }
const lutein = { kind: 'healthfood', id: 'hf-1', name: '루테인 영양제', ingredient: '마리골드꽃추출물' }
const vitd = { kind: 'healthfood', id: 'hf-2', name: '비타민D 영양제', ingredient: '비타민D3' }
const got = (...sides) => new Set(sides.map((s) => s.id))

// 1) 영양제를 확인할 때는 내 약(의약품) 쪽 자료가 필요하다. 3개 중 타이레놀만 받음
expect('영양제 확인, 노비르정 자료 못 받음', medCoverage(lutein, norvir, got(tylenol)), 'unchecked')
expect('영양제 확인, 심바로드정20 자료 못 받음', medCoverage(lutein, simva20, got(tylenol)), 'unchecked')
expect('영양제 확인, 타이레놀 자료 받음', medCoverage(lutein, tylenol, got(tylenol)), 'compared')

// 2) 의약품끼리는 양쪽 자료가 모두 있어야 대조한 것이다
expect('의약품 확인, 양쪽 다 받음', medCoverage(simva40, norvir, got(simva40, norvir)), 'compared')
expect('의약품 확인, 내 약 쪽만 못 받음', medCoverage(simva40, tylenol, got(simva40, norvir)), 'unchecked')
expect('의약품 확인, 확인 제품 쪽만 못 받음', medCoverage(simva40, norvir, got(norvir, tylenol)), 'unchecked')
expect('의약품 확인, 아무것도 못 받음', medCoverage(simva40, norvir, got()), 'unchecked')

// 3) 등록한 영양제와 의약품을 비교할 때는 의약품(확인 제품) 쪽 자료가 필요하다
expect('영양제 등록, 의약품 확인, 받음', medCoverage(simva40, lutein, got(simva40)), 'compared')
expect('영양제 등록, 의약품 확인, 못 받음', medCoverage(simva40, lutein, got()), 'unchecked')

// 4) 영양제끼리는 병용금기 자료로 비교할 수 없다 (받은 자료와 무관)
expect('영양제끼리', medCoverage(vitd, lutein, got(norvir)), 'na')

// 5) 확인 제품 자신
expect('자기 자신 (의약품)', medCoverage(simva20, simva20, got(simva20)), 'self')
expect('자기 자신 (영양제)', medCoverage(lutein, lutein, got()), 'self')

// 6) 품목코드가 빈 의약품은 조회할 수 없으므로 대조한 것으로 치지 않는다
expect('품목코드 없는 의약품', medCoverage(lutein, { kind: 'drug', id: '', name: '코드 없음' }, got()), 'unchecked')

// 7) 한쪽 자료만 받아도, 그 자료에 충돌이 있으면 빨강은 나온다 (못 받은 쪽 때문에 사라지지 않는다)
{
  const rowsFromNorvirOnly = [
    { TYPE_NAME: '병용금기', ITEM_SEQ: norvir.id, INGR_KOR_NAME: '리토나비르', MIXTURE_ITEM_SEQ: simva40.id, MIXTURE_INGR_KOR_NAME: '심바스타틴' },
  ]
  const cs = findDurConflicts(simva40, [norvir, tylenol], rowsFromNorvirOnly)
  expect('확인 제품 자료를 못 받아도 충돌 건수', cs.length, 1)
  expect('그 충돌의 단계', cs[0]?.severity, 'danger')
  expect('그 충돌의 내 약', cs[0]?.registeredMedName, norvir.name)
  expect('이때 노비르정 대조 상태 (화면은 빨강이 우선)', medCoverage(simva40, norvir, got(norvir)), 'unchecked')
}

// 8) 키는 종류와 번호를 함께 쓴다 (의약품과 영양제 번호가 겹쳐도 구분)
expect('medKey', medKey(norvir), 'drug:201106064')

console.log(failed ? `\n${failed}건 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
