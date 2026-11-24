// API del Portal de Desempeño en Cloudflare Pages.
// La página vive en GitHub Pages y llama a este API; aquí se responde el permiso de navegador (CORS).
import { cors } from './_lib.js';

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const h = cors(ctx.request);
  if (url.pathname.startsWith('/api/') && ctx.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (!url.pathname.startsWith('/api/')) return ctx.next();
  let r;
  try { r = await ctx.next(); } catch (e) { r = Response.json({ error: 'Error del servidor' }, { status: 500 }); }
  const out = new Response(r.body, r);
  for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
  return out;
}
