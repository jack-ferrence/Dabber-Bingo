import { useState, useEffect } from 'react'
import { isNative } from '../lib/platform.js'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (isNative()) {
      let removeListener = null
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then((s) => setIsOnline(s.connected)).catch(() => {})
        Network.addListener('networkStatusChange', (s) => setIsOnline(s.connected))
          .then((handle) => { removeListener = handle })
          .catch(() => {})
      }).catch(() => {})
      return () => { removeListener?.remove?.() }
    }

    setIsOnline(navigator.onLine)
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
