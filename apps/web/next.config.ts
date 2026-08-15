import type { NextConfig } from 'next';

/**
 * The API lives in this app, at src/app/api/v1/**, and is reached same-origin. That
 * works unchanged in both deployments — Vercel serverless and `next start` on the OPD
 * server — so the normal case needs no configuration at all.
 *
 * LEGACY_API_URL is a migration aid, not part of the target setup. While endpoints are
 * still being moved off NestJS, set it to the old API and un-migrated paths fall
 * through to it, so each endpoint switches over the moment its handler lands.
 *
 * This must go in the `fallback` phase, not the default array form. Next checks
 * non-dynamic routes (5), then `afterFiles` rewrites (6), then dynamic routes (7),
 * then `fallback` rewrites (8). The array form is `afterFiles`, which sits *above*
 * dynamic routes — so it silently shadows every `[id]` handler while letting static
 * ones through. `fallback` runs after all route handlers have had their turn.
 *
 * Delete the variable once the migration is done.
 */
const legacyApiUrl = process.env.LEGACY_API_URL?.replace(/\/+$/, '');
const isDev = process.env.NODE_ENV !== 'production';

// Local development still has the NestJS server on :4000 for whatever has not moved yet.
const fallbackTarget = legacyApiUrl || (isDev ? 'http://127.0.0.1:4000' : null);

const nextConfig: NextConfig = {
  async rewrites() {
    if (!fallbackTarget) return { beforeFiles: [], afterFiles: [], fallback: [] };

    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/v1/:path*',
          destination: `${fallbackTarget}/api/v1/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
