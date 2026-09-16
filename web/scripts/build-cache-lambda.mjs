import { build } from 'esbuild'
await build({ entryPoints: ['scripts/profile-cache-handler.mjs'], outfile: '.output-lambda/server/profile-cache.mjs', bundle: true, platform: 'node', target: 'node22', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
