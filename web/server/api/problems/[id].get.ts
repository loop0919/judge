import { publicProblemSchema } from '~~/shared/types/problem'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (id.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Problem not found' })
  }

  const config = useRuntimeConfig(event)
  let response: unknown
  try {
    response = await $fetch(`/problems/${encodeURIComponent(id)}`, {
      baseURL: config.apiBaseUrl,
      timeout: 5000,
      retry: 0,
    })
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) {
      throw createError({ statusCode: 404, statusMessage: 'Problem not found' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Problem service unavailable' })
  }

  const result = publicProblemSchema.safeParse(response)
  if (!result.success || result.data.id !== id) {
    throw createError({ statusCode: 502, statusMessage: 'Invalid problem response' })
  }
  return result.data
})
