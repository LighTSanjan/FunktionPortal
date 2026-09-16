'use client'

/** The error Next throws when a tab posts an action this build does not have. */
export function ThrowStale(): never {
  throw Object.assign(new Error('Server Action "0000000000" was not found on the server.'), {
    name: 'UnrecognizedActionError',
  })
}
