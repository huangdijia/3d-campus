'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !window.isSecureContext ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const warmShell = () => {
          // Only resources already requested by this page; never enumerate campuses.
          const urls = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name);
          registration.active?.postMessage({
            type: 'WARM_SHELL',
            page: window.location.href,
            urls,
          });
        };
        if (document.readyState === 'complete') warmShell();
        else window.addEventListener('load', warmShell, { once: true });
      })
      .catch((error: unknown) => {
        console.warn('离线功能暂不可用，联网浏览不受影响。', error);
      });
  }, []);

  return null;
}
