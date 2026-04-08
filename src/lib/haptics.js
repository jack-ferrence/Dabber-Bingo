import { isNative } from './platform.js'

let _hapticsModule = null

async function getHaptics() {
  if (!isNative()) return null
  if (_hapticsModule) return _hapticsModule
  try {
    _hapticsModule = await import('@capacitor/haptics')
    return _hapticsModule
  } catch {
    return null
  }
}

export async function hapticLight() {
  try {
    const mod = await getHaptics()
    if (mod) await mod.Haptics.impact({ style: 'light' })
  } catch { /* no-op on web */ }
}

export async function hapticMedium() {
  try {
    const mod = await getHaptics()
    if (mod) await mod.Haptics.impact({ style: 'medium' })
  } catch { /* no-op on web */ }
}

export async function hapticHeavy() {
  try {
    const mod = await getHaptics()
    if (mod) await mod.Haptics.impact({ style: 'heavy' })
  } catch { /* no-op on web */ }
}

export async function hapticSelection() {
  try {
    const mod = await getHaptics()
    if (mod) await mod.Haptics.selectionChanged()
  } catch { /* no-op on web */ }
}
