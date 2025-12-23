import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[LaundroPi] Booting UI...');
console.log('[LaundroPi] App type:', typeof App, App);
console.log('[LaundroPi] ReactDOM keys:', Object.keys(ReactDOM));
(window as any).ReactDOM = ReactDOM;
(window as any).React = React;
(window as any).AppComponent = App;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[LaundroPi] Render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: 'white', padding: '16px', fontFamily: 'Inter, sans-serif' }}>
          <h2>LaundroPi UI error</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="color:white;padding:16px">Root element not found</div>';
  throw new Error("Could not find root element to mount to");
}

rootElement.innerHTML = '<div style="color: white; padding: 12px">BOOTSTRAP...</div>';
console.log('[LaundroPi] Before render childCount:', rootElement.childElementCount, 'len:', rootElement.innerHTML.length);

const root = ReactDOM.createRoot(rootElement);
try {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (e) {
  console.error('[LaundroPi] render() failed', e);
  rootElement.innerHTML = `<div style="color:white;padding:16px">Render failed: ${String(e)}</div>`;
}

setTimeout(() => {
  console.log('[LaundroPi] After render childCount:', rootElement.childElementCount, 'len:', rootElement.innerHTML.length);
}, 0);

// Watchdog: if for some reason the DOM stays empty, paint a fallback message so we can see it.
setTimeout(() => {
  if (rootElement.childElementCount === 0 || rootElement.innerHTML.length === 0) {
    console.warn('[LaundroPi] Watchdog: root still empty, injecting fallback shell.');
    rootElement.innerHTML = '<div style="color:white;padding:16px;font-family:Inter,sans-serif">React render did not attach.<br/>Check console for errors.</div>';
  }
}, 500);

window.addEventListener('error', (e) => {
  console.error('[LaundroPi] Global error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[LaundroPi] Unhandled rejection:', e.reason);
});
