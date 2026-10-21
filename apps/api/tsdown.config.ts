import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  deps: { alwaysBundle: [/^@vinimon\//] },
})
