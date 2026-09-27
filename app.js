/* Collection d'insignes — application statique (aucune dépendance).
   Données : window.CATALOGUE (data/catalogue.js) ou data/catalogue.json. */
'use strict';

// ---------------------------------------------------------------- Couleurs des tags
// Théâtres : couleur pleine. Familles de fabricants : teinte + pastille. Ordre fixe (palette validée).
const THEATRE_COLORS = {
  'Métropole': '#2a78d6', 'Afrique du Nord': '#eb6834', 'Extrême-Orient': '#1baf7a',
  'Levant': '#4a3aa7', 'Non déterminé': '#6b6a65',
};
const FAMILY_ORDER = ['Drago', 'SNF', 'Arthus-Bertrand', 'Artisanale/locale', 'Augis', 'Chobillon', 'Fraisse-Demey', 'Courtois'];
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const OTHER = '#8a8983';
const familyColor = f => { const i = FAMILY_ORDER.indexOf(f); return i >= 0 ? SERIES[i] : OTHER; };
const theatreColor = t => THEATRE_COLORS[t] || OTHER;

// ---------------------------------------------------------------- Outils
const $ = (s, r = document) => r.querySelector(s);
const arr = x => Array.isArray(x) ? x : (x && Array.isArray(x.value) ? x.value : (x == null || x === '' ? [] : [x]));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = n => n.toLocaleString('fr-FR');
const pluriel = (n, s, p) => `${fmt(n)} ${n > 1 ? (p || s + 's') : s}`;
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------- Données
let DB = null;
const PAGE = 120;

async function charger() {
  let c = window.CATALOGUE;
  if (!c) {
    const r = await fetch('data/catalogue.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`data/catalogue.json : HTTP ${r.status}`);
    c = await r.json();
  }
  let notices = window.NOTICES;
  if (!notices) {
    try { const r = await fetch('data/notices.json', { cache: 'no-cache' }); if (r.ok) notices = await r.json(); } catch (_) { /* notices facultatives */ }
  }
  notices = notices || {};
  const themes = arr(c.themes).map(t => ({ ...t, planches: arr(t.planches) }));
  const planches = arr(c.planches).map(p => ({ ...p, insignes: arr(p.insignes) }));
  const insignes = arr(c.insignes).map(i => ({ ...i, variantes: arr(i.variantes) }));
  const themeBy = new Map(themes.map(t => [t.code, t]));
  const plBy = new Map(planches.map(p => [p.id, p]));
  const byId = new Map(insignes.map(i => [i.id, i]));
  for (const i of insignes) {
    i.themeLib = themeBy.get(i.theme)?.libelle || i.theme;
    i.plancheLib = plBy.get(i.planche)?.libelle || '';
    i.homol = i.homologation ? 'Homologué' : 'Non homologué';
    const n = notices[i.id] || {};
    i.txtUnite = n.r || ''; i.txtInsigne = n.i || ''; i.txtComment = n.c || '';
    i._s = norm([i.id, i.libelle, i.unite, i.type, i.fabricant, i.famille, i.homologation, i.variantes.join(' '),
      i.precision, i.theatre, i.themeLib, i.plancheLib, i.txtUnite, i.txtInsigne, i.txtComment].join(' | '));
  }
  // Ordre global = ordre des thèmes puis des planches
  const rang = new Map(); let k = 0;
  for (const t of themes) for (const pid of t.planches) for (const id of (plBy.get(pid)?.insignes || [])) rang.set(id, k++);
  for (const i of insignes) i._rang = rang.has(i.id) ? rang.get(i.id) : 1e9;
  DB = { themes, planches, insignes, themeBy, plBy, byId, genere: c.genere_le };
}

// ---------------------------------------------------------------- Facettes (filtres Collection)
const FACETS = [
  { key: 'theatre', label: 'Théâtre', get: i => i.theatre, lab: v => v },
  { key: 'theme', label: 'Thème', get: i => i.theme, lab: v => DB.themeBy.get(v)?.libelle || v, order: 'theme' },
  { key: 'famille', label: 'Fabricant (famille)', get: i => i.famille },
  { key: 'fabricant', label: 'Fabricant (code)', get: i => i.fabricant },
  { key: 'type', label: "Type d'unité", get: i => i.type },
  { key: 'variante', label: 'Variante', get: i => i.variantes, multi: true },
  { key: 'homol', label: 'Homologation', get: i => i.homol },
];
const EXTRA = { unite: { label: 'Unité', get: i => i.unite }, planche: { label: 'Planche', get: i => i.planche, lab: v => DB.plBy.get(v)?.libelle || v } };

function match(i, f, skip) {
  for (const [k, v] of Object.entries(f)) {
    if (!v || k === skip || k === 'tri' || k === 'n') continue;
    if (k === 'q') { const toks = norm(v).split(/\s+/).filter(Boolean); if (!toks.every(t => i._s.includes(t))) return false; continue; }
    const fc = FACETS.find(x => x.key === k) || EXTRA[k];
    if (!fc) continue;
    const val = fc.get(i);
    if (Array.isArray(val) ? !val.includes(v) : String(val ?? '') !== v) return false;
  }
  return true;
}

function counts(f, fc) {
  const m = new Map();
  for (const i of DB.insignes) {
    if (!match(i, f, fc.key)) continue;
    for (const v of arr(fc.get(i))) if (v != null && v !== '') m.set(v, (m.get(v) || 0) + 1);
  }
  let e = [...m.entries()];
  if (fc.order === 'theme') { const o = DB.themes.map(t => t.code); e.sort((a, b) => o.indexOf(a[0]) - o.indexOf(b[0])); }
  else e.sort((a, b) => b[1] - a[1] || collator.compare(String(a[0]), String(b[0])));
  return e;
}

// ---------------------------------------------------------------- Routeur
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { view: parts[0] || 'accueil', arg: parts[1], params };
}
const lienCollection = p => '#/collection?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString();

function render() {
  if (!DB) return;
  const { view, arg, params } = parseHash();
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === view || (view === 'insigne' && a.dataset.nav === 'collection')));
  $('#q').value = view === 'collection' ? (params.q || '') : '';
  const app = $('#app');
  const views = { accueil: vueAccueil, planches: vuePlanches, collection: vueCollection, stats: vueStats, insigne: vueInsigne };
  (views[view] || vueAccueil)(app, arg, params);
  // Pas de remontée en haut de page quand on clique « Afficher plus »
  const { n, ...rest } = params;
  const cle = view + '|' + (arg || '') + '|' + JSON.stringify(rest);
  if (cle !== DERNIERE_CLE) window.scrollTo({ top: 0 });
  DERNIERE_CLE = cle;
}
let DERNIERE_CLE = '';

// ---------------------------------------------------------------- Composants
function tags(i) {
  const t = [];
  t.push(`<a class="tag theatre" style="--c:${theatreColor(i.theatre)}" href="${lienCollection({ theatre: i.theatre })}" title="Théâtre">${esc(i.theatre)}</a>`);
  if (i.famille) {
    const fab = i.fabricant && i.fabricant !== i.famille ? `${i.famille} · ${i.fabricant}` : i.famille;
    t.push(`<a class="tag fab" style="--c:${familyColor(i.famille)}" href="${lienCollection({ famille: i.famille })}" title="Fabricant">${esc(fab)}</a>`);
  }
  if (i.type) t.push(`<a class="tag type" href="${lienCollection({ type: i.type })}" title="Type d'unité">${esc(i.type)}</a>`);
  for (const v of i.variantes) t.push(`<a class="tag var" href="${lienCollection({ variante: v })}" title="Variante">${esc(v)}</a>`);
  if (i.homologation) t.push(`<span class="tag hom" title="Homologation">${esc(i.homologation)}</span>`);
  return `<div class="tags">${t.join('')}</div>`;
}

function carte(i, opts = {}) {
  const sub = opts.contexte ? `<div class="sub">${esc(i.themeLib)} · ${esc(i.plancheLib)}</div>` : '';
  const no = i.ordre != null ? `<span class="no">${esc(i.ordre)}.</span>` : '';
  return `<article class="card">
    <button class="open" type="button" data-open="${esc(i.id)}" aria-label="Voir ${esc(i.libelle)}">
      <img loading="lazy" decoding="async" src="${esc(i.thumb)}" alt="${esc(i.libelle)}"></button>
    <div class="body"><div class="title">${no}${esc(i.libelle)}</div>${sub}${tags(i)}</div>
  </article>`;
}

function legende() {
  const th = Object.keys(THEATRE_COLORS).filter(t => DB.insignes.some(i => i.theatre === t));
  const fa = FAMILY_ORDER.filter(f => DB.insignes.some(i => i.famille === f));
  return `<div class="legend"><span>Théâtre :</span>${th.map(t => `<span class="tag theatre" style="--c:${theatreColor(t)}">${esc(t)}</span>`).join('')}
    <span style="margin-left:8px">Fabricant :</span>${fa.map(f => `<span class="tag fab" style="--c:${familyColor(f)}">${esc(f)}</span>`).join('')}
    <span class="tag fab" style="--c:${OTHER}">autres</span></div>`;
}

// Texte libre -> HTML : lignes commençant par « - » en liste, le reste en paragraphes
function texte(t) {
  const out = []; let ul = [];
  const flush = () => { if (ul.length) { out.push(`<ul>${ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); ul = []; } };
  for (const l of String(t).split(/\n+/)) {
    const s = l.trim(); if (!s) continue;
    const m = s.match(/^[-•*–]\s*(.*)$/);
    if (m) ul.push(m[1]); else { flush(); out.push(`<p>${esc(s)}</p>`); }
  }
  flush(); return out.join('');
}

// ---------------------------------------------------------------- Vue Accueil
function vueAccueil(app) {
  document.title = "Collection d'insignes";
  const nbUnites = new Set(DB.insignes.map(i => i.unite).filter(Boolean)).size;
  const nbFab = new Set(DB.insignes.map(i => i.famille).filter(f => f && f !== 'Non indiqué')).size;
  const cartes = DB.themes.map(t => {
    const ids = t.planches.flatMap(p => DB.plBy.get(p)?.insignes || []);
    const pick = [0, 1, 2, 3].map(k => ids[Math.floor(k * ids.length / 4)]).filter(Boolean).map(id => DB.byId.get(id));
    return `<a class="theme-card" href="#/planches/${esc(t.planches[0])}">
      <div class="mosaic">${pick.map(i => `<img loading="lazy" src="${esc(i.thumb)}" alt="">`).join('')}</div>
      <div class="body"><span class="name">${esc(t.libelle)}</span>
        <div class="meta"><span>${pluriel(ids.length, 'insigne')} · ${pluriel(t.planches.length, 'planche')}</span>
        <span class="tag theatre" style="--c:${theatreColor(t.theatre)}">${esc(t.theatre)}</span></div></div></a>`;
  }).join('');
  app.innerHTML = `<div class="hero"><div><h1>Collection d'insignes</h1>
      <p class="muted">Parcourez les planches, filtrez la collection ou consultez les statistiques.</p></div>
    <div class="kpis"><div class="kpi"><b>${fmt(DB.insignes.length)}</b><span>insignes</span></div>
      <div class="kpi"><b>${fmt(DB.planches.length)}</b><span>planches</span></div>
      <div class="kpi"><b>${fmt(nbUnites)}</b><span>unités</span></div>
      <div class="kpi"><b>${fmt(nbFab)}</b><span>fabricants identifiés</span></div></div></div>
    <h2>Thèmes</h2><div class="themes">${cartes}</div>`;
}

// ---------------------------------------------------------------- Vue Planches
function vuePlanches(app, pid) {
  let p = DB.plBy.get(pid) || DB.plBy.get(DB.themes[0]?.planches[0]);
  if (!p) { app.innerHTML = '<p class="empty">Aucune planche.</p>'; return; }
  const t = DB.themeBy.get(p.theme);
  const ordre = DB.themes.flatMap(x => x.planches);
  const k = ordre.indexOf(p.id);
  const prev = ordre[k - 1], next = ordre[k + 1];
  const items = p.insignes.map(id => DB.byId.get(id)).filter(Boolean);
  document.title = `${p.libelle} – Collection d'insignes`;
  app.innerHTML = `
    <div class="planche-head"><div>
      <div class="muted">${esc(t?.libelle || '')}${p.numero != null ? ` · planche ${esc(p.numero)}` : ''}</div>
      <h1>${esc(p.libelle)}</h1><div class="muted">${pluriel(items.length, 'insigne')}</div></div>
      <div class="nav-pl">
        <a class="btn" ${prev ? `href="#/planches/${esc(prev)}"` : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>← Précédente</a>
        <a class="btn" ${next ? `href="#/planches/${esc(next)}"` : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>Suivante →</a>
      </div></div>
    <div class="toolbar">
      <div class="field"><label for="selTheme">Thème</label><select id="selTheme">${DB.themes.map(x =>
        `<option value="${esc(x.code)}" ${x.code === p.theme ? 'selected' : ''}>${esc(x.libelle)}</option>`).join('')}</select></div>
      <div class="field"><label for="selPlanche">Planche</label><select id="selPlanche">${(t?.planches || []).map(id => {
        const q = DB.plBy.get(id); return `<option value="${esc(id)}" ${id === p.id ? 'selected' : ''}>${q.numero != null ? esc(q.numero) + '. ' : ''}${esc(q.libelle)} (${q.insignes.length})</option>`; }).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><a class="btn" href="${lienCollection({ planche: p.id })}">Filtrer cette planche</a></div>
    </div>
    ${legende()}
    <div class="grid planche">${items.map(i => carte(i)).join('')}</div>`;
  $('#selTheme').onchange = e => { location.hash = '#/planches/' + DB.themeBy.get(e.target.value).planches[0]; };
  $('#selPlanche').onchange = e => { location.hash = '#/planches/' + e.target.value; };
  CONTEXTE = items.map(i => i.id);
}

// ---------------------------------------------------------------- Vue Collection
const TRIS = {
  catalogue: { lab: 'Ordre des planches', f: (a, b) => a._rang - b._rang },
  unite: { lab: 'Unité (A→Z)', f: (a, b) => collator.compare(a.unite || a.libelle || '', b.unite || b.libelle || '') },
  num: { lab: "N° d'unité", f: (a, b) => (a.num_unite ?? 1e9) - (b.num_unite ?? 1e9) || collator.compare(a.type || '', b.type || '') || a._rang - b._rang },
  fabricant: { lab: 'Fabricant', f: (a, b) => collator.compare(a.famille || 'zz', b.famille || 'zz') || collator.compare(a.fabricant || '', b.fabricant || '') || a._rang - b._rang },
};

function vueCollection(app, _arg, params) {
  const f = { ...params };
  const tri = TRIS[f.tri] ? f.tri : 'catalogue';
  const n = Math.max(PAGE, parseInt(f.n, 10) || PAGE);
  const res = DB.insignes.filter(i => match(i, f)).sort(TRIS[tri].f);
  document.title = `Collection (${res.length}) – Collection d'insignes`;
  const selects = FACETS.map(fc => {
    const opts = counts(f, fc);
    const cur = f[fc.key] || '';
    if (cur && !opts.some(([v]) => String(v) === cur)) opts.unshift([cur, 0]);
    const lab = fc.lab || (v => v);
    return `<div class="field"><label for="f-${fc.key}">${fc.label}</label>
      <select id="f-${fc.key}" data-facet="${fc.key}" class="${cur ? 'active' : ''}"><option value="">Tous</option>${opts.map(([v, c]) =>
        `<option value="${esc(v)}" ${String(v) === cur ? 'selected' : ''}>${esc(lab(v))} (${c})</option>`).join('')}</select></div>`;
  }).join('');
  const actifs = Object.entries(f).filter(([k, v]) => v && !['tri', 'n'].includes(k)).map(([k, v]) => {
    const fc = FACETS.find(x => x.key === k) || EXTRA[k];
    const label = k === 'q' ? 'Recherche' : fc?.label || k;
    const val = fc?.lab ? fc.lab(v) : v;
    return `<button class="chip" type="button" data-remove="${esc(k)}"><b>${esc(label)}</b> ${esc(val)} <span aria-hidden="true">×</span><span class="sr" hidden>retirer</span></button>`;
  }).join('');
  app.innerHTML = `<h1>Collection</h1>
    <div class="toolbar">${selects}
      <div class="field"><label for="f-tri">Tri</label><select id="f-tri">${Object.entries(TRIS).map(([k, v]) =>
        `<option value="${k}" ${k === tri ? 'selected' : ''}>${v.lab}</option>`).join('')}</select></div></div>
    <div class="result-bar"><div><b>${pluriel(res.length, 'insigne')}</b> <span class="muted">sur ${fmt(DB.insignes.length)}</span></div>
      <div class="active-filters">${actifs}${actifs ? `<a class="btn" href="#/collection">Tout effacer</a>` : ''}</div></div>
    ${legende()}
    ${res.length ? `<div class="grid">${res.slice(0, n).map(i => carte(i, { contexte: true })).join('')}</div>` : '<p class="empty">Aucun insigne ne correspond à ces critères.</p>'}
    ${res.length > n ? `<div class="more"><a class="btn primary" href="${lienCollection({ ...f, n: n + PAGE * 2 })}">Afficher plus (${fmt(res.length - n)} restants)</a></div>` : ''}`;
  app.querySelectorAll('[data-facet]').forEach(s => s.onchange = () => { location.hash = lienCollection({ ...f, [s.dataset.facet]: s.value, n: '' }); });
  $('#f-tri').onchange = e => { location.hash = lienCollection({ ...f, tri: e.target.value === 'catalogue' ? '' : e.target.value }); };
  app.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { location.hash = lienCollection({ ...f, [b.dataset.remove]: '', n: '' }); });
  CONTEXTE = res.map(i => i.id);
}

// ---------------------------------------------------------------- Vue Statistiques
function barres(entries, lien, color) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  const tot = entries.reduce((s, e) => s + e[1], 0);
  return `<div class="bars">${entries.map(([k, v, lab]) => `<a class="bar-row" href="${lien(k)}" title="${esc(lab ?? k)} : ${fmt(v)} (${(100 * v / tot).toFixed(1)} %)">
      <span class="lab">${esc(lab ?? k)}</span>
      <span class="track"><span class="fill" style="width:${(100 * v / max).toFixed(1)}%;${color ? `background:${color(k)}` : ''}"></span><span class="val">${fmt(v)}</span></span></a>`).join('')}</div>`;
}
function grouper(get) {
  const m = new Map();
  for (const i of DB.insignes) for (const v of arr(get(i))) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function topN(entries, n) {
  if (entries.length <= n) return entries;
  const reste = entries.slice(n - 1);
  return [...entries.slice(0, n - 1), ['__autres', reste.reduce((s, e) => s + e[1], 0), `Autres (${reste.length} fabricants)`]];
}
function vueStats(app) {
  document.title = "Statistiques – Collection d'insignes";
  const theat = grouper(i => i.theatre);
  const themes = DB.themes.map(t => [t.code, DB.insignes.filter(i => i.theme === t.code).length, t.libelle]).sort((a, b) => b[1] - a[1]);
  const fam = grouper(i => i.famille);
  const fab = grouper(i => i.fabricant).slice(0, 15);
  const types = grouper(i => i.type).slice(0, 15);
  const vars = grouper(i => i.variantes);
  const homol = grouper(i => i.homol);
  // Tableau croisé thème × famille (8 familles principales + autres)
  const cols = FAMILY_ORDER.filter(f => fam.some(([k]) => k === f));
  const cell = (theme, f) => DB.insignes.filter(i => i.theme === theme && (f === '__autres' ? !cols.includes(i.famille) : i.famille === f)).length;
  const rows = themes.map(([code, , lab]) => [code, lab, [...cols, '__autres'].map(f => cell(code, f))]);
  const vmax = Math.max(1, ...rows.flatMap(r => r[2]));
  const shade = v => v ? `background:color-mix(in srgb, var(--bar) ${Math.round(12 + 70 * v / vmax)}%, var(--surface));${v / vmax > .5 ? 'color:#fff' : ''}` : '';
  const xtab = `<div class="xtab-wrap"><table class="xtab"><thead><tr><th>Thème</th>${cols.map(c => `<th class="col">${esc(c)}</th>`).join('')}<th class="col">Autres</th></tr></thead>
    <tbody>${rows.map(([code, lab, vals]) => `<tr><th>${esc(lab)}</th>${vals.map((v, j) => {
      const fam = j < cols.length ? cols[j] : '';
      const href = fam ? lienCollection({ theme: code, famille: fam }) : lienCollection({ theme: code });
      return `<td class="${v ? '' : 'z'}" style="${shade(v)}" title="${esc(lab)} × ${esc(fam || 'autres')} : ${v}">${v ? `<a href="${href}">${v}</a>` : '·'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  app.innerHTML = `<h1>Statistiques</h1><p class="muted">Cliquez sur une barre ou une case pour afficher les insignes correspondants.</p>
    <div class="stats-grid">
      <section class="panel"><h2>Par théâtre</h2>${barres(theat, k => lienCollection({ theatre: k }), theatreColor)}</section>
      <section class="panel"><h2>Par famille de fabricant</h2>${barres(topN(fam, 12), k => k === '__autres' ? '#/collection' : lienCollection({ famille: k }), familyColor)}</section>
      <section class="panel"><h2>Par thème</h2>${barres(themes, k => lienCollection({ theme: k }))}</section>
      <section class="panel"><h2>Fabricants (code, 15 premiers)</h2>${barres(fab, k => lienCollection({ fabricant: k }))}</section>
      <section class="panel"><h2>Types d'unité (15 premiers)</h2>${barres(types, k => lienCollection({ type: k }))}</section>
      <section class="panel"><h2>Variantes</h2>${vars.length ? barres(vars, k => lienCollection({ variante: k })) : '<p class="muted">Aucune.</p>'}
        <h2 style="margin-top:18px">Homologation</h2>${barres(homol, k => lienCollection({ homol: k }))}</section>
    </div>
    <section class="panel" style="margin-top:16px"><h2>Thème × famille de fabricant</h2>${xtab}</section>`;
}

// ---------------------------------------------------------------- Fiche
let CONTEXTE = [];
const fiche = $('#fiche');

function ficheHTML(i, modal) {
  const k = CONTEXTE.indexOf(i.id);
  const prev = k > 0 ? CONTEXTE[k - 1] : null, next = k >= 0 && k < CONTEXTE.length - 1 ? CONTEXTE[k + 1] : null;
  const p = DB.plBy.get(i.planche);
  const row = (dt, dd) => dd ? `<dt>${dt}</dt><dd>${dd}</dd>` : '';
  const memes = [
    i.unite && [`Même unité (${DB.insignes.filter(x => x.unite === i.unite).length})`, lienCollection({ unite: i.unite })],
    i.fabricant && [`Même fabricant (${DB.insignes.filter(x => x.fabricant === i.fabricant).length})`, lienCollection({ fabricant: i.fabricant })],
    i.type && i.num_unite != null && [`${i.num_unite}° ${i.type} (tous)`, lienCollection({ q: `${i.num_unite}° ${i.type}` })],
  ].filter(Boolean);
  return `${modal ? '<button class="fiche-close" type="button" data-close aria-label="Fermer">×</button>' : ''}
    <div class="fiche-img"><img src="${esc(i.img)}" alt="${esc(i.libelle)}"></div>
    <div class="fiche-info">
      <div class="muted">${esc(i.themeLib)}</div>
      <h1 id="ficheTitre">${esc(i.libelle)}</h1>
      ${tags(i)}
      <dl class="attrs">
        ${row('Unité', esc(i.unite))}${row("Type d'unité", esc(i.type))}${row('Fabricant', esc([i.fabricant, i.famille !== i.fabricant ? i.famille : ''].filter(Boolean).join(' – ')))}
        ${row('Homologation', esc(i.homologation))}${row('Variantes', esc(i.variantes.join(', ')))}${row('Précision', esc(i.precision))}
        ${row('Théâtre', esc(i.theatre))}
        ${row('Planche', p ? `<a href="#/planches/${esc(p.id)}">${p.numero != null ? esc(p.numero) + '. ' : ''}${esc(p.libelle)}</a>` : '')}
        ${row("N° d'ordre", esc(i.ordre))}${row('Référence', `<a href="#/insigne/${esc(i.id)}">${esc(i.id)}</a>`)}
      </dl>
      ${i.txtInsigne ? `<section class="notice"><h2>L'insigne</h2>${texte(i.txtInsigne)}</section>` : ''}
      ${i.txtComment ? `<section class="notice comment"><h2>Commentaire</h2>${texte(i.txtComment)}</section>` : ''}
      ${i.txtUnite ? `<details class="notice unite"><summary>Historique de l'unité${i.unite ? ` – ${esc(i.unite)}` : ''}</summary>${texte(i.txtUnite)}</details>` : ''}
      ${memes.length ? `<div class="links">${memes.map(([l, h]) => `<a class="btn" href="${h}">${esc(l)}</a>`).join('')}</div>` : ''}
      <div class="fiche-nav">
        <button class="btn" type="button" data-go="${esc(prev || '')}" ${prev ? '' : 'disabled'}>← Précédent</button>
        <span class="muted">${k >= 0 ? `${k + 1} / ${CONTEXTE.length}` : ''}</span>
        <button class="btn" type="button" data-go="${esc(next || '')}" ${next ? '' : 'disabled'}>Suivant →</button>
      </div>
    </div>`;
}

function ouvrir(id) {
  const i = DB.byId.get(id); if (!i) return;
  $('#ficheBody').innerHTML = ficheHTML(i, true);
  if (!fiche.open) fiche.showModal();
}
function vueInsigne(app, id) {
  const i = DB.byId.get(id);
  if (!i) { app.innerHTML = `<p class="empty">Insigne « ${esc(id)} » introuvable. <a href="#/collection">Retour à la collection</a></p>`; return; }
  document.title = `${i.libelle} – Collection d'insignes`;
  if (!CONTEXTE.includes(i.id)) CONTEXTE = (DB.plBy.get(i.planche)?.insignes || [i.id]);
  app.innerHTML = `<div class="page-fiche"><div class="fiche-inner">${ficheHTML(i, false)}</div></div>`;
}

// ---------------------------------------------------------------- Événements globaux
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) { ouvrir(o.dataset.open); return; }
  const g = e.target.closest('[data-go]');
  if (g && g.dataset.go) {
    if (fiche.open) ouvrir(g.dataset.go); else location.hash = '#/insigne/' + g.dataset.go;
    return;
  }
  if (e.target.closest('[data-close]')) { fiche.close(); return; }
  if (fiche.open && e.target.closest('#fiche a[href^="#"]')) fiche.close();
});
fiche.addEventListener('click', e => { if (e.target === fiche) fiche.close(); }); // clic sur le fond
document.addEventListener('keydown', e => {
  if (!fiche.open && parseHash().view !== 'insigne') return;
  if (e.target.matches('input, select')) return;
  const dir = e.key === 'ArrowRight' ? 'Suivant' : e.key === 'ArrowLeft' ? 'Précédent' : null;
  if (!dir) return;
  const b = [...document.querySelectorAll('[data-go]')].find(x => x.textContent.includes(dir));
  if (b && !b.disabled) b.click();
});
$('#search').addEventListener('submit', e => {
  e.preventDefault();
  const { view, params } = parseHash();
  const base = view === 'collection' ? params : {};
  location.hash = lienCollection({ ...base, q: $('#q').value.trim(), n: '' });
});
// Thème clair / sombre (préférence mémorisée dans le navigateur)
(() => {
  const root = document.documentElement;
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch (_) { /* stockage indisponible */ }
  $('#themeToggle').onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (_) { /* ignoré */ }
  };
})();
window.addEventListener('hashchange', () => { if (fiche.open) fiche.close(); render(); });

// ---------------------------------------------------------------- Démarrage
charger().then(() => {
  $('#footInfo').textContent = `${fmt(DB.insignes.length)} insignes · ${fmt(DB.planches.length)} planches${DB.genere ? ' · catalogue du ' + new Date(DB.genere).toLocaleDateString('fr-FR') : ''}`;
  render();
}).catch(err => {
  $('#app').innerHTML = `<div class="empty"><p><b>Impossible de charger le catalogue.</b></p><p>${esc(err.message)}</p>
    <p>En local, ouvrez le site via un serveur web ou générez <code>data/catalogue.js</code> avec Preparer-Site.ps1.</p></div>`;
});
