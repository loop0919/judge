import { hasSession } from '../../utils/private-session'
import { privateAPI } from '../../utils/private-api'
import { privateHeaders } from '../../utils/private-request'

export default defineEventHandler(async (event) => {
  privateHeaders(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
  let image: Blob
  try {
    image = await privateAPI<Blob>(event, `${hasSession(event) ? '/my' : ''}/images/${id}`)
  } catch (error) {
    // An expired session must not prevent reading a publicly visible image.
    const failure = error as { statusCode?: number, data?: { code?: string } }
    if (failure.statusCode !== 401 && failure.data?.code !== 'profile_required') throw error
    image = await privateAPI<Blob>(event, `/images/${id}`, { token: '' })
  }
  if (!['image/png', 'image/jpeg'].includes(image.type)) throw createError({ statusCode: 502 })
  setResponseHeader(event, 'Content-Type', image.type)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return Buffer.from(await image.arrayBuffer())
})
