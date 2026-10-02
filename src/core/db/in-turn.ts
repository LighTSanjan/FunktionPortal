/**
 * Run a transaction's queries one after another, as Promise.all would run
 * them together.
 *
 * Inside dbAs every query shares one connection, and pg will not take a query
 * on a connection that is still answering the last one (a warning now, an
 * error in pg 9). Prisma's queries are lazy — nothing is sent until the query
 * is awaited — so handing them over unawaited and awaiting them here in turn
 * keeps them in order. A query already awaited elsewhere gains nothing from
 * this.
 */
export async function inTurn<const T extends readonly unknown[]>(
  queries: { [K in keyof T]: PromiseLike<T[K]> }
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const results: unknown[] = []
  for (const query of queries as readonly PromiseLike<unknown>[]) results.push(await query)
  return results as { -readonly [K in keyof T]: Awaited<T[K]> }
}
