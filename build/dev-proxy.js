/**
 * Dev server proxy.
 *
 * uni-app merges manifest.json's h5.devServer into vite's server config and lets
 * the manifest win on same-named keys, so the proxy lives here (where vite's
 * loadEnv can read .env) and manifest.json carries no proxy at all.
 *
 * The browser talks to `/api`; the dev server forwards it to the API origin.
 * Override the origin with DEV_PROXY_API (no VITE_ prefix on purpose: the value
 * must never be inlined into client code).
 */

export const DEV_PROXY_DEFAULTS = {
  '/api': 'https://api.lunatalk.ai',
}

export const DEV_PROXY_ENV_MAP = {
  '/api': 'DEV_PROXY_API',
}

function pick(env, path) {
  const raw = env && env[DEV_PROXY_ENV_MAP[path]]
  return (typeof raw === 'string' && raw.trim()) ? raw.trim() : DEV_PROXY_DEFAULTS[path]
}

function stripPrefix(prefix) {
  return (path) => path.replace(new RegExp(`^${prefix}`), '')
}

/**
 * @param {Record<string,string>} env from vite's loadEnv
 * @returns vite server.proxy config
 */
export function buildDevProxy(env) {
  return {
    '/api': {
      target: pick(env, '/api'),
      changeOrigin: true,
      secure: false,
      ws: true,
      rewrite: stripPrefix('/api'),
    },
  }
}
