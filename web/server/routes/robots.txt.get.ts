export default defineEventHandler(event => {
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  const sitemap = new URL('/sitemap.xml', useRuntimeConfig(event).public.siteUrl).href
  // Keep noindex pages crawlable so search engines can read their robots meta tags.
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`
})
