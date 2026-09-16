import { expect, test } from '@playwright/test'
import { effectScope } from 'vue'
import { useLatestRequest } from '../app/composables/useLatestRequest'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('identical requests share work and only the newest key can publish a response', async () => {
  const scope = effectScope()
  const request = scope.run(useLatestRequest)!
  const first = deferred<string>()
  const second = deferred<string>()
  const values: string[] = []
  const errors: unknown[] = []
  let calls = 0
  const fetch = () => { calls++; return first.promise }
  const a = request.run('first', fetch, value => values.push(value), error => errors.push(error))
  const duplicate = request.run('first', fetch, value => values.push(value), error => errors.push(error))
  expect(duplicate).toBe(a)
  const b = request.run('second', () => second.promise, value => values.push(value), error => errors.push(error))
  first.resolve('stale')
  await a
  expect(calls).toBe(1)
  expect(request.loading.value).toBe(true)
  expect(values).toEqual([])
  second.resolve('current')
  await b
  expect(values).toEqual(['current'])
  expect(errors).toEqual([])
  expect(request.loading.value).toBe(false)
  scope.stop()
})

test('invalidated errors and responses after disposal cannot update the consumer', async () => {
  const scope = effectScope()
  const request = scope.run(useLatestRequest)!
  const old = deferred<string>()
  const current = deferred<string>()
  const values: unknown[] = []
  const apply = (value: unknown) => { values.push(value) }
  const a = request.run('old', () => old.promise, apply, apply)
  request.invalidate()
  const b = request.run('new', () => current.promise, apply, apply)
  old.reject(new Error('stale error'))
  await a
  expect(request.loading.value).toBe(true)
  scope.stop()
  current.resolve('after disposal')
  await b
  await request.run('disposed', async () => { throw new Error('must not run') }, apply, apply)
  expect(values).toEqual([])
  expect(request.loading.value).toBe(false)
})

test('an older response cannot replace a newer result that has already completed', async () => {
  const scope = effectScope()
  const request = scope.run(useLatestRequest)!
  const old = deferred<string>()
  const values: string[] = []
  const errors: unknown[] = []
  const a = request.run('old', () => old.promise, value => values.push(value), error => errors.push(error))
  await request.run('new', async () => 'new', value => values.push(value), error => errors.push(error))
  expect(request.loading.value).toBe(false)
  old.resolve('old')
  await a
  expect(values).toEqual(['new'])
  expect(errors).toEqual([])
  scope.stop()
})
