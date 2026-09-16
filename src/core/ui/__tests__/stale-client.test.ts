import { describe, expect, it } from 'vitest'
import { isStaleClientError } from '../stale-client'

const named = (name: string, message: string) => Object.assign(new Error(message), { name })

describe('telling an out-of-date tab from a crash', () => {
  it('knows an action id this build does not have', () => {
    expect(
      isStaleClientError(
        named('UnrecognizedActionError', 'Server Action "60dcd202b1" was not found on the server.')
      )
    ).toBe(true)
  })

  it('knows a script chunk the new build no longer serves', () => {
    expect(isStaleClientError(named('ChunkLoadError', 'Loading chunk 482 failed.'))).toBe(true)
    expect(isStaleClientError(new Error('Loading chunk app/page failed. (missing: /_next/x.js)'))).toBe(
      true
    )
    expect(
      isStaleClientError(new Error('Failed to fetch dynamically imported module: /_next/static/x.js'))
    ).toBe(true)
    expect(
      isStaleClientError(new Error('error loading dynamically imported module: /_next/static/x.js'))
    ).toBe(true)
  })

  it('leaves a real crash to the crash page, which asks for somebody to be told', () => {
    // The router says this for any reply that is not a server response — a
    // genuine 500 among them. "Just reload" would hide a real fault.
    expect(isStaleClientError(new Error('An unexpected response was received from the server.'))).toBe(
      false
    )
    // And nothing is judged by what it says about itself: one of the portal's
    // own messages must never be read as a stale tab.
    expect(isStaleClientError(new Error('That receipt was not found on the server.'))).toBe(false)
    expect(isStaleClientError(new Error('Failed to find the member’s chunk of the term'))).toBe(false)
    expect(isStaleClientError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleClientError(new Error('PrismaClientKnownRequestError'))).toBe(false)
  })

  it('is not upset by something that is not an error', () => {
    expect(isStaleClientError(null)).toBe(false)
    expect(isStaleClientError(undefined)).toBe(false)
    expect(isStaleClientError('ChunkLoadError')).toBe(false)
    expect(isStaleClientError({})).toBe(false)
  })
})
