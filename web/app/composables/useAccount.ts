export function useAccount() {
  const user = useState<{ id: string } | null>('account-user', () => null)
  async function refreshAccount() {
    const result = await $fetch<{ user: { id: string } | null }>('/api/auth/me')
    user.value = result.user
    return result.user
  }
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }
  return { user, refreshAccount, logout }
}
