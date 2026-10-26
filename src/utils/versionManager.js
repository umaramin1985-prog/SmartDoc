// SmartDoc Version Manager & Cache Invalidation System
// Provides version tracking, automated cache-busting on version mismatch (Ctrl+F5 behavior),
// manual force-refresh, and background server version monitoring.

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';

const STORAGE_KEY = 'smartdoc_app_version';
const LAST_RELOAD_KEY = 'smartdoc_last_cache_clear_version';

/**
 * Triggers a comprehensive browser cache clear and hard reload (Ctrl + F5 equivalent)
 * Clears: CacheStorage, Service Workers, forces reload of root document with cache bypass.
 */
export async function forceCacheClearReload(targetVersion = APP_VERSION) {
  try {
    console.info(`[SmartDoc Version] Clearing cache & triggering hard reload for v${targetVersion}...`);

    // 1. Record target version in localStorage and sessionStorage to prevent reload loops
    try {
      localStorage.setItem(STORAGE_KEY, targetVersion);
      sessionStorage.setItem(LAST_RELOAD_KEY, targetVersion);
    } catch {
      // Storage unavailable or quota exceeded
    }

    // 2. Clear all browser CacheStorage caches (service workers, cached fetches)
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch (err) {
        console.warn('[SmartDoc Version] Error clearing CacheStorage:', err);
      }
    }

    // 3. Unregister any active Service Workers
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch (err) {
        console.warn('[SmartDoc Version] Error unregistering service worker:', err);
      }
    }

    // 4. Issue a cache-reloaded fetch for the current page to bypass browser disk cache
    try {
      await fetch(window.location.href, {
        cache: 'reload',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    } catch {
      // Network fetch error ignored during reload preparation
    }

    // 5. Append a cache-buster query parameter to force hard load of index.html
    const url = new URL(window.location.href);
    url.searchParams.set('_vcb', Date.now().toString());

    // 6. Hard navigate
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[SmartDoc Version] Hard reload failed:', err);
    try {
      window.location.reload(true);
    } catch {
      window.location.reload();
    }
  }
}

/**
 * Initializes version monitoring and checks for version changes:
 * - Checks localStorage vs running bundle version
 * - Checks /api/version periodically and on window focus
 * - Intercepts Ctrl+F5 keyboard shortcut to ensure caches are cleared
 */
export function initVersionWatcher(onVersionMismatch) {
  if (typeof window === 'undefined') return () => {};

  // Clean up cache buster parameter from address bar cleanly without reload
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('_vcb')) {
      url.searchParams.delete('_vcb');
      window.history.replaceState({}, document.title, url.pathname + (url.search || '') + url.hash);
    }
  } catch {
    // History manipulation fallback
  }

  // Check stored version vs current bundle version
  try {
    const storedVersion = localStorage.getItem(STORAGE_KEY);
    const lastReloadedVersion = sessionStorage.getItem(LAST_RELOAD_KEY);

    if (storedVersion && storedVersion !== APP_VERSION && lastReloadedVersion !== APP_VERSION) {
      console.warn(`[SmartDoc Version] Bundle version changed from ${storedVersion} to ${APP_VERSION}. Triggering cache-clear reload.`);
      forceCacheClearReload(APP_VERSION);
      return () => {};
    }

    // Record current version as active
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
  } catch {
    // Storage access error
  }

  // Check server version
  let isChecking = false;
  const checkServerVersion = async () => {
    if (isChecking) return;
    isChecking = true;
    try {
      const res = await fetch(`/api/version?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version && data.version !== APP_VERSION) {
        console.info(`[SmartDoc Version] Server version mismatch detected: server v${data.version} vs client v${APP_VERSION}`);
        if (typeof onVersionMismatch === 'function') {
          onVersionMismatch(data.version);
        } else {
          forceCacheClearReload(data.version);
        }
      }
    } catch {
      // Backend offline or network blip; ignore
    } finally {
      isChecking = false;
    }
  };

  // Initial check after startup
  const startupTimer = setTimeout(checkServerVersion, 3500);

  // Periodic poll every 45 seconds
  const interval = setInterval(checkServerVersion, 45000);

  // Check when window gains focus (user switches back to tab)
  const handleFocus = () => {
    checkServerVersion();
  };
  window.addEventListener('focus', handleFocus);

  // Global Ctrl+F5 / Ctrl+Shift+R shortcut capture
  const handleKeyDown = (e) => {
    const isCtrlF5 = (e.ctrlKey || e.metaKey) && e.key === 'F5';
    const isForceReload = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R');
    if (isCtrlF5 || isForceReload) {
      forceCacheClearReload(APP_VERSION);
    }
  };
  window.addEventListener('keydown', handleKeyDown);

  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('keydown', handleKeyDown);
  };
}
