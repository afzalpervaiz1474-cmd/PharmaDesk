import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()];
  try {
    // Optional, git-ignored helper used only by the hosted preview tooling.
    // @ts-expect-error -- the file has no type declarations and may not exist.
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {
    // Not present in a normal checkout; nothing to do.
  }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  // The Tauri CLI sets TAURI_ENV_* when it starts the dev server; it expects a fixed port.
  const underTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

  return {
    plugins,
    clearScreen: false,
    server: underTauri ? { port: 1420, strictPort: true } : undefined,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
