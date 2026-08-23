import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEYLEN = 64
const SALT_BYTES = 16

/** scrypt$<saltHex>$<hashHex> 形式で保存する（ネイティブ依存を持たないため bcrypt は使わない） */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const hash = await scrypt(password, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

/** パスワードの最低要件 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return 'パスワードは10文字以上にしてください'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'パスワードは英字と数字を含めてください'
  return null
}
