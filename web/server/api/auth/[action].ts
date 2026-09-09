import { z } from 'zod'
import { googleOAuthConfig } from '../../utils/google-oauth'
import { cookieOptions, limitedJSON, privateAPI, privateHeaders, requireSameOrigin, sessionCookie } from '../../utils/private-api'

const resultSchema = z.object({
  access_token: z.string().optional(), expires_in: z.number().int().positive().optional(),
  challenge_name: z.string().optional(), challenge_parameters: z.record(z.string(), z.string()).optional(), session: z.string().optional(),
})

export default defineEventHandler(async event => {
  privateHeaders(event)
  const action = getRouterParam(event, 'action')
  if (action === 'providers' && event.method === 'GET') return { google: Boolean(googleOAuthConfig(event)) }
  if (action === 'me' && event.method === 'GET') {
    if (!getCookie(event, sessionCookie)) return { user: null }
    try { return { user: await privateAPI<{ id: string }>(event, '/auth/me') } }
    catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 401) throw error
      deleteCookie(event, sessionCookie, cookieOptions(event))
      return { user: null }
    }
  }
  if (!['login', 'challenge', 'logout', 'signup', 'confirm-signup', 'resend-confirmation'].includes(action ?? '') || event.method !== 'POST') throw createError({ statusCode: 404 })
  requireSameOrigin(event)
  if (action === 'logout') {
    deleteCookie(event, sessionCookie, cookieOptions(event))
    return { user: null }
  }
  const body = await limitedJSON(event, 16 << 10)
  if (['signup', 'confirm-signup', 'resend-confirmation'].includes(action ?? '')) {
    const schema = action === 'resend-confirmation' ? z.object({ sent: z.literal(true) }) : z.object({ confirmed: z.boolean() })
    const result = schema.safeParse(await privateAPI(event, `/auth/${action}`, { method: 'POST', body }))
    if (!result.success) throw createError({ statusCode: 502 })
    return result.data
  }
  const result = resultSchema.safeParse(await privateAPI(event, `/auth/${action}`, { method: 'POST', body }))
  if (!result.success) throw createError({ statusCode: 502 })
  const data = result.data
  if (data.challenge_name && data.session) {
    return { challengeName: data.challenge_name, challengeParameters: data.challenge_parameters ?? {}, session: data.session }
  }
  if (!data.access_token || data.access_token.length > 3800 || !data.expires_in) throw createError({ statusCode: 502 })
  const user = await privateAPI<{ id: string }>(event, '/auth/me', { token: data.access_token })
  setCookie(event, sessionCookie, data.access_token, { ...cookieOptions(event), maxAge: Math.min(data.expires_in, 86400) })
  return { user }
})
