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
