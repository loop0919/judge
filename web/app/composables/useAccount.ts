import { profileResultSchema, type Profile } from '~/utils/profile'
export function useAccount() {
  const user = useState<{ id: string } | null>('account-user', () => null)
  const profile = useState<Profile | null>('account-profile', () => null)
  async function refreshProfile() {
    const owner = user.value?.id
    const result = profileResultSchema.parse(await $fetch('/api/my/profile'))
    if (user.value?.id !== owner) throw new Error('Account changed')
    profile.value = result.profile
    return result.profile
  }
  async function refreshAccount() {
    const result = await $fetch<{ user: { id: string } | null }>('/api/auth/me')
    if (user.value?.id !== result.user?.id) profile.value = null
    user.value = result.user
    return result.user
  }
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    profile.value = null
    await navigateTo('/login')
  }
  return { user, profile, refreshAccount, refreshProfile, logout }
}
