const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature']
  let stripeEvent

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object
    const { donation_id, user_id } = session.metadata ?? {}

    if (!donation_id || !user_id) {
      console.warn('[stripe-webhook] missing metadata on session', session.id)
      return { statusCode: 200, body: 'ok' }
    }

    const { error } = await supabase.rpc('complete_donation', {
      p_donation_id: donation_id,
      p_user_id: user_id,
      p_amount_cents: session.amount_total,
      p_stripe_session_id: session.id,
    })

    if (error) {
      console.error('[stripe-webhook] complete_donation RPC error:', error)
      return { statusCode: 500, body: 'RPC error' }
    }
  }

  return { statusCode: 200, body: 'ok' }
}
