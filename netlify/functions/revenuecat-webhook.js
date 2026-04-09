const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

/**
 * RevenueCat webhook handler for iOS in-app purchases.
 *
 * Setup:
 * 1. In RevenueCat dashboard → Project → Integrations → Webhooks
 * 2. Set URL to: https://your-site.netlify.app/.netlify/functions/revenuecat-webhook
 * 3. Set Authorization header to match REVENUECAT_WEBHOOK_SECRET env var
 *
 * RevenueCat events: https://www.revenuecat.com/docs/integrations/webhooks
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Verify webhook authenticity via shared secret in Authorization header
  const authHeader = event.headers['authorization'] || ''
  const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    console.error('[revenuecat-webhook] unauthorized request')
    return { statusCode: 401, body: 'Unauthorized' }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const eventType = body?.event?.type
  const appUserId = body?.event?.app_user_id
  const productId = body?.event?.product_id
  const priceUsd = body?.event?.price_in_purchased_currency
  const transactionId = body?.event?.transaction_id

  // Only process successful non-subscription purchases (tips)
  if (eventType !== 'NON_RENEWING_PURCHASE' && eventType !== 'INITIAL_PURCHASE') {
    return { statusCode: 200, body: 'ok — ignored event type' }
  }

  if (!appUserId) {
    console.warn('[revenuecat-webhook] no app_user_id in event')
    return { statusCode: 200, body: 'ok — no user' }
  }

  // Convert price to cents (RevenueCat sends price as a float in USD)
  const amountCents = Math.round((priceUsd ?? 0) * 100) || 0

  // Insert donation record
  const { data: donation, error: insertErr } = await supabase
    .from('donations')
    .insert({
      user_id: appUserId,
      amount_cents: amountCents,
      status: 'pending',
      source: 'iap',
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[revenuecat-webhook] insert error:', insertErr)
    // Still try to complete — the RPC may handle missing donation gracefully
  }

  // Award supporter badge via same RPC as Stripe flow
  const { error: rpcErr } = await supabase.rpc('complete_donation', {
    p_donation_id: donation?.id ?? null,
    p_user_id: appUserId,
    p_amount_cents: amountCents,
    p_stripe_session_id: transactionId ?? `iap_${Date.now()}`,
  })

  if (rpcErr) {
    console.error('[revenuecat-webhook] complete_donation RPC error:', rpcErr)
    return { statusCode: 500, body: 'RPC error' }
  }

  console.log(`[revenuecat-webhook] donation completed: user=${appUserId} product=${productId} amount=${amountCents}`)
  return { statusCode: 200, body: 'ok' }
}
