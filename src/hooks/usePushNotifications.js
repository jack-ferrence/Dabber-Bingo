import { useState, useEffect, useCallback, useRef } from 'react'
import { isNative } from '../lib/platform.js'

export function usePushNotifications(user) {
  const [permissionStatus, setPermissionStatus] = useState('unknown')
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!isNative() || !user) return
    import('@capacitor/push-notifications').then(({ PushNotifications }) => {
      PushNotifications.checkPermissions().then(result => {
        setPermissionStatus(result.receive)
      })
    }).catch(() => {})
  }, [user])

  const requestPermission = useCallback(async () => {
    if (!isNative() || !user || registeredRef.current) return false
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      const perm = await PushNotifications.requestPermissions()
      setPermissionStatus(perm.receive)
      if (perm.receive !== 'granted') return false

      // Remove any previous listeners to avoid duplicates
      await PushNotifications.removeAllListeners()

      // Listen for registration token
      PushNotifications.addListener('registration', async (token) => {
        try {
          await fetch('/.netlify/functions/register-push-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              token: token.value,
              platform: 'ios',
            }),
          })
          registeredRef.current = true
        } catch (err) {
          console.error('Failed to register push token:', err)
        }
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err)
      })

      // Listen for notification taps — deep link to game room
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification?.data
        if (data?.roomId) {
          window.location.href = `/room/${data.roomId}`
        }
      })

      await PushNotifications.register()
      return true
    } catch (err) {
      console.error('Push notification setup failed:', err)
      return false
    }
  }, [user])

  return { permissionStatus, requestPermission }
}
