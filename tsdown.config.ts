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

// Must equal package.json's `name`. The client module table attaches a package's
// browser half to the Loader row whose specifier is exactly this value, so a
// mismatch loads the Host half and silently never renders the sidebar tab.
const PACKAGE_NAME = 'dsh-side-chat-plugin'

/**
 * Runtime packages that must travel inside the Host artifact.
 *
 * The Harness provides its own packages to a plugin at run time — except
 * Schemastery, which the plugin needs for its Config schema and which a user's
 * profile has no reason to hold. Inlining it (and the two small packages it
 * pulls in) is what keeps `lib/index.js` free of every external import but its
 * own sibling module.
 *
 * Because all three are inlined, Schemastery must stay a **devDependency**:
 * listing it under `dependencies` would make every install resolve it from a
 * registry even though the built artifact never imports it, which breaks
 * installing the packed tarball on a machine with no network. Measured: with it
 * declared, `pnpm install --offline` against an unreachable registry fails with
 * ERR_PNPM_NO_OFFLINE_META; with it only in devDependencies the same install
 * succeeds and the imported `lib/index.js` still exposes a working Config.
 */
const INLINED_RUNTIME = [
  '@deepseek-ai/schemastery',
  '@deepseek-ai/cosmokit',
  '@standard-schema/spec',
]

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
      // Node builtins stay external, and everything the Host half imports at run
      // time is inlined — which is exactly `@deepseek-ai/schemastery`, the Config
      // schema. A user's profile has no reason to already hold Schemastery (the
      // Host does not hand it to plugins), so leaving it external would be a load
      // failure waiting to happen. `alwaysBundle` is what forces it: tsdown
      // externalizes a package.json `dependency` by default, and dropping it from
      // `neverBundle` alone leaves the import in the artifact.
      neverBundle: [/^node:/],
      alwaysBundle: INLINED_RUNTIME,
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
