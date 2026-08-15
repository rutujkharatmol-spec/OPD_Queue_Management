import { NextResponse } from 'next/server';

/**
 * Shared response shapes for the API routes.
 *
 * Clients treat any non-2xx as "did not happen" (see lib/offlineSync.ts), so the
 * status code carries real meaning here: a 5xx gets queued or retried, a 4xx is
 * dropped as permanently rejected. Returning the wrong class silently changes how the
 * offline layer behaves.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ message }, { status: 409 });
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 instead of an opaque crash.
 *
 * The real error is logged server-side but never returned: these responses reach a
 * public waiting-room display, and database errors leak schema details.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('[api] unhandled error:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  };
}

/** Reads a JSON body, treating malformed or absent JSON as an empty object. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
