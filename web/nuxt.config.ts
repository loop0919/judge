import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  ssr: true,
  nitro: {
    serveStatic: true,
    ...(process.env.OPENOJ_LAMBDA_BUILD === '1' ? { preset: 'aws-lambda', output: { dir: '.output-lambda' } } : {}),
  },
  devtools: { enabled: false },
  css: ['katex/dist/katex.min.css', '~/assets/css/main.css', '~/assets/css/editor.css', '~/assets/css/blog.css'],
  runtimeConfig: {
    apiBaseUrl: 'http://127.0.0.1:8080',
    public: { siteUrl: 'http://localhost:3000' },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      title: 'OpenOJ — Open Online Judge',
      meta: [
        { name: 'theme-color', content: '#ffffff' },
        { property: 'og:site_name', content: 'OpenOJ' },
      ],
    },
  },
})
