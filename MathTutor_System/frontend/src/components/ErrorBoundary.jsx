import { Component } from 'react'
import { AlertCircle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50/90 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" aria-hidden />
          <div>
            <p className="text-base font-semibold text-red-800">页面出错了</p>
            <p className="mt-1 max-w-md text-sm text-red-700">
              {String(this.state.error?.message || this.state.error)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            点击重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
