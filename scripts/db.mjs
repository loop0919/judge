import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dir = `${root}.local/postgres`
const socket = `${root}.local/postgres-socket`
export const localDatabaseURL = 'postgresql://openoj:openoj-local@127.0.0.1:15432/openoj?sslmode=disable'

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error(`${command} failed`)
}

export function startDatabase() {
  mkdirSync(socket, { recursive: true, mode: 0o700 })
  if (!existsSync(`${dir}/PG_VERSION`)) {
    const pw = `${root}.local/postgres-password`
    writeFileSync(pw, 'openoj-local\n', { mode: 0o600 })
    run('initdb', ['-D', dir, '-U', 'openoj', '--pwfile', pw, '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8', '--no-locale'])
  }
  if (spawnSync('pg_ctl', ['-D', dir, 'status'], { stdio: 'ignore' }).status !== 0) {
    run('pg_ctl', ['-D', dir, '-l', `${root}.local/postgres.log`, '-o', `-h 127.0.0.1 -p 15432 -k ${socket}`, '-w', 'start'])
  }
  const exists = spawnSync('psql', ['-h', socket, '-p', '15432', '-U', 'openoj', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'openoj'"], { encoding: 'utf8' })
  if (exists.status !== 0) throw new Error('Cannot inspect local PostgreSQL')
  if (exists.stdout.trim() !== '1') run('createdb', ['-h', socket, '-p', '15432', '-U', 'openoj', 'openoj'])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'stop') run('pg_ctl', ['-D', dir, '-m', 'fast', '-w', 'stop'])
    else startDatabase()
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
