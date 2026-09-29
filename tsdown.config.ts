/**
 * Two artifacts, matching how DeepSeek Harness loads a plugin:
 *
 * - the Node half (`lib/index.js`), an ordinary ES module the Cordis Loader
 *   imports for the Host row in the profile composition;
 * - the browser half (`lib/client.js`), a CommonJS closure factory handed to
 *   `window.__ModuleLoader__`, which is the only shape the client module table
 *   accepts. Shared browser packages stay external and resolve through that
 *   table; everything else is inlined, because the browser bundle is fetched
 *   outside the page's module graph.
 */
import { defineConfig } from 'tsdown'

/** Specifiers the shell's frozen module table answers. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const PACKAGE_NAME = 'dsh-side-chat'

export default defineConfig([
  {
    name: PACKAGE_NAME,
    entry: ['src/index.ts', 'src/protocol.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // The Loader imports `lib/index.js`; the `.mjs`/`.d.mts` pair would not be
    // found by the `main`/`exports` this manifest declares.
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      // The Harness provides every @deepseek-ai package at runtime; nothing is
      // vendored into this artifact and nothing is installed with the plugin.
      neverBundle: [/^@deepseek-ai\//, /^node:/],
      alwaysBundle: () => false,
    },
  },
  {
    name: `${PACKAGE_NAME}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: PLATFORM_MODULES,
      alwaysBundle: (specifier: string) => !PLATFORM_MODULES.includes(specifier),
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{"MODE":"production"}',
    },
    outputOptions: {
      // The module table requires exactly this artifact name.
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
