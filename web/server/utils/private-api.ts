import type { H3Event } from 'h3'
import { z } from 'zod'

export const sessionCookie = 'openoj_access'
export const refreshCookie = 'openoj_refresh'
export const sessionTokensSchema = z.object({
  access_token: z.string().min(1).max(3800), expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).max(3800).optional(),
})

export function hasSession(event: H3Event) {
  return Boolean(getCookie(event, sessionCookie) || getCookie(event, refreshCookie))
}

export function clearPrivateSession(event: H3Event) {
  deleteCookie(event, sessionCookie, cookieOptions(event))
  deleteCookie(event, refreshCookie, cookieOptions(event))
}

export function saveSession(event: H3Event, tokens: z.infer<typeof sessionTokensSchema>, login = false) {
  setCookie(event, sessionCookie, tokens.access_token, { ...cookieOptions(event), maxAge: Math.min(tokens.expires_in, 86400) })
  // Matches the Cognito app client's 30-day refresh validity; Cognito enforces expiry.
  if (tokens.refresh_token) setCookie(event, refreshCookie, tokens.refresh_token, { ...cookieOptions(event), maxAge: 30 * 86400 })
  else if (login) deleteCookie(event, refreshCookie, cookieOptions(event))
}

async function refreshSession(event: H3Event) {
  const refreshToken = getCookie(event, refreshCookie)
  if (!refreshToken) throw createError({ statusCode: 401 })
  try {
    const tokens = sessionTokensSchema.parse(await $fetch('/auth/refresh', {
      baseURL: useRuntimeConfig(event).apiBaseUrl, method: 'POST', body: { refresh_token: refreshToken }, timeout: 12000, retry: 0,
    }))
    saveSession(event, tokens)
    return tokens.access_token
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 401) clearPrivateSession(event)
    throw createError({ statusCode: status && [401, 429, 503].includes(status) ? status : 502, statusMessage: 'Session refresh failed' })
  }
}

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

export async function privateAPI<T>(event: H3Event, path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, token?: string, timeout?: number } = {}): Promise<T> {
  let token = options.token ?? getCookie(event, sessionCookie)
  const canRefresh = options.token === undefined && (path === '/auth/me' || path.startsWith('/my/'))
  let refreshed = false
  if (!token && canRefresh && getCookie(event, refreshCookie)) { token = await refreshSession(event); refreshed = true }
  const request = () => $fetch<T>(path, {
      baseURL: useRuntimeConfig(event).apiBaseUrl,
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: options.timeout ?? 12000, retry: 0,
    }) as Promise<T>
  try {
    return await request()
  } catch (initialError) {
    let error = initialError
    if ((error as { response?: { status?: number } }).response?.status === 401 && canRefresh && !refreshed && getCookie(event, refreshCookie)) {
      token = await refreshSession(event)
      try { return await request() } catch (retryError) { error = retryError }
    }
    const status = (error as { response?: { status?: number } }).response?.status
    const upstreamCode = (error as { data?: { error?: string } }).data?.error
    const code = ['handle_taken', 'profile_conflict', 'profile_required', 'invalid_avatar', 'invalid_profile', 'tests_not_ready', 'judging_unavailable', 'invalid_submission'].includes(upstreamCode ?? '') ? upstreamCode : undefined
    throw createError({ statusCode: status && [400, 401, 403, 404, 409, 413, 415, 429, 503].includes(status) ? status : 502, statusMessage: 'Request failed', data: code ? { code } : undefined })
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
