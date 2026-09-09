import type { H3Event } from 'h3'

export const oauthCookie = 'openoj_google_flow'

export function googleOAuthConfig(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.cognitoDomain || !config.cognitoClientId) return null
  try {
    const domain = new URL(config.cognitoDomain)
    if (domain.protocol !== 'https:' || domain.username || domain.password || domain.search || domain.hash || domain.pathname !== '/') return null
    return {
      domain: domain.origin,
      clientId: config.cognitoClientId,
      clientSecret: config.cognitoClientSecret,
      redirectUri: new URL('/auth/google/callback', config.public.siteUrl).href,
    }
  } catch { return null }
}
