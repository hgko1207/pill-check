import { useEffect, useRef } from 'react'

/**
 * 기기 뒤로 가기(안드로이드 뒤로 버튼, 브라우저 뒤로)로 덮는 화면·확인 창을 닫는다.
 * - 열릴 때 방문 기록에 칸을 하나 넣고, 뒤로 가기(popstate)가 오면 맨 위 화면 하나만 닫는다.
 * - 화면 버튼·Esc·탭 누르기로 닫히면 넣어 둔 칸을 되돌려, 다음 뒤로 가기가 헛돌지 않게 한다.
 *   탭 누르기처럼 여러 화면이 한꺼번에 닫힐 수 있어, 같은 순간 닫힌 개수를 모아 history.go(-n) 한 번으로 되돌린다.
 */

interface Entry {
  close: () => void
  closedByBack: boolean
}

const stack: Entry[] = []
/** 우리가 되돌리느라 생긴 popstate는 화면을 닫지 않고 넘긴다 */
let ignorePops = 0
let pendingBack = 0
let listening = false

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--
    return
  }
  const top = stack.pop()
  if (!top) return
  top.closedByBack = true
  top.close()
}

function rewindLater() {
  pendingBack++
  if (pendingBack > 1) return
  queueMicrotask(() => {
    const n = pendingBack
    pendingBack = 0
    ignorePops++
    history.go(-n)
  })
}

export function useBackClose(open: boolean, onClose: () => void) {
  // onClose가 렌더마다 새 함수여도 기록 칸을 다시 넣지 않도록 ref로 들고 있는다
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }
    const entry: Entry = { close: () => onCloseRef.current(), closedByBack: false }
    stack.push(entry)
    history.pushState({ pillcheckOverlay: true }, '')
    return () => {
      if (entry.closedByBack) return
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      rewindLater()
    }
  }, [open])
}
