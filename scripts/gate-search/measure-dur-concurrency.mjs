// 식약처 DUR 요청을 동시에 몇 건씩 보내야 시간 초과(504)가 덜 나는지 재는 스크립트 (plan.md 70).
// 운영 중계(https://pill.hgko.dev/api/nedrug)를 직접 부른다. 키는 필요 없다(중계가 붙임).
// 실행: node scripts/gate-search/measure-dur-concurrency.mjs
// 정부 서버 상태가 시간대마다 달라서 같은 시간대에 여러 방식을 번갈아 잰다.
const B = 'https://pill.hgko.dev/api/nedrug/1471000'
const OPS = ['getUsjntTabooInfoList03', 'getEfcyDplctInfoList03']

async function json(url) {
  for (let a = 0; a < 3; a++) {
    try {
      return await (await fetch(url)).json()
    } catch {
      /* 504 본문은 JSON이 아니다 → 다시 */
    }
  }
  return {}
}

// 흔한 성분으로 실제 품목코드 모으기
const seqs = []
for (const term of ['아세트아미노펜', '메트포르민', '암로디핀', '로수바스타틴', '오메프라졸', '세티리진']) {
  const j = await json(`${B}/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06?type=json&numOfRows=10&pageNo=1&item_name=${encodeURIComponent(term)}`)
  for (const it of j.body?.items ?? []) if (!seqs.includes(it.ITEM_SEQ)) seqs.push(it.ITEM_SEQ)
}
if (seqs.length < 40) {
  console.log(`품목코드를 ${seqs.length}개밖에 못 모았다(검색도 시간 초과). 정부 서버가 느린 때라 나중에 다시 재 주세요.`)
  process.exit(1)
}

async function one(seq, op) {
  const t = Date.now()
  const r = await fetch(`${B}/DURPrdlstInfoService03/${op}?type=json&itemSeq=${seq}&numOfRows=500&pageNo=1`)
  const txt = await r.text()
  const code = /"resultCode":"(\d+)"/.exec(txt)?.[1] ?? '-'
  return { ok: r.status === 200 && code === '00', status: `${r.status}/${code}`, ms: Date.now() - t }
}

/** list를 limit건씩 동시에. retryFailed면 실패한 것만 끝에 한 번 더 */
async function run(label, list, limit, retryFailed = false) {
  const t0 = Date.now()
  const out = []
  let i = 0
  async function worker() {
    while (i < list.length) {
      const k = i++
      out[k] = await one(...list[k])
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  if (retryFailed) {
    await Promise.all(out.map(async (o, k) => (o.ok ? o : (out[k] = await one(...list[k])))))
  }
  const bad = out.filter((o) => !o.ok)
  const ms = out.map((o) => o.ms).sort((a, b) => a - b)
  console.log(
    `${label}: 전체 ${((Date.now() - t0) / 1000).toFixed(1)}초, 실패 ${bad.length}/${out.length} ` +
      `[${[...new Set(bad.map((b) => b.status))].join(',')}], 한 건 중앙 ${ms[ms.length >> 1]}ms 최대 ${ms[ms.length - 1]}ms`,
  )
}

// 약 20개 = 금기·효능군 40건 (앱의 내 약 20개 첫 대조와 같은 양)
const batch = (k) => seqs.slice(k * 20, k * 20 + 20).flatMap((s) => OPS.map((op) => [s, op]))
console.log(`${new Date().toLocaleString('ko-KR')} 품목 ${seqs.length}개`)
await run('A 동시 40', batch(0), 40)
await run('B 6건씩', batch(1), 6)
await run('C 동시 40 + 실패만 다시', batch(0), 40, true)
await run('D 6건씩 + 실패만 다시', batch(1), 6, true)
