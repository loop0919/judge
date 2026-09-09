export default defineNuxtRouteMiddleware(async to => {
  if (import.meta.server) return
  if (!(to.path === '/my' || to.path.startsWith('/my/') || to.path === '/problems/new' || to.path === '/blog/new' || to.path === '/onboarding')) return
  const app = useNuxtApp()
  const { refreshAccount, refreshProfile } = useAccount()
  async function guard() {
    try {
      const user = await refreshAccount()
      if (!user) return navigateTo({ path: '/login', query: { next: to.fullPath } }, { replace: true })
      const profile = await refreshProfile()
      if (!profile && to.path !== '/onboarding') return navigateTo('/onboarding', { replace: true })
      if (profile && to.path === '/onboarding') return navigateTo('/my', { replace: true })
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'プロフィールを読み込めませんでした。時間をおいて再読み込みしてください。' })
    }
  }
  // Initial HTML contains no private profile. Resolve the session after hydration
  // so the server markup and first client render stay identical.
  if (app.isHydrating) {
    onNuxtReady(() => {
      if (app.$router.currentRoute.value.fullPath !== to.fullPath) return
      void guard().catch(error => showError(error))
    })
    return
  }
  return guard()
})
