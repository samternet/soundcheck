import crypto from 'node:crypto'
import fs from 'node:fs'
import { DATA_DIR, SECRET_FILE } from './config.js'

const SECRET_BYTES = 32
const OWNER_READ_WRITE = 0o600

fs.mkdirSync(DATA_DIR, { recursive: true })
let secret: string
if (process.env.SOUNDCHECK_SECRET) secret = process.env.SOUNDCHECK_SECRET
else {
  if (!fs.existsSync(SECRET_FILE))
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(SECRET_BYTES).toString('hex'), {
      mode: OWNER_READ_WRITE,
    })
  secret = fs.readFileSync(SECRET_FILE, 'utf8').trim()
}
const CIPHER = 'aes-256-gcm'
const IV_BYTES = 12 // 96-bit nonce, the size GCM is specified for
const key = crypto.createHash('sha256').update(secret).digest()

export function encrypt(value: string) {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(CIPHER, key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}
export function decrypt(ciphertext: string, iv: string, tag: string) {
  const decipher = crypto.createDecipheriv(CIPHER, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
