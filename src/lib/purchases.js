/**
 * RevenueCat IAP abstraction for iOS in-app purchases.
 * On web, all methods are safe no-ops — Stripe handles web donations.
 *
 * Setup required:
 * 1. Create products in App Store Connect (com.dobber.bingo.tip.*)
 * 2. Create a RevenueCat project at https://app.revenuecat.com
 * 3. Add your Apple API key to RevenueCat
 * 4. Set VITE_REVENUECAT_APPLE_KEY in your environment
 * 5. Create an "offerings" group with the tip products
 */

import { isIOS } from './platform.js'

let Purchases = null
let isInitialized = false

// Product IDs must match App Store Connect
export const TIP_PRODUCT_IDS = [
  'com.dobber.bingo.tip.299',   // $2.99
  'com.dobber.bingo.tip.499',   // $4.99
  'com.dobber.bingo.tip.999',   // $9.99
  'com.dobber.bingo.tip.2499',  // $24.99
]

/**
 * Initialize RevenueCat. Call once at app startup (only runs on iOS).
 */
export async function initPurchases(userId) {
  if (!isIOS()) return

  try {
    const mod = await import('@revenuecat/purchases-capacitor')
    Purchases = mod.Purchases

    const apiKey = import.meta.env.VITE_REVENUECAT_APPLE_KEY
    if (!apiKey) {
      console.warn('[Purchases] VITE_REVENUECAT_APPLE_KEY not set — IAP disabled')
      return
    }

    await Purchases.configure({
      apiKey,
      appUserID: userId ?? undefined,
    })

    isInitialized = true
  } catch (err) {
    console.error('[Purchases] init failed:', err)
  }
}

/**
 * Identify user after login (links RevenueCat customer to your user ID).
 */
export async function identifyUser(userId) {
  if (!isInitialized || !Purchases) return
  try {
    await Purchases.logIn({ appUserID: userId })
  } catch (err) {
    console.error('[Purchases] identify failed:', err)
  }
}

/**
 * Fetch available tip products from App Store.
 * Returns array of { id, price, priceString, title } or empty array on web.
 */
export async function getTipProducts() {
  if (!isInitialized || !Purchases) return []

  try {
    const { offerings } = await Purchases.getOfferings()
    const current = offerings?.current
    if (!current) return []

    return current.availablePackages.map((pkg) => ({
      id: pkg.product.identifier,
      price: pkg.product.price,
      priceString: pkg.product.priceString,
      title: pkg.product.title,
      packageType: pkg.packageType,
      rcPackage: pkg,
    }))
  } catch (err) {
    console.error('[Purchases] getOfferings failed:', err)
    return []
  }
}

/**
 * Purchase a tip product. Returns { success, customerInfo } or { success: false, error, cancelled }.
 */
export async function purchaseTip(rcPackage) {
  if (!isInitialized || !Purchases) {
    return { success: false, error: 'Purchases not initialized' }
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: rcPackage })
    return { success: true, customerInfo }
  } catch (err) {
    // User cancelled
    if (err.code === 1 || err.userCancelled) {
      return { success: false, cancelled: true }
    }
    console.error('[Purchases] purchase failed:', err)
    return { success: false, error: err.message ?? 'Purchase failed' }
  }
}

/**
 * Restore previous purchases (e.g. if user reinstalls).
 */
export async function restorePurchases() {
  if (!isInitialized || !Purchases) return null

  try {
    const { customerInfo } = await Purchases.restorePurchases()
    return customerInfo
  } catch (err) {
    console.error('[Purchases] restore failed:', err)
    return null
  }
}

/**
 * Check if RevenueCat is ready for purchases.
 */
export function isPurchasesReady() {
  return isInitialized && Purchases !== null
}
