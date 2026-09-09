import { createHash, randomBytes } from 'node:crypto'
import { googleOAuthConfig, oauthCookie } from '../../../utils/google-oauth'
import { cookieOptions, privateHeaders } from '../../../utils/private-api'

export default defineEventHandler(event => {
  privateHeaders(event)
  const config = googleOAuthConfig(event)
  if (!config) return sendRedirect(event, '/login?socialError=unavailable', 303)
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  setCookie(event, oauthCookie, `${state}.${verifier}`, { ...cookieOptions(event), maxAge: 600 })
  const url = new URL('/oauth2/authorize', config.domain)
  url.search = new URLSearchParams({
    identity_provider: 'Google', response_type: 'code', client_id: config.clientId,
    redirect_uri: config.redirectUri, scope: 'openid email', state,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString()
  return sendRedirect(event, url.href, 302)
})
