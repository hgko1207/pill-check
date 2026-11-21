// 검색어 다듬기(web/src/lib/search-query.ts) 검증 (plan.md 67). 네트워크와 키가 필요 없다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-search-query.mjs   → 기대와 다르면 exit 1
import { healthFoodQuery, drugQuery } from '../../web/src/lib/search-query.ts'

let failed = 0
function expect(label, actual, want) {
  const ok = actual === want
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}

// 영양제: / % ? 로 나눈 가장 긴 조각
expect('영양제 그대로', healthFoodQuery('루테인 지아잔틴'), '루테인 지아잔틴')
expect('영양제 /', healthFoodQuery('비타민D/K'), '비타민D')
expect('영양제 % 뒤', healthFoodQuery('100%'), '100')
expect('영양제 ?', healthFoodQuery('오메가3?'), '오메가3')
expect('영양제 뒤 조각이 더 김', healthFoodQuery('B/프로바이오틱스'), '프로바이오틱스')
expect('영양제 길이 같으면 앞', healthFoodQuery('칼슘/아연'), '칼슘')
expect('영양제 앞뒤 공백', healthFoodQuery(' 비타민C / 아연 '), '비타민C')
expect('영양제 특수문자만', healthFoodQuery('/%?'), '')
expect('영양제 괄호·쉼표는 그대로', healthFoodQuery('비타민D(1000IU),칼슘'), '비타민D(1000IU),칼슘')

// 의약품: % 만
expect('의약품 그대로', drugQuery('타이레놀정500밀리그람'), '타이레놀정500밀리그람')
expect('의약품 /는 그대로', drugQuery('아스피린/'), '아스피린/')
expect('의약품 %', drugQuery('5%포도당'), '포도당')
expect('의약품 %만', drugQuery('%'), '')

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`)
process.exit(failed === 0 ? 0 : 1)
