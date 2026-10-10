/** Select the reviewed client revision for /essai only. No API interception,
 * eligibility decisions, secrets, cookies or payment data are read or changed.
 * Existing assets remain untouched and available at their original URLs.
 */
const original = '/_next/static/chunks/1jqq023am1z1e.js';
const revision = '/_next/static/chunks/1jqq023am1z1e.form-permissions-20261011-v1.js';
export default async function formClient(request, context) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' || !['/essai','/essai/'].includes(path)) return;
  const response = await context.next();
  if (response.status !== 200) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('text/x-component')) return response;
  const text = await response.text();
  const body = text.replaceAll(original, revision);
  const headers = new Headers(response.headers);
  for (const name of ['content-length','content-encoding','etag','last-modified']) headers.delete(name);
  if (headers.has('link')) headers.set('link',headers.get('link').replaceAll(original,revision));
  headers.set('cache-control','private, no-store');
  headers.set('cdn-cache-control','no-store');
  headers.set('netlify-cdn-cache-control','no-store');
  headers.set('x-hohoho-form-revision','form-permissions-20261011-v1');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
export const config = {path:['/essai','/essai/'],method:'GET',onError:'bypass'};
