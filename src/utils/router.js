// SmartDoc SPA Router & Navigation Utilities

export const ROUTE_MAP = {
  login: '/login',
  dashboard: '/',
  forms: '/forms',
  approvals: '/approvals',
  reviews: '/reviews',
  'dept-messaging': '/dept-messaging',
  activity: '/activity',
  settings: '/settings'
};

export const PATH_TITLES = {
  login: 'SmartDoc | Sign In',
  dashboard: 'SmartDoc | Dashboard',
  forms: 'SmartDoc | Forms & Templates',
  approvals: 'SmartDoc | Submissions & Approvals',
  reviews: 'SmartDoc | Pre-Publication Reviews',
  'dept-messaging': 'SmartDoc | Team Messaging',
  activity: 'SmartDoc | Activity Log & Audit Trail',
  settings: 'SmartDoc | Users & Departments'
};

/**
 * Resolves the internal tab identifier from a URL pathname
 * Supports aliases like /templates, /submissions, /messages
 */
export const getTabFromPath = (pathname = window.location.pathname) => {
  const clean = String(pathname || '').toLowerCase().replace(/\/+$/, '') || '/';

  if (clean === '/login' || clean === '/signin' || clean === '/sign-in') return 'login';
  if (clean === '' || clean === '/' || clean === '/dashboard') return 'dashboard';
  if (clean === '/forms' || clean === '/templates' || clean === '/forms-templates') return 'forms';
  if (clean === '/approvals' || clean === '/submissions' || clean === '/submissions-approvals') return 'approvals';
  if (clean === '/reviews') return 'reviews';
  if (clean === '/dept-messaging' || clean === '/messaging' || clean === '/messages' || clean === '/chat') return 'dept-messaging';
  if (clean === '/activity' || clean === '/audit' || clean === '/audit-log' || clean === '/activity-log') return 'activity';
  if (clean === '/settings' || clean === '/admin') return 'settings';

  return 'dashboard';
};

/**
 * Returns canonical URL pathname for a given tab
 */
export const getPathForTab = (tab) => {
  return ROUTE_MAP[tab] || '/';
};

// ---------------------------------------------------------------------------
// Deep links & "Open in new tab"
// ---------------------------------------------------------------------------
// Every action that opens something (fill form, edit template, preview, version
// history, print, folder navigation, submission details, reviews) has a
// shareable URL such as `/forms?action=fill&id=<templateId>`. Action elements are
// rendered as real <a href> links so Ctrl/Cmd+Click, Shift+Click, Middle-Click and
// the browser's right-click "Open link in new tab" all work natively, while a
// plain left click keeps the in-app (same tab) behaviour.

/** Query keys owned by deep links (other params such as `testMode` are preserved). */
export const DEEP_LINK_KEYS = ['action', 'id', 'dept', 'folder', 'submission', 'review'];

/**
 * Builds an in-app URL for a tab with optional deep-link query params.
 * buildAppUrl('forms', { action: 'fill', id: 'TMPL-1' }) -> '/forms?action=fill&id=TMPL-1'
 */
export const buildAppUrl = (tab, params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return getPathForTab(tab) + (s ? `?${s}` : '');
};

/** Reads the current deep-link params as a plain object. */
export const getDeepLinkParams = () => {
  const out = {};
  const qs = new URLSearchParams(window.location.search);
  DEEP_LINK_KEYS.forEach(k => {
    const v = qs.get(k);
    if (v !== null && v !== '') out[k] = v;
  });
  return out;
};

/** Removes deep-link params from the address bar (keeps pathname + unrelated params). */
export const clearDeepLinkParams = () => {
  const qs = new URLSearchParams(window.location.search);
  let changed = false;
  DEEP_LINK_KEYS.forEach(k => {
    if (qs.has(k)) { qs.delete(k); changed = true; }
  });
  if (!changed) return;
  const s = qs.toString();
  window.history.replaceState(window.history.state, '', window.location.pathname + (s ? `?${s}` : '') + window.location.hash);
};

/** True when the click should open in a new tab/window instead of in-app. */
export const isNewTabClick = (e) =>
  !!e && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0));

/**
 * Props for an <a> element that behaves like an in-app button on plain click but
 * opens `url` in a new tab on Ctrl/Cmd/Shift/Middle-click or via the context menu.
 *   <a className="btn btn-primary" {...tabLinkProps(url, () => openFill(t))}>Fill</a>
 */
export const tabLinkProps = (url, handler) => ({
  href: url,
  onClick: (e) => {
    if (isNewTabClick(e)) {
      // Let the browser open the href natively; don't trigger parent row/card handlers.
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    if (handler) handler(e);
  }
});

const isFromNestedControl = (e) => {
  const ctl = e.target?.closest?.('a, button, input, select, textarea, label');
  return !!ctl && ctl !== e.currentTarget && e.currentTarget.contains(ctl);
};

const openInNewTab = (url) => {
  window.open(url, '_blank', 'noopener');
};

/**
 * Props for non-anchor containers (tree nodes, tiles, table rows, list items):
 * plain click runs `handler`, Ctrl/Cmd/Shift-click or middle-click opens `url` in a new tab.
 * Optional `onNewTab` runs whenever the item is opened in a new tab (e.g. mark notification read).
 */
export const tabOpenProps = (url, handler, onNewTab) => {
  const openNew = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openInNewTab(url);
    if (onNewTab) onNewTab(e);
  };
  return {
    'data-href': url,
    onClick: (e) => {
      if (isNewTabClick(e) && !isFromNestedControl(e)) {
        openNew(e);
        return;
      }
      if (handler) handler(e);
    },
    onMouseDown: (e) => {
      // Prevent the browser's middle-click autoscroll so onAuxClick can open the tab
      if (e.button === 1 && !isFromNestedControl(e)) e.preventDefault();
    },
    onAuxClick: (e) => {
      if (e.button !== 1 || isFromNestedControl(e)) return;
      openNew(e);
    }
  };
};
