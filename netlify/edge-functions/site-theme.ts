import type { Context, Config } from '@netlify/edge-functions';

/** Add a versioned presentation stylesheet to HTML documents only.
 * Original React markup, JavaScript, RSC streams, APIs and payment requests stay intact.
 * A new asset URL also updates phones that cached last year's application stylesheet.
 */
export default async function siteTheme(request: Request, context: Context): Promise<Response> {
  const url = new URL(request.url);
  const excluded = url.pathname === '/' || /^\/(?:api|_next|\.netlify|branding-20261006|branding-internal)(?:\/|$)/.test(url.pathname);
  if (excluded || request.method !== 'GET' || request.headers.has('rsc') || request.headers.get('accept')?.includes('text/x-component')) {
    return context.next();
  }
  const response = await context.next();
  if (response.status !== 200 || !response.body || !response.headers.get('content-type')?.includes('text/html')) return response;
  const injection = '<link rel="stylesheet" href="/branding-internal/theme-20261006-v1.css" data-hohoho-theme="20261006-v1">';
  let pending = '';
  let complete = false;
  const transform = new TransformStream<string, string>({
    transform(chunk, controller) {
      if (complete) { controller.enqueue(chunk); return; }
      pending += chunk;
      const end = pending.toLowerCase().indexOf('</head>');
      if (end >= 0) {
        if (!pending.includes('data-hohoho-theme="20261006-v1"')) {
          const head = pending.slice(0, end).replace(/(<meta\b[^>]*name=["']theme-color["'][^>]*content=["'])[^"']*(["'])/i, '$1#850909$2');
          controller.enqueue(head + injection + pending.slice(end));
        } else controller.enqueue(pending);
        complete = true; pending = '';
      } else if (pending.length > 131072) {
        // Unexpected document: fail open without touching the original response body.
        controller.enqueue(pending); pending = ''; complete = true;
      }
    },
    flush(controller) { if (pending) controller.enqueue(pending); }
  });
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
  headers.set('X-HoHoHo-Theme', '20261006-v1');
  const body = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(transform).pipeThrough(new TextEncoderStream());
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
export const config: Config = {
  path: '/*',
  excludedPath: ['/api/*', '/_next/*', '/.netlify/*', '/branding-20261006/*', '/branding-internal/*']
};
