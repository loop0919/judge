import { loginDestination } from '~~/shared/utils/login-destination'
import { profileResultSchema } from '../../../../app/utils/profile'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { googleOAuthConfig, oauthCookie } from '../../../utils/google-oauth'
import { cookieOptions, privateAPI, privateHeaders, saveSession, sessionTokensSchema } from '../../../utils/private-api'

const tokenSchema = sessionTokensSchema.extend({ token_type: z.string().regex(/^Bearer$/i) })

export default defineEventHandler(async event => {
  privateHeaders(event)
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  const flow = getCookie(event, oauthCookie) ?? ''
  deleteCookie(event, oauthCookie, cookieOptions(event))
  const query = getQuery(event)
  const config = googleOAuthConfig(event)
  const [state, verifier, encodedNext = ''] = flow.split('.')
  const next = loginDestination(Buffer.from(encodedNext, 'base64url').toString('utf8'))
  if (!config || !state || !verifier || !/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(verifier)
    || typeof query.state !== 'string' || Buffer.byteLength(query.state) !== Buffer.byteLength(state)
    || !timingSafeEqual(Buffer.from(query.state), Buffer.from(state))
    || query.error || typeof query.code !== 'string' || !query.code || query.code.length > 4096) {
    return sendRedirect(event, '/login?socialError=failed', 303)
  }
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code: query.code, redirect_uri: config.redirectUri, code_verifier: verifier })
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (config.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
    const result = tokenSchema.parse(await $fetch(new URL('/oauth2/token', config.domain).href, { method: 'POST', body: body.toString(), headers, timeout: 12000, retry: 0, redirect: 'error' }))
    await privateAPI<{ id: string }>(event, '/auth/me', { token: result.access_token })
    const account = profileResultSchema.parse(await privateAPI(event, '/my/profile', { token: result.access_token }))
    saveSession(event, result, true)
    return sendRedirect(event, account.profile ? next : (next === '/my' ? '/onboarding' : `/onboarding?${new URLSearchParams({ next })}`), 303)
  } catch {
    return sendRedirect(event, '/login?socialError=failed', 303)
  }
})
