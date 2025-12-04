import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'

async function boot() {
  try {
    const AppModule = await import('./App');
    const App = AppModule.default;
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (err) {
    console.error('Failed to load App module:', err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding:20px;font-family:monospace;">
          <h2>Application failed to load</h2>
          <pre>${String(err).replace(/</g, '&lt;')}</pre>
        </div>
      `;
    }
  }
}

boot();
