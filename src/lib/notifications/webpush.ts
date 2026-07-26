import crypto from 'crypto'

/**
 * Pure Node.js VAPID Web Push implementation using built-in crypto module.
 * RFC 8291 (Message Encryption for Web Push) & RFC 8292 (VAPID).
 */

export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export interface PushSubscriptionObj {
  endpoint: string
  keys: PushSubscriptionKeys
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

// Generate or retrieve default VAPID keys for DTCE Reporting
const DEFAULT_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BIzAsOB07JeLNtRihJlLst06QJJgwGdmRP9txXLbvUg1fFnz8xSQ6u08Fyqlwpd_4qBiSEGRVE_UoYIZXVNJ70s'
const DEFAULT_VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'dRa-HQU1cXX0tlYYgwhUjp1eyHJqsIxuUR6qMvzSV5Q'

function base64UrlToBuffer(base64Url: string): Buffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64')
}

function bufferToBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generates a valid VAPID Key pair (P-256)
 */
export function generateVapidKeys(): VapidKeys {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    publicKey: bufferToBase64Url(ecdh.getPublicKey()),
    privateKey: bufferToBase64Url(ecdh.getPrivateKey()),
  }
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY
}

/**
 * Creates a signed VAPID Authorization JWT
 */
function createVapidJwt(audience: string, subject: string, privateKeyBase64Url: string): string {
  const header = { alg: 'ES256', typ: 'JWT' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600, // 12 hours
    sub: subject,
  }

  const encodedHeader = bufferToBase64Url(Buffer.from(JSON.stringify(header)))
  const encodedPayload = bufferToBase64Url(Buffer.from(JSON.stringify(payload)))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  // Convert private key into PEM format for crypto.sign
  const privKeyBuffer = base64UrlToBuffer(privateKeyBase64Url)
  
  // Construct DER / PKCS8 EC private key header for P-256
  const pkcs8Header = Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex')
  const pkcs8Footer = Buffer.from('a144034200', 'hex')
  
  // Generate matching public key to complete PKCS8 structure if needed
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(privKeyBuffer)
  const pubKeyBuffer = ecdh.getPublicKey()
  
  const derKey = Buffer.concat([pkcs8Header, privKeyBuffer, pkcs8Footer, pubKeyBuffer])
  const pemKey = `-----BEGIN PRIVATE KEY-----\n${derKey.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`

  const signer = crypto.createSign('SHA256')
  signer.update(unsignedToken)
  const signature = signer.sign(pemKey)

  return `${unsignedToken}.${bufferToBase64Url(signature)}`
}

/**
 * Encrypts payload for Web Push (RFC 8291 aes128gcm)
 */
function encryptPayload(payloadText: string, recipientKeys: PushSubscriptionKeys): { body: Buffer; salt: Buffer; localPublicKey: Buffer } {
  const localEcdh = crypto.createECDH('prime256v1')
  localEcdh.generateKeys()

  const localPublicKey = localEcdh.getPublicKey()
  const recipientPublicKey = base64UrlToBuffer(recipientKeys.p256dh)
  const recipientAuth = base64UrlToBuffer(recipientKeys.auth)

  const sharedSecret = localEcdh.computeSecret(recipientPublicKey)

  // HKDF Derivation for Key Agreement (RFC 8291)
  const authInfo = Buffer.from('WebPush: info\0', 'utf8')
  const ikm = crypto.hkdfSync('sha256', sharedSecret, recipientAuth, Buffer.concat([authInfo, recipientPublicKey, localPublicKey]), 32)

  const salt = crypto.randomBytes(16)

  // PRK & Key / Nonce derivation
  const keyInfo = Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), Buffer.from([0x01])])
  const nonceInfo = Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf8'), Buffer.from([0x01])])

  const prk = crypto.hkdfSync('sha256', Buffer.from(ikm), salt, keyInfo, 16)
  const nonce = crypto.hkdfSync('sha256', Buffer.from(ikm), salt, nonceInfo, 12)

  // Add 2-byte delimiter padding (RFC 8188)
  const record = Buffer.concat([Buffer.from(payloadText, 'utf8'), Buffer.from([0x02])])

  const cipher = crypto.createCipheriv('aes-128-gcm', Buffer.from(prk), Buffer.from(nonce))
  const ciphertext = cipher.update(record)
  const finalCipher = cipher.final()
  const authTag = cipher.getAuthTag()

  // aes128gcm payload format: salt (16) + record_size (4) + idlen (1) + keyid (localPublicKey) + ciphertext + tag
  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(4096, 0)

  const keyIdLen = Buffer.from([localPublicKey.length])

  const encryptedBody = Buffer.concat([
    salt,
    recordSize,
    keyIdLen,
    localPublicKey,
    ciphertext,
    finalCipher,
    authTag,
  ])

  return { body: encryptedBody, salt, localPublicKey }
}

/**
 * Sends Web Push notification to a browser push endpoint
 */
export async function sendWebPushNotification(
  subscription: PushSubscriptionObj,
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const endpointUrl = new URL(subscription.endpoint)
    const audience = `${endpointUrl.protocol}//${endpointUrl.hostname}`
    const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@dtce.org'

    const vapidPublic = getVapidPublicKey()
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY

    const jwt = createVapidJwt(audience, subject, vapidPrivate)
    const authHeader = `vapid t=${jwt}, k=${vapidPublic}`

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: payload.url || '/dashboard',
        tag: payload.tag || 'dtce-notification',
      },
    })

    const { body: encryptedBody } = encryptPayload(payloadString, subscription.keys)

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'TTL': '86400',
        'Urgency': 'high',
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
      },
      body: new Uint8Array(encryptedBody),
    })

    if (res.status === 201 || res.status === 200 || res.status === 202) {
      return { success: true, status: res.status }
    } else {
      console.warn(`[WebPush] Server returned status ${res.status}: ${await res.text().catch(() => '')}`)
      return { success: false, status: res.status, error: `HTTP ${res.status}` }
    }
  } catch (err: any) {
    console.error('[WebPush] Dispatch error:', err)
    return { success: false, error: err.message }
  }
}
