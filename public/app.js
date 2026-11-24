// Portal de Desempeño · TeleArseg
// KPI de operadores por semana, mes y año. Los datos viven en data\datos.json (los guarda el servidor local).
'use strict';

const S = { datos: null, version: '', rol: 'visitante', nombre: '', correo: '', local: false, per: null };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PESTANAS = [['resumen', 'Resumen'], ['operadores', 'Operadores'], ['grupos', 'Grupos'], ['horario', 'Horario'], ['evaluar', 'Evaluar'], ['parametros', 'Parámetros']];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// Tipos de turno iniciales: el administrador pone las horas y puede agregar o renombrar en la pestaña Horario
const TURNOS_BASE = [
  { id: 'D', nombre: 'Día', entrada: '', salida: '', trabaja: true },
  { id: 'N', nombre: 'Noche', entrada: '', salida: '', trabaja: true },
  { id: 'L', nombre: 'Libre', entrada: '', salida: '', trabaja: false },
  { id: 'V', nombre: 'Vacaciones', entrada: '', salida: '', trabaja: false },
  { id: 'P', nombre: 'Permiso', entrada: '', salida: '', trabaja: false },
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const dos = (n) => String(n).padStart(2, '0');

// ---------------- Semanas ISO (lunes a domingo) ----------------
function semanaDe(fecha) {
  const t = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-S${dos(w)}`;
}
function lunesDe(clave) {
  const [y, w] = clave.split('-S').map(Number);
  const ene4 = new Date(Date.UTC(y, 0, 4));
  const d = new Date(ene4); d.setUTCDate(ene4.getUTCDate() - ((ene4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  return d;
}
const masDias = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const fechaCorta = (d) => `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}`;
const mesDeSemana = (clave) => { const j = masDias(lunesDe(clave), 3); return `${j.getUTCFullYear()}-${dos(j.getUTCMonth() + 1)}`; };
const anioDeSemana = (clave) => clave.slice(0, 4);
function semanasDelAnio(y) {
  const ult = Number(semanaDe(new Date(y, 11, 28)).split('-S')[1]);
  return Array.from({ length: ult }, (_, i) => `${y}-S${dos(i + 1)}`);
}
const semanasDelMes = (m) => semanasDelAnio(Number(m.slice(0, 4))).filter((s) => mesDeSemana(s) === m);
const nombreSemana = (s) => { const l = lunesDe(s); return `Semana ${Number(s.split('-S')[1])} · ${fechaCorta(l)} al ${fechaCorta(masDias(l, 6))}`; };
const nombreMes = (m) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const HOY = new Date();
const SEMANA_ACTUAL = semanaDe(HOY);

function semanasDelPeriodo(per = S.per) {
  if (per.tipo === 'semana') return [per.clave];
  if (per.tipo === 'mes') return semanasDelMes(per.clave);
  return semanasDelAnio(Number(per.clave));
}
function nombrePeriodo(per = S.per) {
  if (per.tipo === 'semana') return nombreSemana(per.clave);
  if (per.tipo === 'mes') return nombreMes(per.clave);
  return `Año ${per.clave}`;
}

// ---------------- Cálculo del KPI ----------------
// Cada parámetro se califica de 1 a 10 por semana. El puntaje es el promedio × 10 (0 a 100 %).
const grupo = (id) => S.datos.grupos.find((g) => g.id === id);
const operador = (id) => S.datos.operadores.find((o) => o.id === id);
const aplicaA = (cat, op) => cat.aplica === 'todos' || cat.aplica === grupo(op.grupo).tipo;
const categoriasDe = (op) => S.datos.categorias.filter((c) => aplicaA(c, op) && c.parametros.some((p) => p.activo));
const prom = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

function notas(opId, semanas, catId) {
  const op = operador(opId); const r = [];
  for (const s of semanas) {
    const ev = (S.datos.evaluaciones[s] || {})[opId];
    if (!ev) continue;
    for (const c of categoriasDe(op)) {
      if (catId && c.id !== catId) continue;
      for (const p of c.parametros) if (p.activo && typeof ev.notas?.[p.id] === 'number') r.push(ev.notas[p.id]);
    }
  }
  return r;
}
const puntaje = (opId, semanas, catId) => { const p = prom(notas(opId, semanas, catId)); return p == null ? null : p * 10; };
function puntajeGrupo(gId, semanas) {
  const ps = S.datos.operadores.filter((o) => o.grupo === gId).map((o) => puntaje(o.id, semanas)).filter((x) => x != null);
  return prom(ps);
}
const evaluadas = (semanas) => semanas.reduce((n, s) => n + Object.keys(S.datos.evaluaciones[s] || {}).length, 0);
const nivel = (p) => (p == null ? 'sin' : p >= 85 ? 'alto' : p >= 70 ? 'bueno' : p >= 50 ? 'medio' : 'bajo');
const NIVEL_TXT = { alto: 'Excelente', bueno: 'Bueno', medio: 'Regular', bajo: 'Bajo', sin: 'Sin evaluar' };
const pct = (p) => (p == null ? '—' : `${p.toFixed(1).replace('.', ',')} %`);

// Periodo anterior, para comparar (sube / baja)
function anterior(per = S.per) {
  if (per.tipo === 'semana') { const l = masDias(lunesDe(per.clave), -7); return { tipo: 'semana', clave: semanaDe(new Date(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())) }; }
  if (per.tipo === 'mes') { let [y, m] = per.clave.split('-').map(Number); m -= 1; if (!m) { m = 12; y -= 1; } return { tipo: 'mes', clave: `${y}-${dos(m)}` }; }
  return { tipo: 'anio', clave: String(Number(per.clave) - 1) };
}
function tendencia(actual, previo) {
  if (actual == null || previo == null) return '';
  const d = actual - previo;
  if (Math.abs(d) < 0.5) return '<span class="tend igual">= se mantiene</span>';
  return d > 0 ? `<span class="tend sube">▲ ${d.toFixed(1).replace('.', ',')}</span>` : `<span class="tend baja">▼ ${Math.abs(d).toFixed(1).replace('.', ',')}</span>`;
}

// ---------------- Iconos y piezas (iguales al Portal de Monitoreo) ----------------
const ICONOS = {
  grupo: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.5 1.5-4.5 4-4.5s4 2 4 4.5"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  trofeo: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
  grafica: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ajustes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  gps: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  alerta: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  lapiz: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
};
const icono = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ''}</svg>`;
const tarjeta = (etq, num, det, ico, extra = '') => `<div class="tarjeta"><div class="tarjeta-cab">${ico ? `<span class="tarjeta-ico">${icono(ico)}</span>` : ''}<div class="etq">${esc(etq)}</div></div><div class="num">${num}</div><div class="det">${det}</div>${extra}</div>`;
const titulo = (ico, txt, sub = '') => `<div class="panel-titulo"><span class="panel-ico">${icono(ico)}</span><div><h2>${txt}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
const barraNota = (p) => `<div class="barra-carga"><div class="barra-relleno nv-${nivel(p)}" style="width:${p == null ? 0 : Math.max(2, p)}%"></div></div>`;
const chipNivel = (p) => `<span class="chip nv-${nivel(p)}">${NIVEL_TXT[nivel(p)]}</span>`;

// ---------------- Selector de periodo (semana / mes / año) ----------------
function aniosDisponibles() {
  const a = new Set([HOY.getFullYear()]);
  Object.keys(S.datos.evaluaciones).forEach((s) => a.add(Number(anioDeSemana(s))));
  return [...a].sort((x, y) => y - x);
}
function selectorPeriodo() {
  const t = S.per.tipo;
  let opciones = '';
  if (t === 'semana') {
    const lista = [];
    aniosDisponibles().forEach((y) => semanasDelAnio(y).forEach((s) => { if (s <= SEMANA_ACTUAL) lista.push(s); }));
    opciones = lista.sort().reverse().map((s) => `<option value="${s}" ${s === S.per.clave ? 'selected' : ''}>${nombreSemana(s)}${s === SEMANA_ACTUAL ? ' (actual)' : ''}${S.datos.evaluaciones[s] ? ' ✓' : ''}</option>`).join('');
  } else if (t === 'mes') {
    const lista = [];
    aniosDisponibles().forEach((y) => { for (let m = 12; m >= 1; m -= 1) { const k = `${y}-${dos(m)}`; if (new Date(y, m - 1, 1) <= HOY) lista.push(k); } });
    opciones = lista.map((m) => `<option value="${m}" ${m === S.per.clave ? 'selected' : ''}>${nombreMes(m)}</option>`).join('');
  } else {
    opciones = aniosDisponibles().map((y) => `<option value="${y}" ${String(y) === S.per.clave ? 'selected' : ''}>${y}</option>`).join('');
  }
  return `<div class="periodo">
    <div class="periodo-tipos">${[['semana', 'Semanal'], ['mes', 'Mensual'], ['anio', 'Anual']].map(([k, n]) => `<button type="button" class="${k === t ? 'activo' : ''}" data-tipo="${k}">${n}</button>`).join('')}</div>
    <select id="periodo-clave">${opciones}</select>
  </div>`;
}
function activarPeriodo(raiz) {
  $$('.periodo-tipos button', raiz).forEach((b) => b.addEventListener('click', () => {
    const tipo = b.dataset.tipo;
    const base = S.per.tipo === 'semana' ? S.per.clave : SEMANA_ACTUAL;
    S.per = { tipo, clave: tipo === 'semana' ? SEMANA_ACTUAL : tipo === 'mes' ? (S.per.tipo === 'semana' ? mesDeSemana(base) : `${HOY.getFullYear()}-${dos(HOY.getMonth() + 1)}`) : String(HOY.getFullYear()) };
    guardarPeriodo(); mostrar();
  }));
  const sel = $('#periodo-clave', raiz);
  if (sel) sel.addEventListener('change', () => { S.per.clave = sel.value; guardarPeriodo(); mostrar(); });
}
function guardarPeriodo() { try { localStorage.setItem('kpi-periodo', JSON.stringify(S.per)); } catch (e) { /* sin almacenamiento */ } }

// Evolución: semanas del mes, meses del año o las últimas 8 semanas
function puntosEvolucion(fn) {
  let pts;
  if (S.per.tipo === 'anio') pts = MESES.map((m, i) => ({ etq: m.slice(0, 3), sem: semanasDelMes(`${S.per.clave}-${dos(i + 1)}`) }));
  else if (S.per.tipo === 'mes') pts = semanasDelMes(S.per.clave).map((s) => ({ etq: `S${Number(s.split('-S')[1])}`, sem: [s] }));
  else {
    pts = []; let l = lunesDe(S.per.clave);
    for (let i = 0; i < 8; i += 1) { const s = semanaDe(new Date(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())); pts.unshift({ etq: `S${Number(s.split('-S')[1])}`, sem: [s] }); l = masDias(l, -7); }
  }
  return pts.map((p) => ({ etq: p.etq, v: fn(p.sem) }));
}
function graficaEvolucion(series) {
  // series: [{nombre, clase, puntos:[{etq,v}]}]
  const etqs = series[0].puntos.map((p) => p.etq);
  const hay = series.some((s) => s.puntos.some((p) => p.v != null));
  return `<div class="evo ${hay ? '' : 'evo-vacia'}">
    <div class="evo-guia"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
    <div class="evo-cols">${etqs.map((e, i) => `<div class="evo-col"><div class="evo-barras">${series.map((s) => { const v = s.puntos[i].v; return `<div class="evo-barra ${s.clase || ''} nv-${nivel(v)}" style="height:${v == null ? 0 : Math.max(2, v)}%" title="${esc(s.nombre)} · ${e}: ${pct(v)}"></div>`; }).join('')}</div><small>${esc(e)}</small></div>`).join('')}</div>
    ${hay ? '' : '<div class="evo-nada">Sin evaluaciones registradas en este periodo</div>'}
  </div>${series.length > 1 ? `<div class="evo-leyenda">${series.map((s) => `<span><i class="${s.clase}"></i>${esc(s.nombre)}</span>`).join('')}</div>` : ''}`;
}

// ---------------- Vistas ----------------
function avisoVacio(semanas) {
  if (evaluadas(semanas)) return '';
  return `<div class="panel aviso-vacio">${titulo('alerta', 'Todavía no hay evaluaciones en este periodo', `${esc(nombrePeriodo())}. Los indicadores se llenan cuando se registra la evaluación semanal de cada operador en la pestaña <a href="#/evaluar">Evaluar</a>.`)}</div>`;
}

function vResumen(c) {
  const sem = semanasDelPeriodo();
  const semAnt = semanasDelPeriodo(anterior());
  const ops = S.datos.operadores;
  const conNota = ops.map((o) => ({ o, p: puntaje(o.id, sem), a: puntaje(o.id, semAnt) })).filter((x) => x.p != null).sort((x, y) => y.p - x.p);
  const general = prom(conNota.map((x) => x.p));
  const generalAnt = prom(ops.map((o) => puntaje(o.id, semAnt)).filter((x) => x != null));
  const grupos = S.datos.grupos.map((g) => ({ g, p: puntajeGrupo(g.id, sem), a: puntajeGrupo(g.id, semAnt), n: ops.filter((o) => o.grupo === g.id).length })).sort((x, y) => (y.p ?? -1) - (x.p ?? -1));
  const mejor = conNota[0]; const mejorG = grupos.find((x) => x.p != null);
  const nParam = S.datos.categorias.reduce((n, cat) => n + cat.parametros.filter((p) => p.activo).length, 0);

  c.innerHTML = `
    <div class="portada mosaico">
      <div class="mosaico-fotos">
        ${[['m1.webp', 'CAM 01'], ['m2.webp', 'CAM 02'], ['m3.jpg', 'CAM 03'], ['m4.webp', 'CAM 04'], ['m5.jpg', 'CAM 05'], ['m6.jpg', 'CAM 06 · DETECCIÓN']]
          .map(([f, t], i) => `<div class="tesela t${i + 1}" style="background-image:url('img/mosaico/${f}')"><span class="tesela-tag"><i></i>${t}</span></div>`).join('')}
      </div>
      <div class="portada-marca">
        <span class="esq e1"></span><span class="esq e2"></span><span class="esq e3"></span><span class="esq e4"></span>
        <img src="img/logo-portada.png" alt="TeleArseg">
        <div class="portada-lema">${['CCTV', 'GPS', 'INTERNET', 'SOPORTE TÉCNICO', 'TORRES', 'PANELES SOLARES'].map((s) => `<span>${s}</span>`).join('<b>·</b>')}</div>
      </div>
      <div class="portada-texto">
        <span class="en-vivo"><i></i> Centro de monitoreo 24/7</span>
        <h1>Portal de <span class="grad">DESEMPEÑO</span></h1>
        <p>KPI de ${ops.length} operadores en ${S.datos.grupos.length} grupos</p>
      </div>
    </div>
    <div class="encabezado"><div><h1>${esc(nombrePeriodo())}</h1><p>Evaluación ${S.per.tipo === 'semana' ? 'semanal' : S.per.tipo === 'mes' ? 'mensual' : 'anual'} · ${nParam} parámetros activos</p></div>${selectorPeriodo()}</div>
    <div class="tarjetas">
      ${tarjeta('Desempeño general', pct(general), `${NIVEL_TXT[nivel(general)]} ${tendencia(general, generalAnt)}`, 'grafica', barraNota(general))}
      ${tarjeta('Operadores evaluados', `${conNota.length} / ${ops.length}`, `${evaluadas(sem)} evaluaciones semanales registradas`, 'check',
        `<div class="mini-barra"><span class="act" style="width:${(conNota.length / ops.length) * 100}%"></span></div>`)}
      ${tarjeta('Mejor operador', mejor ? esc(mejor.o.nombre.split(' ')[0]) : '—', mejor ? `${esc(mejor.o.nombre)} · ${esc(grupo(mejor.o.grupo).nombre)} · ${pct(mejor.p)}` : 'Sin evaluaciones', 'trofeo')}
      ${tarjeta('Mejor grupo', mejorG ? esc(mejorG.g.nombre) : '—', mejorG ? `${pct(mejorG.p)} de promedio` : 'Sin evaluaciones', 'grupo')}
    </div>
    ${avisoVacio(sem)}
    <div class="panel">${titulo('calendario', `En turno hoy · ${DIAS[diaHoy()]} ${fechaCorta(masDias(lunesDe(SEMANA_ACTUAL), diaHoy()))}`, `Según el horario de la semana actual. <a href="#/horario">Ver horario completo</a>`)}
      ${hayHorario(SEMANA_ACTUAL) ? `<div class="hoy-turnos">${enTurnoHoy().map(({ t, ops }) => `<div class="hoy-turno"><div class="fila-nota">${chipTurno(t.id)}<small>${esc(horasTurno(t))}</small></div><strong>${ops.length}</strong> operadores<div class="hoy-nombres">${ops.map((o) => esc(o.nombre)).join(' · ') || '<span class="vacio">Nadie asignado</span>'}</div></div>`).join('')}</div>`
        : '<p class="vacio">Todavía no hay horario cargado para esta semana.</p>'}
    </div>
    <div class="dos-col dos-iguales">
      <div class="panel">${titulo('grupo', 'Desempeño por grupo', 'Promedio de los operadores evaluados de cada grupo. Toca un grupo para ver su detalle.')}
        <table class="tabla-estaciones"><thead><tr><th>Grupo</th><th class="n">Operadores</th><th class="barra-col">Puntaje</th><th class="n">Vs. anterior</th></tr></thead><tbody>
        ${grupos.map((x) => `<tr class="clic" data-ir="#/grupos/${x.g.id}"><td><span class="num-est">${x.g.tipo === 'gps' ? icono('gps') : esc(x.g.id.slice(1))}</span> <strong>${esc(x.g.nombre)}</strong></td><td class="n">${x.n}</td><td><div class="fila-nota"><strong>${pct(x.p)}</strong>${chipNivel(x.p)}</div>${barraNota(x.p)}</td><td class="n">${tendencia(x.p, x.a) || '<span class="vacio">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="panel">${titulo('grafica', 'Evolución por grupo', S.per.tipo === 'anio' ? 'Mes por mes' : S.per.tipo === 'mes' ? 'Semana por semana' : 'Últimas 8 semanas')}
        ${graficaEvolucion(S.datos.grupos.map((g, i) => ({ nombre: g.nombre, clase: `serie${i + 1}`, puntos: puntosEvolucion((s) => puntajeGrupo(g.id, s)) })))}</div>
    </div>
    <div class="panel">${titulo('trofeo', 'Ranking de operadores', 'Todos los operadores ordenados por puntaje en el periodo. Toca uno para ver su detalle.')}
      ${tablaRanking(ops.map((o) => ({ o, p: puntaje(o.id, sem), a: puntaje(o.id, semAnt) })))}
    </div>`;
  activarPeriodo(c); activarFilas(c);
}

function tablaRanking(filas) {
  const orden = filas.sort((x, y) => (y.p ?? -1) - (x.p ?? -1) || x.o.nombre.localeCompare(y.o.nombre));
  let pos = 0;
  return `<div class="tabla-scroll"><table class="tabla-estaciones"><thead><tr><th>#</th><th>Operador</th><th>Grupo</th><th class="barra-col">Puntaje</th><th class="n">Vs. anterior</th></tr></thead><tbody>
    ${orden.map((x) => { const n = x.p == null ? '' : (pos += 1); return `<tr class="clic" data-ir="#/operadores/${x.o.id}"><td class="pos ${n && n <= 3 ? `podio p${n}` : ''}">${n || '<span class="vacio">—</span>'}</td><td><strong>${esc(x.o.nombre)}</strong></td><td><span class="chip grupo">${esc(grupo(x.o.grupo).nombre)}</span></td><td><div class="fila-nota"><strong>${pct(x.p)}</strong>${chipNivel(x.p)}</div>${barraNota(x.p)}</td><td class="n">${tendencia(x.p, x.a) || '<span class="vacio">—</span>'}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

function vOperadores(c, args) {
  const sem = semanasDelPeriodo(); const semAnt = semanasDelPeriodo(anterior());
  const sel = args[0] && operador(args[0]);
  const fg = S.filtroGrupo || '';
  const lista = S.datos.operadores.filter((o) => !fg || o.grupo === fg);
  c.innerHTML = `
    <div class="encabezado"><div><h1>Operadores</h1><p>${esc(nombrePeriodo())}</p></div>${selectorPeriodo()}</div>
    <div class="dos-col ${sel ? 'con-detalle' : ''}">
      <div class="panel">
        <div class="filtros"><input type="search" id="q" placeholder="Buscar operador…"></div>
        <div class="filtros"><select id="fg"><option value="">Todos los grupos</option>${S.datos.grupos.map((g) => `<option value="${g.id}" ${g.id === fg ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></div>
        <div class="lista">${S.datos.grupos.filter((g) => !fg || g.id === fg).map((g) => `<div class="grupo abierto"><span class="g-nombre">${esc(g.nombre)}</span><span class="g-info">${pct(puntajeGrupo(g.id, sem))}</span></div>
          ${lista.filter((o) => o.grupo === g.id).map((o) => { const p = puntaje(o.id, sem); return `<a href="#/operadores/${o.id}" class="${sel && sel.id === o.id ? 'sel' : ''}" data-nombre="${esc(o.nombre.toLowerCase())}"><span>${esc(o.nombre)}</span><span class="chip nv-${nivel(p)}">${p == null ? '—' : Math.round(p)}</span></a>`; }).join('')}`).join('')}</div>
      </div>
      <div>${sel ? detalleOperador(sel, sem, semAnt) : `<div class="panel">${titulo('usuario', 'Elige un operador', 'Verás su puntaje del periodo, el detalle por categoría y su evolución.')}${tablaRanking(lista.map((o) => ({ o, p: puntaje(o.id, sem), a: puntaje(o.id, semAnt) })))}</div>`}</div>
    </div>`;
  activarPeriodo(c); activarFilas(c);
  $('#fg', c).addEventListener('change', (e) => { S.filtroGrupo = e.target.value; mostrar(); });
  $('#q', c).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('.lista a', c).forEach((a) => { a.hidden = !a.dataset.nombre.includes(q); }); });
}

function detalleOperador(o, sem, semAnt) {
  const p = puntaje(o.id, sem); const a = puntaje(o.id, semAnt);
  const g = grupo(o.grupo);
  const companeros = S.datos.operadores.filter((x) => x.grupo === o.grupo).map((x) => ({ x, p: puntaje(x.id, sem) })).filter((y) => y.p != null).sort((m, n) => n.p - m.p);
  const pos = companeros.findIndex((y) => y.x.id === o.id) + 1;
  const obs = sem.map((s) => ({ s, t: (S.datos.evaluaciones[s] || {})[o.id]?.observacion })).filter((y) => y.t);
  return `
    <a class="btn mini volver" href="#/operadores">← Volver</a>
    <div class="panel">
      <div class="encabezado"><div><h1>${esc(o.nombre)}</h1><p><span class="chip grupo">${esc(g.nombre)}</span> ${pos ? `· Puesto ${pos} de ${companeros.length} en su grupo` : ''}</p></div>
        <div class="acciones"><a class="btn prim" href="#/evaluar/${S.per.tipo === 'semana' ? S.per.clave : SEMANA_ACTUAL}/${o.id}">${S.per.tipo === 'semana' && (S.datos.evaluaciones[S.per.clave] || {})[o.id] ? 'Editar evaluación' : 'Evaluar semana'}</a></div></div>
      <div class="tarjetas">
        ${tarjeta('Puntaje del periodo', pct(p), `${NIVEL_TXT[nivel(p)]} ${tendencia(p, a)}`, 'grafica', barraNota(p))}
        ${tarjeta('Semanas evaluadas', String(sem.filter((s) => (S.datos.evaluaciones[s] || {})[o.id]).length), `de ${sem.filter((s) => s <= SEMANA_ACTUAL).length} semanas del periodo`, 'calendario')}
        ${tarjeta('Promedio del grupo', pct(puntajeGrupo(o.grupo, sem)), esc(g.nombre), 'grupo')}
      </div>
    </div>
    <div class="panel">${titulo('calendario', 'Horario', esc(nombreSemana(S.per.tipo === 'semana' ? S.per.clave : SEMANA_ACTUAL)))}
      <div class="tabla-scroll">${semanaOperador(o, S.per.tipo === 'semana' ? S.per.clave : SEMANA_ACTUAL)}</div></div>
    <div class="panel">${titulo('check', 'Detalle por categoría', 'Promedio de las notas (1 a 10) de cada categoría, expresado en %.')}
      <table class="tabla-estaciones"><tbody>${categoriasDe(o).map((cat) => { const pc = puntaje(o.id, sem, cat.id); return `<tr><td><strong>${esc(cat.nombre)}</strong><div class="mini-coord">${cat.parametros.filter((x) => x.activo).length} parámetros</div></td><td class="barra-col"><div class="fila-nota"><strong>${pct(pc)}</strong>${chipNivel(pc)}</div>${barraNota(pc)}</td></tr>`; }).join('')}</tbody></table>
    </div>
    <div class="panel">${titulo('grafica', 'Evolución', S.per.tipo === 'anio' ? 'Mes por mes' : S.per.tipo === 'mes' ? 'Semana por semana' : 'Últimas 8 semanas')}
      ${graficaEvolucion([{ nombre: o.nombre, clase: 'serie1', puntos: puntosEvolucion((s) => puntaje(o.id, s)) }, { nombre: `Promedio ${g.nombre}`, clase: 'serie-gris', puntos: puntosEvolucion((s) => puntajeGrupo(o.grupo, s)) }])}
    </div>
    ${obs.length ? `<div class="panel">${titulo('lapiz', 'Observaciones')}${obs.map((y) => `<p><strong>${esc(nombreSemana(y.s))}:</strong> ${esc(y.t)}</p>`).join('')}</div>` : ''}`;
}

function vGrupos(c, args) {
  const sem = semanasDelPeriodo(); const semAnt = semanasDelPeriodo(anterior());
  const sel = args[0] && grupo(args[0]);
  const gs = S.datos.grupos.map((g) => { const ops = S.datos.operadores.filter((o) => o.grupo === g.id); const ps = ops.map((o) => ({ o, p: puntaje(o.id, sem) })).filter((x) => x.p != null).sort((x, y) => y.p - x.p); return { g, ops, ps, p: puntajeGrupo(g.id, sem), a: puntajeGrupo(g.id, semAnt) }; });
  c.innerHTML = `
    <div class="encabezado"><div><h1>${sel ? esc(sel.nombre) : 'Grupos'}</h1><p>${esc(nombrePeriodo())}</p></div>${selectorPeriodo()}</div>
    ${sel ? '<a class="btn mini" href="#/grupos" style="margin-bottom:14px;display:inline-block">← Todos los grupos</a>' : ''}
    <div class="tarjetas">${gs.filter((x) => !sel || x.g.id === sel.id).map((x) => `<a class="tarjeta enlace ${sel ? '' : 'clic'}" href="#/grupos/${x.g.id}">
      <div class="tarjeta-cab"><span class="tarjeta-ico">${icono(x.g.tipo === 'gps' ? 'gps' : 'grupo')}</span><div class="etq">${esc(x.g.nombre)}</div></div>
      <div class="num">${pct(x.p)}</div><div class="det">${x.ops.length} operadores · ${x.ps.length} evaluados ${tendencia(x.p, x.a)}</div>
      <div class="det">${x.ps[0] ? `Mejor: <strong>${esc(x.ps[0].o.nombre)}</strong> (${pct(x.ps[0].p)})` : 'Sin evaluaciones'}</div>${barraNota(x.p)}</a>`).join('')}</div>
    ${avisoVacio(sem)}
    <div class="panel">${titulo('grafica', sel ? `Evolución de ${esc(sel.nombre)}` : 'Comparación de grupos', S.per.tipo === 'anio' ? 'Mes por mes' : S.per.tipo === 'mes' ? 'Semana por semana' : 'Últimas 8 semanas')}
      ${graficaEvolucion(S.datos.grupos.map((g, i) => ({ g, i })).filter(({ g }) => !sel || g.id === sel.id).map(({ g, i }) => ({ nombre: g.nombre, clase: `serie${i + 1}`, puntos: puntosEvolucion((s) => puntajeGrupo(g.id, s)) })))}</div>
    ${sel ? `<div class="panel">${titulo('trofeo', `Operadores de ${esc(sel.nombre)}`)}${tablaRanking(S.datos.operadores.filter((o) => o.grupo === sel.id).map((o) => ({ o, p: puntaje(o.id, sem), a: puntaje(o.id, semAnt) })))}</div>
      <div class="panel">${titulo('check', 'Categorías del grupo', 'Promedio del grupo en cada categoría')}<table class="tabla-estaciones"><tbody>${S.datos.categorias.filter((cat) => cat.aplica === 'todos' || cat.aplica === sel.tipo).filter((cat) => cat.parametros.some((p) => p.activo)).map((cat) => { const pc = prom(S.datos.operadores.filter((o) => o.grupo === sel.id).map((o) => puntaje(o.id, sem, cat.id)).filter((x) => x != null)); return `<tr><td><strong>${esc(cat.nombre)}</strong></td><td class="barra-col"><div class="fila-nota"><strong>${pct(pc)}</strong>${chipNivel(pc)}</div>${barraNota(pc)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
  activarPeriodo(c); activarFilas(c);
}

// ---------------- Evaluar (registro semanal) ----------------
function vEvaluar(c, args) {
  const semana = args[0] && /^\d{4}-S\d{2}$/.test(args[0]) ? args[0] : SEMANA_ACTUAL;
  const op = args[1] && operador(args[1]);
  const evSem = S.datos.evaluaciones[semana] || {};
  const semanas = []; aniosDisponibles().forEach((y) => semanasDelAnio(y).forEach((s) => { if (s <= SEMANA_ACTUAL) semanas.push(s); }));
  const ev = op ? evSem[op.id] || { notas: {} } : null;
  // Supervisor: una vez guardada, la evaluación queda bloqueada. Solo el administrador la cambia o la borra.
  const bloqueada = !!(op && evSem[op.id] && S.rol !== 'admin');
  const quien = op && evSem[op.id] ? `Calificado${ev.por ? ` por ${esc(ev.por)}` : ''}${ev.fecha ? ` el ${esc(ev.fecha.split('-').reverse().join('/'))}` : ''}` : '';
  c.innerHTML = `
    <div class="encabezado"><div><h1>Evaluación semanal</h1><p>Califica cada parámetro de 1 a 10. Lo que dejes en "—" no cuenta para el puntaje.</p></div>
      <div class="periodo"><select id="ev-semana">${semanas.sort().reverse().map((s) => `<option value="${s}" ${s === semana ? 'selected' : ''}>${nombreSemana(s)}${s === SEMANA_ACTUAL ? ' (actual)' : ''}</option>`).join('')}</select></div></div>
    <div class="dos-col ${op ? 'con-detalle' : ''}">
      <div class="panel"><div class="lista">${S.datos.grupos.map((g) => { const ops = S.datos.operadores.filter((o) => o.grupo === g.id); return `<div class="grupo abierto"><span class="g-nombre">${esc(g.nombre)}</span><span class="g-info">${ops.filter((o) => evSem[o.id]).length} / ${ops.length}</span></div>
        ${ops.map((o) => `<a href="#/evaluar/${semana}/${o.id}" class="${op && op.id === o.id ? 'sel' : ''}"><span>${esc(o.nombre)}</span>${evSem[o.id] ? `<span class="chip e-activo">${Math.round(puntaje(o.id, [semana]) ?? 0)}</span>` : '<span class="chip e-por-ingresar">Pendiente</span>'}</a>`).join('')}`; }).join('')}</div></div>
      <div>${op ? `<a class="btn mini volver" href="#/evaluar/${semana}">← Volver</a>
        <form class="panel" id="form-ev">
          ${titulo('lapiz', esc(op.nombre), `${esc(grupo(op.grupo).nombre)} · ${esc(nombreSemana(semana))}${quien ? ` · ${quien}` : ''}`)}
          ${bloqueada ? '<p class="aviso-bloqueo">🔒 Esta evaluación ya fue guardada y quedó bloqueada. Si hay que corregirla, pídeselo al administrador.</p>' : ''}
          ${!evSem[op.id] && S.rol !== 'admin' ? '<p class="aviso-bloqueo suave">Revisa bien antes de guardar: después ya no se puede cambiar.</p>' : ''}
          ${categoriasDe(op).map((cat) => `<h3>${esc(cat.nombre)}</h3><div class="ev-grid">${cat.parametros.filter((p) => p.activo).map((p) => `<label class="ev-item"><span>${esc(p.nombre)}</span><select name="${p.id}" ${bloqueada ? 'disabled' : ''}><option value="">—</option>${Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => `<option ${ev.notas[p.id] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}</div>`).join('')}
          <h3>Observación</h3><textarea name="observacion" rows="3" placeholder="Comentario de la semana (opcional)" ${bloqueada ? 'disabled' : ''}>${esc(ev.observacion || '')}</textarea>
          <div class="acciones" style="margin-top:14px">${bloqueada ? '' : `<button class="btn prim" type="submit">Guardar evaluación</button>${evSem[op.id] ? '<button class="btn peligro" type="button" id="borrar-ev">Borrar evaluación</button>' : ''}`}<span class="ev-total" id="ev-total"></span></div>
        </form>` : `<div class="panel">${titulo('check', 'Elige un operador', `Avance de ${esc(nombreSemana(semana))}: ${Object.keys(evSem).length} de ${S.datos.operadores.length} operadores evaluados.`)}</div>`}</div>
    </div>`;
  $('#ev-semana', c).addEventListener('change', (e) => { location.hash = `#/evaluar/${e.target.value}${op ? `/${op.id}` : ''}`; });
  const f = $('#form-ev', c);
  if (!f) return;
  const total = () => { const v = $$('select', f).map((s) => Number(s.value)).filter(Boolean); $('#ev-total', f).textContent = v.length ? `Puntaje: ${pct(prom(v) * 10)} · ${v.length} parámetros calificados` : 'Sin notas todavía'; };
  f.addEventListener('change', total); total();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = {}; $$('select', f).forEach((s) => { if (s.value) n[s.name] = Number(s.value); });
    if (!Object.keys(n).length) { toast('Califica al menos un parámetro.'); return; }
    if (S.rol !== 'admin' && !confirm(`¿Guardar la evaluación de ${op.nombre}? Después ya no se podrá cambiar.`)) return;
    const nueva = { notas: n, observacion: f.observacion.value.trim(), fecha: new Date().toISOString().slice(0, 10), por: S.nombre || '' };
    if (await guardarEvaluacion(semana, op, nueva)) {
      toast(`Evaluación de ${op.nombre} guardada.`);
      const sig = S.datos.operadores.find((o) => !S.datos.evaluaciones[semana][o.id]);
      location.hash = sig ? `#/evaluar/${semana}/${sig.id}` : `#/evaluar/${semana}`;
    }
  });
  const b = $('#borrar-ev', f);
  if (b) b.addEventListener('click', async () => {
    if (!confirm(`¿Borrar la evaluación de ${op.nombre} de esta semana?`)) return;
    if (await guardarEvaluacion(semana, op, null)) { toast('Evaluación borrada.'); mostrar(); }
  });
}

// ---------------- Parámetros (SÍ / NO) ----------------
function vParametros(c) {
  const total = S.datos.categorias.reduce((n, cat) => n + cat.parametros.length, 0);
  const act = S.datos.categorias.reduce((n, cat) => n + cat.parametros.filter((p) => p.activo).length, 0);
  const APLICA = { todos: 'Todos los grupos', cctv: 'Grupos 1, 2 y 3 (CCTV)', gps: 'Solo GPS' };
  c.innerHTML = `
    <div class="encabezado"><div><h1>Parámetros del KPI</h1><p>${act} de ${total} parámetros activos. Marca SÍ o NO en cada uno; los que estén en NO no se califican ni cuentan.</p></div>
      <div class="acciones"><button class="btn prim" id="guardar-par">Guardar cambios</button></div></div>
    <div class="cat-grid">${S.datos.categorias.map((cat) => `<div class="panel">
      <div class="panel-titulo"><span class="panel-ico">${icono(cat.aplica === 'gps' ? 'gps' : 'ajustes')}</span><div><h2>${esc(cat.nombre)}</h2><p>${APLICA[cat.aplica]} · <span data-cuenta="${cat.id}"></span></p></div></div>
      ${cat.parametros.map((p) => `<label class="par"><span>${esc(p.nombre)}</span><span class="si-no"><input type="checkbox" data-par="${p.id}" ${p.activo ? 'checked' : ''}><b class="si">SÍ</b><b class="no">NO</b></span></label>`).join('')}
    </div>`).join('')}</div>`;
  const contar = () => S.datos.categorias.forEach((cat) => { $(`[data-cuenta="${cat.id}"]`, c).textContent = `${cat.parametros.filter((p) => $(`[data-par="${p.id}"]`, c).checked).length} de ${cat.parametros.length} activos`; });
  c.addEventListener('change', contar); contar();
  $('#guardar-par', c).addEventListener('click', async () => {
    S.datos.categorias.forEach((cat) => cat.parametros.forEach((p) => { p.activo = $(`[data-par="${p.id}"]`, c).checked; }));
    if (await guardar('Parámetros del KPI actualizados')) { toast('Parámetros guardados.'); mostrar(); }
  });
}

// ---------------- Horario (rotación por grupo + cambios manuales) ----------------
// Cada grupo rota en un ciclo de 6 días: 2 días, 2 noches, 2 libres.
// La referencia guarda en qué posición del ciclo estaba cada grupo en una fecha conocida.
// Lo que se cambia a mano (vacaciones, permisos, cambios) se guarda aparte como excepción.
const turno = (id) => S.datos.turnos.find((t) => t.id === id);
const horasTurno = (t) => (t && t.entrada && t.salida ? `${t.entrada} – ${t.salida}` : '');
const claseTurno = (id) => { const i = S.datos.turnos.findIndex((t) => t.id === id); return i < 0 ? '' : `tc${(i % 8) + 1}`; };
const semanaMas = (s, n) => { const l = masDias(lunesDe(s), 7 * n); return semanaDe(new Date(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())); };
const diaHoy = () => (HOY.getDay() + 6) % 7; // 0 = lunes
const fechaDia = (sem, dia) => masDias(lunesDe(sem), dia);
const fechaISO = (d) => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
const HOY_ISO = `${HOY.getFullYear()}-${dos(HOY.getMonth() + 1)}-${dos(HOY.getDate())}`;
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// Posición del ciclo (0..n-1) de un grupo en una fecha
function posicionCiclo(gId, fecha) {
  const r = S.datos.rotacion;
  if (!r || r.posicion[gId] == null) return null;
  const n = r.ciclo.length;
  return (((r.posicion[gId] + diasEntre(r.fecha, fecha)) % n) + n) % n;
}
// "Día 2", "Noche 1"…: número de vez seguida dentro del ciclo
function etiquetaCiclo(pos) {
  const c = S.datos.rotacion.ciclo; const id = c[pos];
  let k = 1; for (let i = pos - 1; i >= 0 && c[i] === id; i -= 1) k += 1;
  return `${turno(id) ? turno(id).nombre : id} ${k}`;
}
const turnoRotacion = (gId, sem, dia) => { const p = posicionCiclo(gId, fechaISO(fechaDia(sem, dia))); return p == null ? '' : S.datos.rotacion.ciclo[p]; };
const excepcion = (opId, sem, dia) => ((S.datos.horarios[sem] || {})[opId] || [])[dia] || '';
const turnoDe = (opId, sem, dia) => excepcion(opId, sem, dia) || turnoRotacion(operador(opId).grupo, sem, dia);

function chipTurno(id, extra = '') {
  const t = turno(id);
  return t ? `<span class="chip-turno ${claseTurno(id)} ${extra}" title="${esc(horasTurno(t))}">${esc(t.nombre)}</span>` : '<span class="vacio">—</span>';
}
function enTurnoHoy() {
  return S.datos.turnos.filter((t) => t.trabaja).map((t) => ({ t, ops: S.datos.operadores.filter((o) => turnoDe(o.id, SEMANA_ACTUAL, diaHoy()) === t.id) }));
}
const hayHorario = (sem) => !!S.datos.rotacion || !!S.datos.horarios[sem];
function semanaOperador(o, sem) {
  const l = lunesDe(sem);
  return `<table class="tabla-horario mini"><thead><tr>${DIAS.map((d, i) => `<th class="${sem === SEMANA_ACTUAL && i === diaHoy() ? 'hoy' : ''}">${d}<small>${fechaCorta(masDias(l, i))}</small></th>`).join('')}</tr></thead>
    <tbody><tr>${DIAS.map((_, i) => `<td class="${sem === SEMANA_ACTUAL && i === diaHoy() ? 'hoy' : ''}">${chipTurno(turnoDe(o.id, sem, i), excepcion(o.id, sem, i) ? 'cambio' : '')}</td>`).join('')}</tr></tbody></table>`;
}

function vHorario(c, args) {
  const sem = args[0] && /^\d{4}-S\d{2}$/.test(args[0]) ? args[0] : SEMANA_ACTUAL;
  const l = lunesDe(sem);
  const H = JSON.parse(JSON.stringify(S.datos.horarios[sem] || {})); // cambios manuales, borrador hasta "Guardar"
  const fg = S.filtroGrupo || '';
  const r = S.datos.rotacion;
  const semanas = []; for (let i = -12; i <= 12; i += 1) semanas.push(semanaMas(SEMANA_ACTUAL, i));
  if (!semanas.includes(sem)) semanas.push(sem);
  const opciones = (val) => `<option value="">—</option>${S.datos.turnos.map((t) => `<option value="${t.id}" ${t.id === val ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}`;
  const hoyCol = (i) => (sem === SEMANA_ACTUAL && i === diaHoy() ? 'hoy' : '');
  const efectivo = (o, i) => (H[o.id] || [])[i] || turnoRotacion(o.grupo, sem, i);
  const nCambios = () => Object.values(H).reduce((n, d) => n + d.filter(Boolean).length, 0);
  const posHoy = (gId) => posicionCiclo(gId, HOY_ISO);

  c.innerHTML = `
    <div class="encabezado"><div><h1>Horario de operadores</h1><p>${esc(nombreSemana(sem))} · rotación por grupo: 2 días, 2 noches, 2 libres. Cambia la celda de un operador para registrar vacaciones, permisos o cambios de turno.</p></div>
      <div class="periodo">
        <a class="btn mini" href="#/horario/${semanaMas(sem, -1)}">◀</a>
        <select id="h-semana">${semanas.sort().reverse().map((s) => `<option value="${s}" ${s === sem ? 'selected' : ''}>${nombreSemana(s)}${s === SEMANA_ACTUAL ? ' (actual)' : ''}${S.datos.horarios[s] ? ' · con cambios' : ''}</option>`).join('')}</select>
        <a class="btn mini" href="#/horario/${semanaMas(sem, 1)}">▶</a>
        ${sem !== SEMANA_ACTUAL ? `<a class="btn mini" href="#/horario/${SEMANA_ACTUAL}">Hoy</a>` : ''}
        <select id="fg" style="width:auto"><option value="">Todos los grupos</option>${S.datos.grupos.map((g) => `<option value="${g.id}" ${g.id === fg ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>
      </div></div>
    <div class="panel">
      <div class="acciones" style="margin-bottom:14px"><button class="btn prim" id="h-guardar">Guardar cambios</button><button class="btn peligro" id="h-limpiar">Quitar cambios manuales de la semana</button><span class="ev-total" id="h-estado"></span></div>
      <div class="tabla-scroll"><table class="tabla-horario"><thead><tr><th>Operador</th>${DIAS.map((d, i) => `<th class="${hoyCol(i)}">${d}<small>${fechaCorta(masDias(l, i))}</small></th>`).join('')}</tr></thead><tbody>
      ${S.datos.grupos.filter((g) => !fg || g.id === fg).map((g) => `<tr class="h-grupo"><td><strong>${esc(g.nombre)}</strong><small>${r && r.posicion[g.id] != null ? 'Rotación del grupo' : 'Sin rotación · turnos a mano'}</small></td>${DIAS.map((_, i) => { const p = posicionCiclo(g.id, fechaISO(fechaDia(sem, i))); return `<td class="${hoyCol(i)}">${p == null ? '<span class="vacio">—</span>' : `<span class="chip-turno ${claseTurno(r.ciclo[p])}">${esc(etiquetaCiclo(p))}</span>`}</td>`; }).join('')}</tr>
        ${S.datos.operadores.filter((o) => o.grupo === g.id).map((o) => `<tr><td><a href="#/operadores/${o.id}">${esc(o.nombre)}</a></td>${DIAS.map((_, i) => { const v = efectivo(o, i); return `<td class="${hoyCol(i)}"><select class="h-sel ${claseTurno(v)} ${(H[o.id] || [])[i] ? 'cambio' : ''}" data-op="${o.id}" data-dia="${i}">${opciones(v)}</select></td>`; }).join('')}</tr>`).join('')}`).join('')}
      </tbody><tfoot id="h-cobertura"></tfoot></table></div>
      <p class="leyenda"><span class="punto-cambio"></span> Celda con borde punteado = cambio manual (no sigue la rotación del grupo).</p>
    </div>
    <div class="dos-col dos-iguales">
      <div class="panel">${titulo('grupo', 'Rotación de los grupos', `Ciclo de ${r ? r.ciclo.length : 6} días: ${r ? r.ciclo.map((id) => esc(turno(id) ? turno(id).nombre : id)).join(' → ') : ''}. Si algún grupo se corre, corrige aquí en qué día del ciclo está hoy.`)}
        <table class="tabla-turnos"><thead><tr><th>Grupo</th><th>Hoy (${fechaCorta(fechaDia(SEMANA_ACTUAL, diaHoy()))}) está en</th><th>Mañana</th></tr></thead><tbody>
        ${S.datos.grupos.map((g) => { const p = posHoy(g.id); return `<tr><td><strong>${esc(g.nombre)}</strong></td><td><select class="r-pos" data-g="${g.id}"><option value="">Sin rotación</option>${(r ? r.ciclo : []).map((_, k) => `<option value="${k}" ${k === p ? 'selected' : ''}>${esc(etiquetaCiclo(k))}</option>`).join('')}</select></td><td>${p == null ? '<span class="vacio">—</span>' : esc(etiquetaCiclo((p + 1) % r.ciclo.length))}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="acciones" style="margin-top:12px"><button class="btn prim" id="r-guardar">Guardar rotación</button></div>
      </div>
      <div class="panel">${titulo('calendario', 'Tipos de turno', 'Pon la hora de entrada y salida. "Trabaja" indica si cuenta como turno de trabajo.')}
        <div class="tabla-scroll"><table class="tabla-turnos"><thead><tr><th>Turno</th><th>Entrada</th><th>Salida</th><th>Trabaja</th><th></th></tr></thead><tbody>
        ${S.datos.turnos.map((t) => `<tr data-t="${t.id}"><td><span class="chip-turno ${claseTurno(t.id)}">&nbsp;</span> <input type="text" class="t-nombre" value="${esc(t.nombre)}"></td><td><input type="time" class="t-entrada" value="${esc(t.entrada)}"></td><td><input type="time" class="t-salida" value="${esc(t.salida)}"></td><td><input type="checkbox" class="t-trabaja" ${t.trabaja ? 'checked' : ''}></td><td>${(r && r.ciclo.includes(t.id)) || Object.values(S.datos.horarios).some((h) => Object.values(h).some((d) => d.includes(t.id))) ? '<span class="vacio">en uso</span>' : '<button class="btn mini peligro t-quitar">Quitar</button>'}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="acciones" style="margin-top:12px"><button class="btn" id="t-agregar">+ Agregar turno</button><button class="btn prim" id="t-guardar">Guardar turnos</button></div>
      </div>
    </div>`;

  const estado = () => { $('#h-estado', c).textContent = `${nCambios()} cambios manuales en la semana · sin guardar`; };
  const cobertura = () => {
    const filas = S.datos.turnos.filter((t) => t.trabaja).map((t) => `<tr><td>${chipTurno(t.id)} <small>${esc(horasTurno(t))}</small></td>${DIAS.map((_, i) => { const n = S.datos.operadores.filter((o) => efectivo(o, i) === t.id).length; return `<td class="n ${hoyCol(i)}">${n ? `<strong>${n}</strong>` : '<span class="vacio">0</span>'}</td>`; }).join('')}</tr>`).join('');
    $('#h-cobertura', c).innerHTML = `<tr><td colspan="8" class="h-cob-tit">Operadores por turno (toda la operación)</td></tr>${filas}`;
  };
  $$('.h-sel', c).forEach((s) => s.addEventListener('change', () => {
    const o = operador(s.dataset.op); const i = Number(s.dataset.dia);
    const rot = turnoRotacion(o.grupo, sem, i);
    H[o.id] = H[o.id] || ['', '', '', '', '', '', ''];
    H[o.id][i] = s.value === rot ? '' : (s.value || (rot ? 'L' : '')); // vacío en un día con rotación = libre
    if (!H[o.id].some(Boolean)) delete H[o.id];
    s.value = efectivo(o, i);
    s.className = `h-sel ${claseTurno(s.value)} ${(H[o.id] || [])[i] ? 'cambio' : ''}`;
    cobertura(); estado();
  }));
  cobertura();
  $('#h-semana', c).addEventListener('change', (e) => { location.hash = `#/horario/${e.target.value}`; });
  $('#fg', c).addEventListener('change', (e) => { S.filtroGrupo = e.target.value; mostrar(); });
  $('#h-guardar', c).addEventListener('click', async () => {
    if (Object.keys(H).length) S.datos.horarios[sem] = H; else delete S.datos.horarios[sem];
    if (await guardar(`Horario ${sem}: ${nCambios()} cambios manuales`)) { toast('Horario guardado.'); mostrar(); }
  });
  $('#h-limpiar', c).addEventListener('click', () => { Object.keys(H).forEach((k) => delete H[k]); $$('.h-sel', c).forEach((s) => { const o = operador(s.dataset.op); s.value = efectivo(o, Number(s.dataset.dia)); s.className = `h-sel ${claseTurno(s.value)}`; }); cobertura(); estado(); });
  $('#r-guardar', c).addEventListener('click', async () => {
    const pos = {};
    $$('.r-pos', c).forEach((s) => { if (s.value !== '') pos[s.dataset.g] = Number(s.value); });
    S.datos.rotacion = { ciclo: r ? r.ciclo : ['D', 'D', 'N', 'N', 'L', 'L'], fecha: HOY_ISO, posicion: pos };
    if (await guardar('Rotación de grupos actualizada')) { toast('Rotación guardada.'); mostrar(); }
  });
  $('#t-agregar', c).addEventListener('click', () => {
    let n = 1; while (turno(`X${n}`)) n += 1;
    S.datos.turnos.push({ id: `X${n}`, nombre: `Turno ${S.datos.turnos.length + 1}`, entrada: '', salida: '', trabaja: true });
    mostrar();
  });
  $$('.t-quitar', c).forEach((b) => b.addEventListener('click', () => { const id = b.closest('tr').dataset.t; S.datos.turnos = S.datos.turnos.filter((t) => t.id !== id); mostrar(); }));
  $('#t-guardar', c).addEventListener('click', async () => {
    $$('.tabla-turnos tbody tr[data-t]', c).forEach((tr) => {
      const t = turno(tr.dataset.t);
      t.nombre = $('.t-nombre', tr).value.trim() || t.nombre;
      t.entrada = $('.t-entrada', tr).value; t.salida = $('.t-salida', tr).value; t.trabaja = $('.t-trabaja', tr).checked;
    });
    if (await guardar('Tipos de turno actualizados')) { toast('Turnos guardados.'); mostrar(); }
  });
}

// ---------------- Conexión con los datos ----------------
// En GitHub la página usa el API de Cloudflare (usuarios y base de datos). En esta computadora, el servidor local.
const EN_GITHUB = /\.github\.io$/i.test(location.hostname);
const API = EN_GITHUB ? 'https://portal-desempeno.pages.dev' : '';
const ROLES = { admin: 'Administrador', supervisor: 'Supervisor' };
const leerToken = () => { try { return localStorage.getItem('kpi-token') || ''; } catch (e) { return ''; } };
const ponerToken = (t) => { try { if (t) localStorage.setItem('kpi-token', t); else localStorage.removeItem('kpi-token'); } catch (e) { /* sin almacenamiento */ } };
function api(ruta, op = {}) {
  const headers = { ...(op.headers || {}) };
  const t = leerToken();
  if (API && t) headers.Authorization = `Bearer ${t}`;
  return fetch(API + ruta, { cache: 'no-store', ...op, headers });
}
function sesionVencida() {
  ponerToken(''); S.rol = 'visitante'; S.nombre = ''; S.correo = '';
  pintarUsuario(); toast('Tu sesión terminó. Vuelve a ingresar.'); location.hash = '#/ingresar';
}

async function cargarDatos() {
  const r = await api('/api/datos');
  if (!r.ok) throw new Error(r.status);
  S.version = r.headers.get('X-Version') || '';
  S.datos = await r.json();
  if (!S.datos.turnos) S.datos.turnos = JSON.parse(JSON.stringify(TURNOS_BASE));
  if (!S.datos.horarios) S.datos.horarios = {};
  if (!S.datos.evaluaciones) S.datos.evaluaciones = {};
  S.cargado = Date.now();
}

// Parámetros, horario, rotación y turnos (solo administrador)
async function guardar(motivo) {
  try {
    const r = await api('/api/datos', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Motivo': encodeURIComponent(motivo), 'X-Version': S.version }, body: JSON.stringify(S.datos, null, 1) });
    if (r.status === 401) { sesionVencida(); return false; }
    if (r.status === 409) { await cargarDatos(); toast('Otra persona guardó cambios hace un momento. Se recargó la información: repite tu cambio.'); mostrar(); return false; }
    if (!r.ok) throw new Error(r.status);
    S.version = r.headers.get('X-Version') || S.version;
    return true;
  } catch (e) { toast(API ? 'No se pudo guardar. Revisa tu conexión a internet.' : 'No se pudo guardar. ¿Está encendido el servidor?'); return false; }
}

// Evaluación de un operador (ev = null para borrarla)
async function guardarEvaluacion(semana, op, ev) {
  const quitarLocal = () => { delete (S.datos.evaluaciones[semana] || {})[op.id]; if (S.datos.evaluaciones[semana] && !Object.keys(S.datos.evaluaciones[semana]).length) delete S.datos.evaluaciones[semana]; };
  if (!API) { // servidor local: se guarda todo el archivo
    if (ev) (S.datos.evaluaciones[semana] = S.datos.evaluaciones[semana] || {})[op.id] = ev; else quitarLocal();
    return guardar(`${ev ? 'Evaluación' : 'Borrada evaluación'} ${semana} · ${op.nombre}`);
  }
  try {
    const r = ev
      ? await api('/api/evaluacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semana, op: op.id, notas: ev.notas, observacion: ev.observacion }) })
      : await api(`/api/evaluacion?semana=${encodeURIComponent(semana)}&op=${encodeURIComponent(op.id)}`, { method: 'DELETE' });
    if (r.status === 401) { sesionVencida(); return false; }
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast(b.error || 'No se pudo guardar.'); if (r.status === 409) { await cargarDatos(); mostrar(); } return false; }
    if (ev) (S.datos.evaluaciones[semana] = S.datos.evaluaciones[semana] || {})[op.id] = b; else quitarLocal();
    return true;
  } catch (e) { toast('No se pudo guardar. Revisa tu conexión a internet.'); return false; }
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 4500); }
function activarFilas(raiz) { $$('[data-ir]', raiz).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.ir; })); }

// ---------------- Ingresar ----------------
async function vIngresar(c) {
  if (S.rol !== 'visitante') { location.hash = '#/resumen'; return; }
  c.innerHTML = '<p class="cargando">Cargando…</p>';
  let configurado = true;
  try { configurado = (await (await api('/api/estado')).json()).configurado; } catch (e) { /* se intenta ingresar igual */ }
  c.innerHTML = `<form class="panel ingreso" id="f-ing">
      ${titulo('usuario', configurado ? 'Ingresar' : 'Crear cuenta de administrador', configurado ? 'Supervisores y administrador: ingresa para calificar a tus operadores.' : 'Primera vez: usa el código que está en la carpeta del portal (data\\codigo-inicial.txt).')}
      ${configurado ? '' : `<label>Código inicial<input name="codigo" autocomplete="off" required></label><label>Tu nombre<input name="nombre" autocomplete="name" required></label>`}
      <label>Correo<input name="correo" type="email" autocomplete="username" required></label>
      <label>Contraseña${configurado ? '' : ' (mínimo 8 caracteres)'}<input name="clave" type="password" autocomplete="${configurado ? 'current-password' : 'new-password'}" required></label>
      <div class="acciones"><button class="btn prim" type="submit">${configurado ? 'Ingresar' : 'Crear y entrar'}</button><a class="btn" href="#/resumen">Ver sin ingresar</a></div>
      <p class="error" id="ing-err"></p>
    </form>`;
  const f = $('#f-ing', c);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('button[type=submit]', f); b.disabled = true; $('#ing-err', c).textContent = '';
    const cuerpo = { correo: f.correo.value, clave: f.clave.value, ...(configurado ? {} : { codigo: f.codigo.value, nombre: f.nombre.value }) };
    try {
      const r = await api(configurado ? '/api/login' : '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo ingresar');
      ponerToken(d.token); S.rol = d.rol; S.nombre = d.nombre; S.correo = d.correo;
      pintarUsuario(); toast(`Bienvenido, ${d.nombre || d.correo}.`);
      location.hash = d.rol === 'admin' ? '#/resumen' : '#/evaluar';
    } catch (err) { $('#ing-err', c).textContent = err.message === 'Failed to fetch' ? 'Sin conexión' : err.message; b.disabled = false; }
  });
}

// ---------------- Usuarios (solo administrador) ----------------
async function vUsuarios(c) {
  c.innerHTML = '<p class="cargando">Cargando usuarios…</p>';
  const [ru, ra] = await Promise.all([api('/api/usuarios'), api('/api/accesos')]);
  if (ru.status === 401) { sesionVencida(); return; }
  let usuarios = ru.ok ? await ru.json() : [];
  const accesos = ra.ok ? await ra.json() : [];
  const opcionesRol = (sel) => Object.entries(ROLES).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}</option>`).join('');
  c.innerHTML = `<div class="encabezado"><div><h1>Usuarios</h1><p>Quién puede ingresar a calificar. El <strong>Supervisor</strong> califica operadores y, una vez guardada, la evaluación queda bloqueada. El <strong>Administrador</strong> cambia todo.</p></div></div>
    <div class="panel">${titulo('grupo', 'Usuarios con acceso', `${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'}`)}
      <div class="acciones"><button class="btn prim" id="u-nuevo">+ Nuevo usuario</button></div>
      <div id="form-usuario" class="form-usuario" hidden></div>
      <div class="tabla-scroll" id="tabla-usuarios"></div></div>
    <div class="panel">${titulo('calendario', 'Registro de accesos', 'Quién entró y qué guardó (últimos 500)')}
      <div class="tabla-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Lugar</th></tr></thead>
      <tbody>${accesos.map((a) => `<tr class="${/fallido|bloqueado/i.test(a.accion) ? 'fila-alerta' : ''}"><td>${esc(new Date(a.fecha).toLocaleString('es-EC'))}</td><td>${esc(a.correo)}</td><td>${esc(ROLES[a.rol] || a.rol || '—')}</td><td>${esc(a.accion)}</td><td>${esc(a.lugar || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin movimientos</td></tr>'}</tbody></table></div></div>`;
  const pintar = () => {
    $('#tabla-usuarios', c).innerHTML = `<table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último ingreso</th><th></th></tr></thead><tbody>${usuarios.map((u) => {
      const ult = accesos.find((a) => a.correo === u.correo && a.accion === 'Ingresó al portal');
      return `<tr><td>${esc(u.nombre)}</td><td>${esc(u.correo)}</td><td><span class="chip">${esc(ROLES[u.rol] || u.rol)}</span></td><td>${ult ? esc(new Date(ult.fecha).toLocaleString('es-EC')) : '<span class="vacio">Nunca</span>'}</td>
        <td class="n"><button class="btn mini" data-edit="${esc(u.correo)}">Editar</button> ${u.correo === S.correo ? '' : `<button class="btn mini peligro" data-del="${esc(u.correo)}">Quitar</button>`}</td></tr>`;
    }).join('')}</tbody></table>`;
    $$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => form(usuarios.find((u) => u.correo === b.dataset.edit))));
    $$('[data-del]', c).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`¿Quitar el acceso de ${b.dataset.del}? Ya no podrá ingresar.`)) return;
      const r = await api(`/api/usuarios?correo=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { usuarios = d.lista; pintar(); toast('Acceso quitado.'); } else toast(d.error || 'No se pudo quitar');
    }));
  };
  const form = (u) => {
    const el = $('#form-usuario', c); el.hidden = false;
    el.innerHTML = `<h3>${u ? 'Editar usuario' : 'Nuevo usuario'}</h3>
      <div class="campos-usuario">
        <div><label>Nombre</label><input id="u-nombre" value="${esc(u ? u.nombre : '')}" placeholder="Nombre y apellido"></div>
        <div><label>Correo</label><input id="u-correo" type="email" value="${esc(u ? u.correo : '')}" ${u ? 'readonly' : ''} placeholder="correo@telearseg.net"></div>
        <div><label>Rol</label><select id="u-rol">${opcionesRol(u ? u.rol : 'supervisor')}</select></div>
        <div><label>${u ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña (mínimo 8)'}</label><input id="u-clave" type="text" autocomplete="off"></div>
      </div>
      <div class="acciones"><button class="btn prim" id="u-guardar">Guardar</button><button class="btn" id="u-cancelar">Cancelar</button></div>`;
    $('#u-cancelar', el).addEventListener('click', () => { el.hidden = true; });
    $('#u-guardar', el).addEventListener('click', async () => {
      const cuerpo = { nombre: $('#u-nombre', el).value, correo: $('#u-correo', el).value, rol: $('#u-rol', el).value, clave: $('#u-clave', el).value };
      const r = await api('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudo guardar'); return; }
      usuarios = d.lista; if (d.token) ponerToken(d.token);
      el.hidden = true; pintar(); toast('Usuario guardado. Pásale su correo y contraseña por un medio privado.');
    });
  };
  $('#u-nuevo', c).addEventListener('click', () => form(null));
  pintar();
}

// ---------------- Navegación ----------------
const VISTAS = { resumen: vResumen, operadores: vOperadores, grupos: vGrupos, horario: vHorario, evaluar: vEvaluar, parametros: vParametros, usuarios: vUsuarios, ingresar: vIngresar };
const NAVEGAR = ['h-semana', 'fg', 'periodo-clave', 'q', 'ev-semana'];
// Qué ve cada uno: visitante (sin ingresar) solo mira; supervisor además califica; administrador todo
function pestanasDe(rol) {
  const p = { visitante: ['resumen', 'operadores', 'grupos', 'horario'], supervisor: ['resumen', 'operadores', 'grupos', 'horario', 'evaluar'] }[rol];
  const todas = [...PESTANAS, ...(API ? [['usuarios', 'Usuarios']] : [])];
  return p ? todas.filter(([k]) => p.includes(k)) : todas;
}
function pintarUsuario() {
  const u = $('#usuario');
  if (S.rol === 'visitante') u.innerHTML = '<span class="chip e-pasivo">Solo lectura</span><a class="btn mini prim" href="#/ingresar">Ingresar</a>';
  else if (!API) u.innerHTML = '<span class="chip e-activo">Administrador</span>';
  else {
    u.innerHTML = `<span class="u-nombre">${esc(S.nombre || S.correo)}</span><span class="chip e-activo">${esc(ROLES[S.rol] || S.rol)}</span><a class="btn mini" href="#" id="salir">Salir</a>`;
    $('#salir').addEventListener('click', (e) => { e.preventDefault(); ponerToken(''); S.rol = 'visitante'; S.nombre = ''; S.correo = ''; pintarUsuario(); location.hash = '#/resumen'; mostrar(); toast('Sesión cerrada.'); });
  }
}
function mostrar() {
  const partes = (location.hash.replace(/^#\/?/, '') || 'resumen').split('/');
  const tabs = pestanasDe(S.rol);
  let vista = VISTAS[partes[0]] ? partes[0] : 'resumen';
  if (vista === 'ingresar' && !API) vista = 'resumen';
  if (vista !== 'ingresar' && !tabs.some(([k]) => k === vista)) vista = S.rol === 'visitante' && ['evaluar', 'parametros', 'usuarios'].includes(vista) ? 'ingresar' : 'resumen';
  $('#menu').innerHTML = tabs.map(([k, n]) => `<a href="#/${k}" class="${k === vista ? 'activo' : ''}">${n}</a>`).join('');
  const c = $('#contenido');
  VISTAS[vista](c, partes.slice(1).map(decodeURIComponent));
  if (S.rol !== 'admin' && vista !== 'evaluar' && vista !== 'ingresar') {
    // Se ve todo, pero solo el administrador cambia horario y parámetros
    $$('input, select, textarea', c).forEach((el) => { if (!NAVEGAR.includes(el.id)) el.disabled = true; });
    $$('button.btn, #h-estado', c).forEach((el) => { el.hidden = true; });
    if (S.rol === 'visitante') $$('a[href^="#/evaluar"]', c).forEach((el) => { el.hidden = true; });
    $$('.aviso-vacio p', c).forEach((p) => { p.innerHTML = p.innerHTML.replace(/Los indicadores se llenan[^]*$/, 'Los indicadores aparecerán cuando se registren las evaluaciones.'); });
  }
}

async function iniciar() {
  try { const g = JSON.parse(localStorage.getItem('kpi-periodo')); if (g && g.tipo && g.clave) S.per = g; } catch (e) { /* sin almacenamiento */ }
  if (!S.per) S.per = { tipo: 'semana', clave: SEMANA_ACTUAL };
  S.rol = 'visitante';
  try {
    if (API) {
      const t = leerToken();
      const [rs] = await Promise.all([t ? api('/api/sesion') : null, cargarDatos()]);
      if (rs && rs.ok) { const s = await rs.json(); S.rol = s.rol; S.nombre = s.nombre; S.correo = s.correo; } else if (t) ponerToken('');
    } else {
      const [rs] = await Promise.all([fetch('/api/sesion'), cargarDatos()]);
      const s = await rs.json(); S.rol = s.rol; S.local = s.local;
    }
  } catch (e) {
    if (EN_GITHUB && !S.datos) { // sin conexión con el API: se muestra la última copia publicada
      try { S.datos = await (await fetch('../data/datos.json', { cache: 'no-store' })).json(); S.sinApi = true; } catch (e2) { /* nada */ }
      if (S.datos) { S.datos.turnos = S.datos.turnos || JSON.parse(JSON.stringify(TURNOS_BASE)); S.datos.horarios = S.datos.horarios || {}; S.datos.evaluaciones = S.datos.evaluaciones || {}; }
    }
    if (!S.datos) {
      $('#contenido').innerHTML = `<div class="panel aviso-vacio"><h2>No se pudo cargar la información</h2><p>${API ? 'Revisa tu conexión a internet y recarga la página.' : 'Abre el portal con el servidor local: <code>herramientas\\servidor.ps1</code> y entra a http://localhost:8081/'}</p></div>`;
      return;
    }
  }
  pintarUsuario();
  if (S.local) { const a = $('#aviso-local'); a.hidden = false; a.textContent = 'Trabajando en esta computadora: estos datos NO son los del link. Para calificar en línea usa https://jefaturatelearseg.github.io/portal-desempeno/public/'; }
  if (S.sinApi) { const a = $('#aviso-local'); a.hidden = false; a.textContent = 'Sin conexión con la base de datos: se muestra una copia antigua y no se puede ingresar.'; }
  window.addEventListener('hashchange', async () => {
    // Si pasó más de medio minuto, se trae lo último que guardaron los demás
    if (API && !S.sinApi && Date.now() - (S.cargado || 0) > 30000) { try { await cargarDatos(); } catch (e) { /* se sigue con lo que hay */ } }
    mostrar();
  });
  mostrar();
}
iniciar();
