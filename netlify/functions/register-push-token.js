import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { userId, token, platform } = body

  if (!userId || typeof userId !== 'string' ||
      !token || typeof token !== 'string' ||
      !platform || typeof platform !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid fields: userId, token, platform' }),
    }
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    )

  if (error) {
    console.error('[register-push-token] upsert error:', error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  }
}
