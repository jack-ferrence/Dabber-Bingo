/**
 * Admin endpoint: delete all cards for a room so users get fresh cards generated
 * from the current odds_pool (which now includes team_abbr and jersey_number).
 *
 * Usage: POST /.netlify/functions/admin-reset-cards
 * Body: { "room_id": "...", "secret": "<ADMIN_SECRET>" }
 *   OR: { "room_name": "SA vs LAC", "secret": "<ADMIN_SECRET>" }
 *   OR: { "all_active": true, "secret": "<ADMIN_SECRET>" }
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_SECRET  (set this to any secret string in Netlify env vars)
 */

import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) }
  }

  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ADMIN_SECRET not set' }) }
  }

  let body
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  if (body.secret !== adminSecret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  let roomIds = []

  if (body.all_active) {
    // Delete cards for all currently active (lobby/live) public rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .in('status', ['lobby', 'live'])
      .eq('room_type', 'public')
    roomIds = (rooms ?? []).map(r => r.id)
  } else if (body.room_id) {
    roomIds = [body.room_id]
  } else if (body.room_name) {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .ilike('name', body.room_name)
      .in('status', ['lobby', 'live'])
    roomIds = (rooms ?? []).map(r => r.id)
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Provide room_id, room_name, or all_active' }) }
  }

  if (roomIds.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ deleted: 0, message: 'No matching rooms found' }) }
  }

  const { count, error } = await supabase
    .from('cards')
    .delete({ count: 'exact' })
    .in('room_id', roomIds)

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ deleted: count, room_ids: roomIds, message: 'Cards deleted — users will get fresh cards on next load' }),
    headers: { 'Content-Type': 'application/json' },
  }
}
