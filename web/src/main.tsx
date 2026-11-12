import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// 글꼴: 화면에 쓰인 글자 묶음만 내려받는 Pretendard (앱 안에 포함, 외부 CDN 없음)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './App.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
