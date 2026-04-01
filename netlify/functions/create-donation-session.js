const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { userId, amountCents } = body
  if (!userId || typeof amountCents !== 'number') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId or amountCents' }) }
  }
  if (amountCents < 100 || amountCents > 50000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Amount must be between $1 and $500' }) }
  }

  // Insert pending donation
  const { data: donation, error: insertErr } = await supabase
    .from('donations')
    .insert({ user_id: userId, amount_cents: amountCents, status: 'pending' })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[create-donation-session] insert error:', insertErr)
    return { statusCode: 500, body: JSON.stringify({ error: 'DB error' }) }
  }

  const origin = event.headers.origin || event.headers.referer?.replace(/\/$/, '') || 'https://bingo-v04.netlify.app'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: 'Dobber Bingo — Supporter Contribution',
          description: 'Keep the free games running 🎱',
        },
      },
      quantity: 1,
    }],
    metadata: {
      donation_id: donation.id,
      user_id: userId,
    },
    success_url: `${origin}/contribute?status=success`,
    cancel_url: `${origin}/contribute?status=cancelled`,
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url }),
  }
}
