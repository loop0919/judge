export function useSharePreview(options: {
  title: MaybeRefOrGetter<string>
  path: MaybeRefOrGetter<string>
  description?: MaybeRefOrGetter<string>
  enabled?: MaybeRefOrGetter<boolean>
  type?: 'article' | 'website'
}) {
  const config = useRuntimeConfig()
  const enabled = () => options.enabled === undefined || toValue(options.enabled)
  const title = () => enabled() ? `${toValue(options.title)} | ShareOJ` : undefined
  const description = () => enabled() && options.description !== undefined ? toValue(options.description) : undefined
  const image = () => enabled() ? new URL(`/og${toValue(options.path) === '/' ? '/index' : toValue(options.path)}.png`, config.public.siteUrl).href : undefined
  useSeoMeta({
    ogType: () => enabled() ? options.type ?? 'article' : undefined,
    ogTitle: title, ogDescription: description,
    ogUrl: () => enabled() ? new URL(toValue(options.path), config.public.siteUrl).href : undefined,
    ogImage: image, ogImageType: () => enabled() ? 'image/png' : undefined,
    ogImageWidth: () => enabled() ? 1200 : undefined, ogImageHeight: () => enabled() ? 630 : undefined,
    ogImageAlt: title,
    twitterCard: () => enabled() ? 'summary_large_image' : undefined,
    twitterTitle: title, twitterDescription: description, twitterImage: image, twitterImageAlt: title,
  })
}
