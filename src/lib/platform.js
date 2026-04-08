import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()
export const isIOS = () => isNative() && Capacitor.getPlatform() === 'ios'
export const isWeb = () => !isNative()
