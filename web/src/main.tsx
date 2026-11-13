import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
// 글꼴: 화면에 쓰인 글자 묶음만 내려받는 Pretendard (앱 안에 포함, 외부 CDN 없음)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './App.css'

// 새 버전이 배포되면 받는 즉시 한 번 새로고침해 새 화면을 보여 준다 (autoUpdate 모드의 registerSW가 새로고침).
// 앱을 오래 켜 두는 경우를 위해, 앱으로 돌아올 때마다 새 버전이 있는지 확인한다.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
