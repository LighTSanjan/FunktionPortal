import { describe, expect, it } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { serviceAccountFromEnv, signedAssertion, SheetsError } from '../sheets'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const account = {
  client_email: 'portal@club.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}

describe('Google service account', () => {
  it('signs an assertion Google can verify, for read-only access, for an hour', () => {
    const jwt = signedAssertion(account, 1_000_000)
    const [header, claims, signature] = jwt.split('.')
    const ok = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'))
    expect(ok).toBe(true)
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString())
    expect(body).toMatchObject({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      iat: 1_000_000,
      exp: 1_003_600,
    })
  })

  it('reads the key file raw or base64-encoded, and refuses anything else', () => {
    const json = JSON.stringify(account)
    expect(serviceAccountFromEnv(json).client_email).toBe(account.client_email)
    expect(serviceAccountFromEnv(Buffer.from(json).toString('base64')).client_email).toBe(account.client_email)
    expect(() => serviceAccountFromEnv(JSON.stringify({ hello: 1 }))).toThrow(SheetsError)
    expect(() => serviceAccountFromEnv('')).toThrow(SheetsError)
  })
})
