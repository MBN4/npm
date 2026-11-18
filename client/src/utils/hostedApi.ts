// The hosted site (Vercel) forwards /api/* to the Fly.io server. Large or slow requests such as
// invoice photos can fail inside that forwarder (it gives up after a short time and answers with a
// plain-text error page instead of JSON), so uploads go straight to the API server on the hosted site.
export const HOSTED_API_ORIGIN = 'https://nmp-api.fly.dev';

export function isHostedSite(): boolean {
  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.fly.dev')) return false;
  if (/^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) return false;
  return true;
}
