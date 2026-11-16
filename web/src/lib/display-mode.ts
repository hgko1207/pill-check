/** 홈 화면에 추가한 앱(standalone)으로 실행 중인가 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 홈 화면 앱
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
