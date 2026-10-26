import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION, forceCacheClearReload } from '../utils/versionManager';

export const AppFooter = ({ className = '', id = 'footer-powered-by' }) => {
  const currentYear = new Date().getFullYear();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualCacheClear = async (e) => {
    e.preventDefault();
    if (isRefreshing) return;
    setIsRefreshing(true);
    await forceCacheClearReload(APP_VERSION);
  };

  return (
    <footer className={`smartdoc-app-footer ${className}`.trim()} id={id}>
      <div className="smartdoc-footer-inner">
        <span className="smartdoc-footer-text">
          <span>Powered by</span>{' '}
          <a
            href="https://prynivo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="smartdoc-footer-link"
            title="Prynivo - Enterprise Software & Digital Solutions"
          >
            prynivo.com
          </a>{' '}
          <span className="smartdoc-footer-copyright">© {currentYear}</span>
          <span className="smartdoc-footer-sep" aria-hidden="true">•</span>
          <button
            type="button"
            className={`smartdoc-footer-version ${isRefreshing ? 'is-refreshing' : ''}`}
            onClick={handleManualCacheClear}
            title={`SmartDoc v${APP_VERSION} (Click to clear cache & hard reload / Ctrl+F5)`}
            aria-label={`SmartDoc version ${APP_VERSION}. Click to clear cache and reload`}
          >
            <span className="smartdoc-version-status-dot" aria-hidden="true" />
            <span className="smartdoc-version-num">v{APP_VERSION}</span>
            <RefreshCw size={11} className="smartdoc-version-icon" aria-hidden="true" />
          </button>
        </span>
      </div>
    </footer>
  );
};
