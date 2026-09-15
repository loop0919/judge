// AWS Runtime API adapter for Nitro's API Gateway v2 handler.
const endpoint = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime`
async function request(path, body) {
  const response = await fetch(`${endpoint}/${path}`, {
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    // Lambda can freeze the process while waiting for an invocation.
    timeout: false,
  })
  if (!response.ok) throw new Error(`Runtime API ${path}: ${response.status}`)
  return response
}
function failure(error) {
  console.error(error)
  return { errorType: error?.name ?? 'Error', errorMessage: String(error?.message ?? error), stackTrace: error?.stack?.split('\n') ?? [] }
}

let handler
try {
  handler = (await import('./server/index.mjs')).handler
  if (typeof handler !== 'function') throw new Error('Missing Nitro Lambda handler')
} catch (error) {
  await request('init/error', failure(error))
  process.exit(1)
}
while (true) {
  const invocation = await request('invocation/next')
  const id = invocation.headers.get('lambda-runtime-aws-request-id')
  if (!id) throw new Error('Missing Lambda request ID')
  const trace = invocation.headers.get('lambda-runtime-trace-id')
  if (trace) process.env._X_AMZN_TRACE_ID = trace
  else delete process.env._X_AMZN_TRACE_ID
  let result, outcome = 'response'
  try {
    result = await handler(await invocation.json(), {
      awsRequestId: id,
      getRemainingTimeInMillis: () => Math.max(0, Number(invocation.headers.get('lambda-runtime-deadline-ms')) - Date.now()),
    })
  } catch (error) {
    result = failure(error)
    outcome = 'error'
  }
  await request(`invocation/${encodeURIComponent(id)}/${outcome}`, result)
}
