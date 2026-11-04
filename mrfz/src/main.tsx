import React, { Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './client/App';
import './client/ui.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UI 渲染错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', maxWidth: '640px', margin: '40px auto', background: '#1d2230', border: '1px solid #ef6a6a', borderRadius: '12px', color: '#e8ecf5', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#ef6a6a', margin: '0 0 12px' }}>⚠️ 页面加载异常</h2>
          <pre style={{ background: '#14171f', padding: '12px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '8px 16px', background: '#4f8cff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            刷新重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点。');
createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
