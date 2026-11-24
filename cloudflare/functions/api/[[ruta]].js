// API: estado, setup, login, sesion, datos, evaluacion, usuarios, accesos
// - Ver el portal no pide ingreso (igual que el link de GitHub).
// - Supervisor: califica operadores. Una vez guardada, la evaluación queda bloqueada.
// - Administrador: cambia todo (evaluaciones, parámetros, horario, usuarios).
import { ROLES, crearToken, leerSesion, hashClave, usuarios, guardarUsuarios, publico, registrar, leer, escribir } from '../_lib.js';

const json = (d, status = 200, headers = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const correoValido = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c || '');
const SEMANA = /^\d{4}-S\d{2}$/;
const ID = /^[\w-]{1,40}$/;

async function datosCompletos(env) {
  const [txt, ver, evs] = await Promise.all([leer(env, 'datos'), leer(env, 'version'), env.DB.prepare('SELECT semana, op, datos FROM evaluaciones').all()]);
  if (!txt) return null;
  const d = JSON.parse(txt);
  d.evaluaciones = {};
  for (const e of evs.results) (d.evaluaciones[e.semana] = d.evaluaciones[e.semana] || {})[e.op] = JSON.parse(e.datos);
  return { d, ver: ver || '0' };
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/^\/api\//, '');
  const metodo = request.method;
  const q = url.searchParams;

  // ---------- Sin ingreso ----------
  if (ruta === 'estado') return json({ configurado: (await usuarios(env)).length > 0 });

  if (ruta === 'datos' && metodo === 'GET') {
    const r = await datosCompletos(env);
    if (!r) return json({ error: 'sin datos' }, 404);
    return json(r.d, 200, { 'X-Version': r.ver });
  }

  if (ruta === 'setup' && metodo === 'POST') {
    // Solo la primera vez y con el código inicial que quedó en la computadora del administrador
    if ((await usuarios(env)).length) return json({ error: 'El portal ya tiene administrador' }, 403);
    const b = await request.json().catch(() => ({}));
    if (!env.CODIGO || String(b.codigo || '').trim() !== env.CODIGO) return json({ error: 'Código inicial incorrecto' }, 403);
    if (!correoValido(b.correo) || String(b.clave || '').length < 8) return json({ error: 'Correo válido y contraseña de al menos 8 caracteres' }, 400);
    const u = { correo: b.correo.trim().toLowerCase(), nombre: String(b.nombre || 'Administrador').trim(), rol: 'admin', creado: new Date().toISOString(), ver: 1, ...(await hashClave(b.clave)) };
    await guardarUsuarios(env, [u]);
    await registrar(env, request, u.correo, u.rol, 'Cuenta de administrador creada');
    return json({ token: await crearToken(env, u), ...publico(u) });
  }

  if (ruta === 'login' && metodo === 'POST') {
    const b = await request.json().catch(() => ({}));
    const correo = String(b.correo || '').trim().toLowerCase();
    // 5 intentos fallidos con un correo (o 15 desde una conexión) bloquean 15 minutos
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const claves = ['c:' + correo, 'ip:' + ip];
    const ahora = Date.now();
    const cuentas = await Promise.all(claves.map(async (k) => { const r = await env.DB.prepare('SELECT n, hasta FROM intentos WHERE clave = ?').bind(k).first(); return r && r.hasta > ahora ? r.n : 0; }));
    if (cuentas[0] >= 5 || cuentas[1] >= 15) {
      await registrar(env, request, correo || '(vacío)', '', 'Ingreso bloqueado por intentos fallidos');
      return json({ error: 'Demasiados intentos fallidos. Espera 15 minutos o pide al administrador que revise tu acceso.' }, 429);
    }
    const u = (await usuarios(env)).find((x) => x.correo === correo);
    const ok = u && (await hashClave(String(b.clave || ''), u.sal)).hash === u.hash;
    if (!ok) {
      await Promise.all(claves.map((k, i) => env.DB.prepare('INSERT INTO intentos (clave, n, hasta) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET n = excluded.n, hasta = excluded.hasta').bind(k, cuentas[i] + 1, ahora + 900000).run()));
      await registrar(env, request, correo || '(vacío)', '', `Intento fallido de ingreso (${cuentas[0] + 1} de 5)`);
      await new Promise((r) => setTimeout(r, 800));
      const quedan = Math.min(4 - cuentas[0], 14 - cuentas[1]);
      return json({ error: quedan > 0 ? `Correo o contraseña incorrectos. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` : 'Demasiados intentos fallidos. Espera 15 minutos.' }, 401);
    }
    await env.DB.prepare('DELETE FROM intentos WHERE clave = ?').bind(claves[0]).run();
    await registrar(env, request, u.correo, u.rol, 'Ingresó al portal');
    return json({ token: await crearToken(env, u), ...publico(u) });
  }

  const s = await leerSesion(request, env);
  if (!s) return json({ error: 'Tu sesión terminó. Vuelve a ingresar.' }, 401);
  const esAdmin = s.rol === 'admin';
  const soloAdmin = () => json({ error: 'Solo el administrador puede hacer esto' }, 403);

  // ---------- Con ingreso ----------
  if (ruta === 'sesion') return json({ rol: s.rol, correo: s.correo, nombre: s.nombre, local: false });

  if (ruta === 'evaluacion' && metodo === 'POST') {
    const b = await request.json().catch(() => ({}));
    if (!SEMANA.test(b.semana || '') || !ID.test(b.op || '')) return json({ error: 'Semana u operador no válido' }, 400);
    const notas = {};
    for (const [k, v] of Object.entries(b.notas || {})) if (ID.test(k) && Number.isInteger(v) && v >= 1 && v <= 10) notas[k] = v;
    if (!Object.keys(notas).length) return json({ error: 'Califica al menos un parámetro' }, 400);
    const ev = { notas, observacion: String(b.observacion || '').slice(0, 2000), fecha: new Date().toISOString().slice(0, 10), por: s.nombre || s.correo };
    const sql = esAdmin
      ? 'INSERT INTO evaluaciones (semana, op, datos, por, creado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(semana, op) DO UPDATE SET datos = excluded.datos, por = excluded.por, creado = excluded.creado'
      : 'INSERT INTO evaluaciones (semana, op, datos, por, creado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(semana, op) DO NOTHING';
    const r = await env.DB.prepare(sql).bind(b.semana, b.op, JSON.stringify(ev), s.correo, new Date().toISOString()).run();
    if (!r.meta.changes) return json({ error: 'Este operador ya fue calificado esta semana. Solo el administrador puede cambiarlo.' }, 409);
    await registrar(env, request, s.correo, s.rol, `Evaluación ${b.semana} · ${b.op}`);
    return json(ev);
  }

  if (ruta === 'evaluacion' && metodo === 'DELETE') {
    if (!esAdmin) return soloAdmin();
    await env.DB.prepare('DELETE FROM evaluaciones WHERE semana = ? AND op = ?').bind(q.get('semana') || '', q.get('op') || '').run();
    await registrar(env, request, s.correo, s.rol, `Borrada evaluación ${q.get('semana')} · ${q.get('op')}`);
    return json({ ok: true });
  }

  if (ruta === 'datos' && metodo === 'PUT') {
    // Parámetros, horario, rotación y turnos. Las evaluaciones van aparte y no se tocan aquí.
    if (!esAdmin) return soloAdmin();
    const actual = (await leer(env, 'version')) || '0';
    if ((request.headers.get('X-Version') || '') !== actual) return json({ error: 'version vieja' }, 409);
    const d = await request.json().catch(() => null);
    if (!d || typeof d !== 'object' || !Array.isArray(d.operadores)) return json({ error: 'datos no validos' }, 400);
    delete d.evaluaciones;
    const anterior = await leer(env, 'datos');
    if (anterior) await env.DB.prepare('INSERT INTO respaldos (fecha, valor) VALUES (?, ?)').bind(new Date().toISOString(), anterior).run();
    const nueva = String(Date.now());
    await escribir(env, 'datos', JSON.stringify(d));
    await escribir(env, 'version', nueva);
    await registrar(env, request, s.correo, s.rol, 'Cambio: ' + decodeURIComponent(request.headers.get('X-Motivo') || ''));
    return json({ ok: true }, 200, { 'X-Version': nueva });
  }

  if (ruta === 'accesos') {
    if (!esAdmin) return soloAdmin();
    const r = await env.DB.prepare('SELECT fecha, correo, rol, accion, lugar FROM accesos ORDER BY id DESC LIMIT 500').all();
    return json(r.results);
  }

  if (ruta === 'usuarios') {
    if (!esAdmin) return soloAdmin();
    const lista = await usuarios(env);
    if (metodo === 'GET') return json(lista.map(publico));
    if (metodo === 'POST') {
      // Crear o modificar un usuario (si se manda clave, se cambia la contraseña)
      const b = await request.json().catch(() => ({}));
      const correo = String(b.correo || '').trim().toLowerCase();
      if (!correoValido(correo) || !ROLES.includes(b.rol)) return json({ error: 'Correo o rol no válido' }, 400);
      let u = lista.find((x) => x.correo === correo);
      if ((!u || b.clave) && String(b.clave || '').length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
      if (u && u.rol === 'admin' && b.rol !== 'admin' && lista.filter((x) => x.rol === 'admin').length === 1) return json({ error: 'Debe quedar al menos un administrador' }, 400);
      if (!u) { u = { correo, creado: new Date().toISOString(), ver: 0 }; lista.push(u); }
      u.nombre = String(b.nombre || correo).trim();
      u.rol = b.rol;
      u.ver = (u.ver || 0) + 1; // cierra las sesiones abiertas de ese usuario
      if (b.clave) { Object.assign(u, await hashClave(String(b.clave))); await env.DB.prepare('DELETE FROM intentos WHERE clave = ?').bind('c:' + correo).run(); }
      await guardarUsuarios(env, lista);
      await registrar(env, request, s.correo, s.rol, `Usuario ${correo} guardado (${b.rol})`);
      const extra = u.correo === s.correo ? { token: await crearToken(env, u) } : {};
      return json({ lista: lista.map(publico), ...extra });
    }
    if (metodo === 'DELETE') {
      const correo = (q.get('correo') || '').toLowerCase();
      if (correo === s.correo) return json({ error: 'No puedes quitarte a ti mismo' }, 400);
      const nueva = lista.filter((x) => x.correo !== correo);
      await guardarUsuarios(env, nueva);
      await registrar(env, request, s.correo, s.rol, `Usuario ${correo} eliminado`);
      return json({ lista: nueva.map(publico) });
    }
  }

  return json({ error: 'no encontrado' }, 404);
}
