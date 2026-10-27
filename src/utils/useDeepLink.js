// SmartDoc deep-link hook
// Applies URL deep-link params (e.g. /approvals?submission=<id>) once the data they
// depend on has loaded, then strips them from the address bar so a refresh or
// in-app navigation does not reopen the same item unexpectedly.
import { useEffect, useRef, useState } from 'react';
import { getDeepLinkParams, clearDeepLinkParams } from './router';

const DEEP_LINK_TIMEOUT_MS = 8000;

/**
 * @param {(params: object, ctx: { timedOut: boolean }) => boolean} resolve
 *   Called with the deep-link params captured at mount. Return `true` once handled
 *   (or impossible to handle), `false` to wait for more data and try again.
 * @param {Array} deps  Data dependencies that should re-trigger `resolve` (e.g. lists loaded from the API).
 */
export const useDeepLink = (resolve, deps = []) => {
  const paramsRef = useRef(null);
  if (paramsRef.current === null) paramsRef.current = getDeepLinkParams();
  const doneRef = useRef(Object.keys(paramsRef.current).length === 0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (doneRef.current) return undefined;
    const timer = setTimeout(() => setTimedOut(true), DEEP_LINK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (doneRef.current) return;
    const handled = resolve(paramsRef.current, { timedOut });
    if (handled) {
      doneRef.current = true;
      clearDeepLinkParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, timedOut]);
};
