import type { Instrumentation } from 'next'

/**
 * Every server error the app does not handle itself becomes an alert.
 *
 * The message goes out without the request's headers or query string —
 * those carry cookies and, on some routes, ids.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { alert } = await import('@/core/alerts')
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined
  // redirect() and notFound() travel as errors; they are not failures.
  if (digest?.startsWith('NEXT_')) return
  // The crash preview on Settings → All screens.
  if (error instanceof Error && error.message.startsWith('[preview]')) return

  await alert('server_error', {
    route: context.routePath,
    kind: context.routeType,
    method: request.method,
    // First line only: database errors go on to quote the values involved.
    error: error instanceof Error ? `${error.name}: ${error.message.split('\n')[0]}` : 'unknown',
    digest,
  })
}
