/**
 * Runs once when the server starts.
 *
 * On the OPD server (CLOUD_SYNC_DATABASE_URL set), starts the background copy of the
 * local database up to the cloud. Does nothing on Vercel or when the variable is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.CLOUD_SYNC_DATABASE_URL || process.env.VERCEL) return;
  const { startCloudSync } = await import('./server/sync/cloudSync');
  startCloudSync();
}
