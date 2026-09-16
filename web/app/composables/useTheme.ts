type ThemePreference = 'light' | 'dark' | 'system'

export function useTheme() {
  const saved = useCookie<string>('openoj-theme', { default: () => 'system', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' })
  const preference = computed<ThemePreference>({
    get: () => saved.value === 'light' || saved.value === 'dark' ? saved.value : 'system',
    set: value => { saved.value = value },
  })
  const systemDark = useState('system-dark', () => false)
  const dark = computed(() => preference.value === 'dark' || (preference.value === 'system' && systemDark.value))
  return { preference, systemDark, dark }
}
