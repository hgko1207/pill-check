import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * 앱 맨 위 오류 경계. 예상 못 한 오류가 나도 빈 화면 대신 다시 여는 길을 보여 준다.
 * 설치한 앱에는 새로고침 버튼이 없어서, 빈 화면이 되면 어르신은 빠져나올 방법이 없다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[약똑똑] 화면 오류', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1 className="crash__title">문제가 생겼어요</h1>
        <p className="crash__text">
          화면을 보여 주지 못했어요. 아래 버튼을 누르면 앱을 다시&nbsp;열어요. 등록한 내 약은 그대로&nbsp;있어요.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          다시 열기
        </button>
        <p className="crash__sub">같은 화면이 계속 나오면 자녀에게 알려&nbsp;주세요.</p>
      </main>
    )
  }
}
