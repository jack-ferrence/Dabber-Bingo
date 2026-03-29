/**
 * Wraps a dynamic import with one cache-busting retry before giving up.
 * Handles stale Vite chunks after deploys — the first attempt fails with a
 * 404 or MIME error, and the retry with ?t=... bypasses the browser cache.
 *
 * Usage:
 *   const MyComp = lazy(() => lazyRetry(() => import('./MyComp.jsx')))
 */
export function lazyRetry(importFn) {
  return new Promise((resolve, reject) => {
    importFn().then(resolve).catch((err) => {
      const url = err.message?.match(/https?:\/\/[^\s'"]+/)?.[0]
      if (url) {
        const busted = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
        import(/* @vite-ignore */ busted).then(resolve).catch(reject)
      } else {
        reject(err)
      }
    })
  })
}
