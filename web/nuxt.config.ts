export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  ssr: true,
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
