import crypto from 'crypto'
import http2 from 'http2'

const APNS_HOST = 'https://api.push.apple.com'
const TOPIC = 'com.dobber.bingo'
const TOKEN_TTL = 50 * 60 * 1000 // 50 minutes

let cachedJwt = null
let cachedJwtTime = 0

function base64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function generateJwt() {
  const now = Date.now()
  if (cachedJwt && now - cachedJwtTime < TOKEN_TTL) return cachedJwt

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }))
  const payload = base64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }))
  const headerPayload = `${header}.${payload}`

  const privateKey = process.env.APNS_KEY.replace(/\\n/g, '\n')
  const signature = crypto.sign('SHA256', Buffer.from(headerPayload), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })

  cachedJwt = `${headerPayload}.${base64url(signature)}`
  cachedJwtTime = now
  return cachedJwt
}

export async function sendPush(deviceToken, { title, body, data = {} }) {
  try {
    const jwt = generateJwt()
    const payload = JSON.stringify({
      aps: {
        alert: { title, body },
        sound: 'default',
        badge: 1,
      },
      ...data,
    })

    return await new Promise((resolve) => {
      const session = http2.connect(APNS_HOST)

      session.on('error', (err) => {
        console.error('[APNs] session error:', err.message)
        resolve({ success: false, error: err.message })
      })

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${jwt}`,
        'apns-topic': TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      })

      let status = 0
      let responseData = ''

      req.on('response', (headers) => {
        status = headers[':status']
      })

      req.on('data', (chunk) => {
        responseData += chunk
      })

      req.on('end', () => {
        session.close()
        if (status === 200) {
          resolve({ success: true })
        } else if (status === 410) {
          resolve({ success: false, expired: true })
        } else {
          console.error(`[APNs] status=${status} body=${responseData}`)
          resolve({ success: false, error: status })
        }
      })

      req.on('error', (err) => {
        session.close()
        console.error('[APNs] request error:', err.message)
        resolve({ success: false, error: err.message })
      })

      req.end(payload)
    })
  } catch (err) {
    console.error('[APNs] sendPush error:', err.message)
    return { success: false, error: err.message }
  }
}
