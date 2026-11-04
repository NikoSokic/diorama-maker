import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  fallback: ReactNode
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Prikazujem zamjenski sadržaj:', error.message, info.componentStack)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
