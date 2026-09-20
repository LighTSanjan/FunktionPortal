import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('authentication email assets', () => {
  it.each([
    ['logo', 'image/png', [0x89, 0x50, 0x4e, 0x47]],
    ['crew', 'image/jpeg', [0xff, 0xd8, 0xff]],
  ] as const)('serves the allow-listed %s image', async (asset, type, signature) => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ asset }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(type)
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, signature.length)]).toEqual([...signature])
  })

  it('does not turn the route into an arbitrary file reader', async () => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ asset: '../../.env' }) })
    expect(response.status).toBe(404)
  })
})
