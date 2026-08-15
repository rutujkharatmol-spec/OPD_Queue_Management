import type { NextConfig } from 'next';

/**
 * Two supported deployments:
 *
 * 1. On-prem OPD server (the one that must survive an internet outage).
 *    Set API_PROXY_TARGET=http://127.0.0.1:4000. The browser calls same-origin
 *    /api/v1 and Next proxies to the local API. Because the target is resolved on
 *    the server, terminals just browse to http://<server-ip>:3000 and the server's
 *    IP is never baked into the client bundle — change the IP, no rebuild needed.
 *
 * 2. Cloud mirror on Vercel (read-only patient view for phones on mobile data).
 *    Set NEXT_PUBLIC_API_URL=https://<api-host>. The browser calls that origin
 *    directly, so no Vercel function is invoked per request.
 */
const proxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
const isProd = process.env.NODE_ENV === 'production';

// NEXT_PUBLIC_* is inlined at build time, so a production bundle built without any
// API target can never reach the backend. Fail the build rather than ship a
// frontend that silently proxies every call to localhost.
if (isProd && !proxyTarget && !publicApiUrl) {
  throw new Error(
    'No API target configured. Set API_PROXY_TARGET=http://127.0.0.1:4000 for the ' +
      'on-prem OPD server, or NEXT_PUBLIC_API_URL=https://<api-host> for a cloud ' +
      'deployment, then rebuild. See .env.example.'
  );
}

// Local dev falls back to the API's default port so `pnpm dev` needs no configuration.
const devTarget = proxyTarget || publicApiUrl || 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    // When NEXT_PUBLIC_API_URL is set the browser already calls the API directly,
    // so proxying would just add a hop (and a serverless invocation on Vercel).
    if (isProd && !proxyTarget) return [];

    return [
      {
        source: '/api/v1/:path*',
        destination: `${devTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
