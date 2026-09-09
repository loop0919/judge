import type { H3Event } from 'h3'

export const sessionCookie = 'openoj_access'

export function privateHeaders(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Vary', 'Cookie')
}

export function requireSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  const expected = new URL(useRuntimeConfig(event).public.siteUrl).origin
  if (origin !== expected) throw createError({ statusCode: 403, statusMessage: 'Invalid origin' })
}

export function cookieOptions(event: H3Event) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: new URL(useRuntimeConfig(event).public.siteUrl).protocol === 'https:', path: '/' }
}

export async function privateAPI<T>(event: H3Event, path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, token?: string } = {}): Promise<T> {
  const token = options.token ?? getCookie(event, sessionCookie)
  try {
    return await $fetch<T>(path, {
      baseURL: useRuntimeConfig(event).apiBaseUrl,
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 12000, retry: 0,
    }) as T
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    throw createError({ statusCode: status && [400, 401, 403, 404, 409, 413, 415, 429, 503].includes(status) ? status : 502, statusMessage: 'Request failed' })
  }
}

// Read incrementally so chunked requests have the same limit as Content-Length requests.
export async function limitedJSON(event: H3Event, limit: number) {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  }
  const declaredLength = Number(getHeader(event, 'content-length'))
  if (declaredLength > limit) throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  // Nitro's Lambda adapter provides a buffered body, not a Node readable stream.
  if ('body' in event.node.req || 'rawBody' in event.node.req || event.web?.request) {
    const body = await readRawBody(event, false)
    if (body && body.length > limit) throw createError({ statusCode: 413, statusMessage: 'Request too large' })
    try { return JSON.parse(body?.toString('utf8') ?? '') as unknown }
    catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' }) }
  }
  const body = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let length = 0
    event.node.req.on('data', chunk => {
      length += chunk.length
      if (length > limit) {
        chunks.length = 0
        reject(createError({ statusCode: 413, statusMessage: 'Request too large' }))
        return // Drain subsequent chunks without retaining them or closing the response socket.
      }
      chunks.push(Buffer.from(chunk))
    })
    event.node.req.once('end', () => resolve(Buffer.concat(chunks)))
    event.node.req.once('error', reject)
    event.node.req.once('aborted', () => reject(createError({ statusCode: 400, statusMessage: 'Request aborted' })))
  })
  try { return JSON.parse(body.toString('utf8')) as unknown }
  catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' }) }
}
