import { z } from 'zod'
import { sharedProfileCache } from '../../utils/shared-profile-cache'

// https://yukicoder.me/api/swagger.yaml — GET /v1/user/{param}/{user}
const userName = defineCachedFunction(async (id: string) => {
  return sharedProfileCache(`yukicoder:${id}`, async () => {
    try {
      const data = await $fetch(`https://yukicoder.me/api/v1/user/id/${id}`, {
        timeout: 4000, retry: 0, redirect: 'error',
      })
      const user = z.object({ Name: z.string().trim().min(1).max(200) }).parse(data)
      return { name: user.Name }
    } catch {
      return { name: null }
    }
  })
}, { name: 'yukicoder-user-name', maxAge: 300, swr: false, getKey: id => id })

export default defineEventHandler(event => {
  const id = getQuery(event).id
  if (typeof id !== 'string' || !/^[0-9]{1,20}$/.test(id)) throw createError({ statusCode: 400 })
  return userName(id)
})
