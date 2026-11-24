// Utilidades del API: base de datos (D1), sesiones firmadas, contraseñas y registro de accesos.
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const ROLES = ['admin', 'supervisor'];
const DURACION = 30 * 24 * 3600; // la sesión dura 30 días

// Páginas que pueden usar el API (la de GitHub y la propia de Cloudflare)
const ORIGENES = ['https://jefaturatelearseg.github.io'];
export function cors(request) {
  const o = request.headers.get('Origin') || '';
  const permitido = ORIGENES.includes(o) || /^https:\/\/([a-z0-9-]+\.)?portal-desempeno\.pages\.dev$/.test(o);
  return permitido ? {
    'Access-Control-Allow-Origin': o, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Motivo, X-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Version', 'Access-Control-Max-Age': '86400',
  } : {};
}

// ---------- Base de datos ----------
export async function leer(env, clave) {
  const r = await env.DB.prepare('SELECT valor FROM config WHERE clave = ?').bind(clave).first();
  return r ? r.valor : null;
}
export const escribir = (env, clave, valor) => env.DB.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').bind(clave, valor).run();
export const usuarios = async (env) => JSON.parse((await leer(env, 'usuarios')) || '[]');
export const guardarUsuarios = (env, lista) => escribir(env, 'usuarios', JSON.stringify(lista));
export const publico = (u) => ({ correo: u.correo, nombre: u.nombre, rol: u.rol, creado: u.creado });

// ---------- Sesión (token que la página guarda y manda en cada pedido) ----------
async function clave(env) {
  return crypto.subtle.importKey('raw', enc.encode(env.SECRETO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function crearToken(env, u) {
  const datos = b64(enc.encode(JSON.stringify({ c: u.correo, v: u.ver || 0, e: Math.floor(Date.now() / 1000) + DURACION })));
  const firma = b64(await crypto.subtle.sign('HMAC', await clave(env), enc.encode(datos)));
  return `${datos}.${firma}`;
}
export async function leerSesion(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([^.\s]+)\.(\S+)$/);
  if (!m) return null;
  const ok = await crypto.subtle.verify('HMAC', await clave(env), deB64(m[2]), enc.encode(m[1])).catch(() => false);
  if (!ok) return null;
  const s = JSON.parse(new TextDecoder().decode(deB64(m[1])));
  if (s.e < Date.now() / 1000) return null;
  // Si el administrador cambió o quitó al usuario, la sesión deja de valer
  const u = (await usuarios(env)).find((x) => x.correo === s.c);
  if (!u || (u.ver || 0) !== s.v) return null;
  return { correo: u.correo, rol: u.rol, nombre: u.nombre };
}

export async function hashClave(texto, sal) {
  sal = sal || b64(crypto.getRandomValues(new Uint8Array(16)));
  const base = await crypto.subtle.importKey('raw', enc.encode(texto), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: 100000 }, base, 256);
  return { sal, hash: b64(bits) };
}

// Registro de quién entró y qué hizo
export async function registrar(env, request, correo, rol, accion) {
  const lugar = [request.cf?.city, request.cf?.country].filter(Boolean).join(', ');
  await env.DB.prepare('INSERT INTO accesos (fecha, correo, rol, accion, ip, lugar) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), correo || '', rol || '', accion, request.headers.get('CF-Connecting-IP') || '', lugar).run();
}
