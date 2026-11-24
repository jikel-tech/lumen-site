/* JikelTech — nouveau cadre : onglets, accueil, profil, progression locale.
   Tout reste sur l'appareil (localStorage) : pas de compte, pas d'envoi de données. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
  };
  const jget = (k, d) => { try { const v = JSON.parse(store.get(k)); return v ?? d; } catch { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));
  const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA').format(d);
  const APP = () => window.LUMEN_APP || null;
  const track = (n, p) => { try { APP()?.track(n, p); } catch { /* ignore */ } };

  /* ---------- Profil et progression (sur l'appareil) ---------- */
  const COLORS = ['#7FFFB0', '#FFB25E', '#8FB8FF', '#FF8FB1', '#C9A6FF', '#F2E36B'];
  const BADGES = [
    { id: 'python:c1', name: T('Premier print'), e: '🌱' },
    { id: 'python:c2', name: T('Maître des variables'), e: '📦' },
    { id: 'python:c3', name: T('Calculateur'), e: '🧮' },
    { id: 'python:c4', name: T('Décideur'), e: '🔀' },
    { id: 'python:c5', name: T('Boucleur'), e: '🔁' },
    { id: 'python:c6', name: T('Architecte'), e: '🏗️' },
    { id: 'python:exam', name: T('Pythonista'), e: '🏆' },
    { id: 'maintenance:c1', name: T('Connaisseur du PC'), e: '🧩' },
    { id: 'maintenance:c2', name: T('Soigneux'), e: '🧼' },
    { id: 'maintenance:c3', name: T('Détective de pannes'), e: '🔎' },
    { id: 'maintenance:c4', name: T('Réparateur'), e: '🛠️' },
    { id: 'cyber:c1', name: T('Gardien des mots de passe'), e: '🔑' },
    { id: 'cyber:c2', name: T('Anti-arnaque'), e: '🎣' },
    { id: 'cyber:c3', name: T('Bouclier'), e: '🛡️' },
    { id: 'cyber:c4', name: T('Défenseur'), e: '🧯' },
    { id: 'linux:c1', name: T('Premier pas Linux'), e: '🐧' },
    { id: 'linux:c2', name: T('Maître des fichiers'), e: '📁' },
    { id: 'linux:c3', name: T('Gardien des droits'), e: '🔐' },
    { id: 'linux:c4', name: T('Administrateur'), e: '🖧' },
    { id: 'web:c1', name: T('Bâtisseur de pages'), e: '🧱' },
    { id: 'web:c2', name: T('Styliste web'), e: '🎨' },
    { id: 'web:c3', name: T('Publieur'), e: '🚀' },
    { id: 'web:c4', name: T('Dépanneur web'), e: '🧰' },
    { id: 'pylab:c1', name: T('Codeur débutant'), e: '🖥️' },
    { id: 'pylab:c2', name: T('Logicien'), e: '🔁' },
    { id: 'pylab:c3', name: T('Esprit fonction'), e: '🧩' },
    { id: 'pylab:c4', name: T('Caissier du cyber'), e: '💰' },
    { id: 'reseau:c1', name: T('Curieux du réseau'), e: '🌐' },
    { id: 'reseau:c2', name: T('Maître des adresses'), e: '🔢' },
    { id: 'reseau:c3', name: T('Câbleur'), e: '🔌' },
    { id: 'reseau:c4', name: T('Détective ping'), e: '🕵️' },
    { id: 'reseau:lab', name: T('Pro du dépannage'), e: '🛠️' },
    { id: 'reseau:exam', name: T('Technicien réseau'), e: '📡' },
  ];
  const TOTAL_STEPS = 7; // 6 chapitres + l'examen final

  function getProfile() {
    const p = jget('jt_profile', {});
    return { name: typeof p.name === 'string' ? p.name.slice(0, 24) : '', color: COLORS.includes(p.color) ? p.color : COLORS[0], since: p.since || '', photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') && p.photo.length < 60000 ? p.photo : '' };
  }
  function setProfile(patch) {
    const p = { ...getProfile(), ...patch };
    if (!p.since) p.since = dayKey();
    jset('jt_profile', p);
  }
  function getProg() {
    const g = jget('jt_progress', {});
    const s = g.streak || {};
    return {
      xp: Math.max(0, +g.xp || 0),
      streak: { last: typeof s.last === 'string' ? s.last : '', count: +s.count || 0, best: +s.best || 0 },
      courses: g.courses && typeof g.courses === 'object' ? g.courses : {},
      badges: Array.isArray(g.badges) ? g.badges.filter((b) => typeof b === 'string') : [],
      daily: g.daily && typeof g.daily === 'object' ? g.daily : {},
      solved: Math.max(0, +g.solved || 0),
      history: Array.isArray(g.history) ? g.history.filter((h) => h && typeof h === 'object').slice(0, 40) : [],
    };
  }
  // Historique : les 40 dernières activités (chapitre, examen, défi), sur l'appareil seulement.
  function logHist(g, k, label, xp, ok, note) {
    g.history.unshift({ d: dayKey(), k, l: String(label || '').slice(0, 80), xp: xp | 0, ok: !!ok, n: String(note || '').slice(0, 20) });
    g.history.length = Math.min(g.history.length, 40);
  }
  const saveProg = (g) => { jset('jt_progress', g); document.dispatchEvent(new CustomEvent('jt:progress')); };
  const level = (xp) => ({ lvl: Math.floor(xp / 100) + 1, into: xp % 100 });
  function touchStreak(g) {
    const today = dayKey();
    if (g.streak.last === today) return;
    const y = dayKey(new Date(Date.now() - 86400000));
    g.streak.count = g.streak.last === y ? g.streak.count + 1 : 1;
    g.streak.last = today;
    g.streak.best = Math.max(g.streak.best, g.streak.count);
  }
  // La série n'est valable qu'aujourd'hui ou hier : sinon elle est retombée à zéro.
  function streakNow(g) {
    const today = dayKey(), y = dayKey(new Date(Date.now() - 86400000));
    return g.streak.last === today || g.streak.last === y ? g.streak.count : 0;
  }
  const doneChapters = (g) => Object.values(g.courses).reduce((n, c) => n + Object.values(c || {}).filter((x) => x && x.done).length, 0);

  let toastTimer;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const avatarHtml = (cls = '') => {
    const p = getProfile();
    if (typeof p.photo === 'string' && p.photo.startsWith('data:image/')) return `<span class="avatar ${cls} photo" aria-hidden="true"><img src="${p.photo}" alt=""></span>`;
    const ch = p.name ? esc([...p.name][0].toUpperCase()) : '🙂';
    return `<span class="avatar ${cls}" style="background:${p.color}" aria-hidden="true">${ch}</span>`;
  };

  window.JT = { $, $$, esc, store, jget, jset, dayKey, getProfile, setProfile, getProg, saveProg, logHist, level, touchStreak, streakNow, doneChapters, toast, BADGES, TOTAL_STEPS, COLORS, track, go: (t) => setTab(t) };

  /* ---------- Onglets ---------- */
  const TABS = ['home', 'news', 'learn', 'sos', 'me'];
  let current = TABS.find((t) => document.body.classList.contains('tab-' + t)) || 'home';

  function setTab(t, opts = {}) {
    if (!TABS.includes(t)) t = 'home';
    current = t;
    document.body.className = document.body.className.replace(/\btab-\w+\b/g, '').trim() + ' tab-' + t;
    $$('.tab-btn').forEach((b) => {
      const on = b.dataset.tab === t;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (!opts.noHash && !opts.skipUrl) {
      const base = t === 'news' && APP() ? APP().baseUrl() : location.pathname + location.search + (t === 'news' ? '' : '#t=' + t);
      try { history.replaceState(null, '', base); } catch { /* ignore */ }
    }
    if (t === 'news' && opts.cat && APP()) APP().openCategory(opts.cat);
    if (t === 'home') renderHome();
    if (t === 'me') { meView = 'hub'; meTab = 0; renderMe(); }
    document.dispatchEvent(new CustomEvent('jt:tab', { detail: t }));
    if (!opts.keepScroll) scrollTo(0, 0);
    track('tab_view', { tab: t });
  }

  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const t = b.dataset.tab;
    // Retoucher l'onglet déjà ouvert remonte en haut (et ramène « Actualités » à la une).
    if (t === current) { if (t === 'news' && APP()) APP().openCategory('all'); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setTab(t);
  });

  addEventListener('hashchange', () => {
    const h = location.hash;
    const m = h.match(/^#t=(\w+)$/);
    if (m && TABS.includes(m[1])) { if (m[1] !== current) setTab(m[1], { noHash: true }); }
    else if (/^#c=/.test(h) && current !== 'news') setTab('news', { noHash: true });
  });

  /* ---------- Accueil ---------- */
  const photoOk = (u) => typeof u === 'string' && (u.startsWith('https://images.pexels.com/') || u.startsWith('https://images.unsplash.com/')) && !/['"()\s]/.test(u);
  const greeting = () => (new Date().getHours() >= 18 || new Date().getHours() < 5 ? T('Bonsoir') : T('Bonjour'));

  function parcoursHtml() {
    const g = getProg();
    const sum = window.JT.courseSummary ? window.JT.courseSummary() : null;
    const mods = window.JT.coursesProgress ? window.JT.coursesProgress() : [];
    const lv = level(g.xp), st = streakNow(g);
    const pct = sum ? sum.pct : 0, cdone = sum ? sum.done : 0;
    const title = sum ? `${sum.name} · ${sum.nextTitle}` : T('Python · Chapitre 1');
    const sub = !sum ? T('Commence ton parcours : 10 minutes suffisent.') : sum.waiting ? T('Bravo ! Tu as validé tous les chapitres et l\'examen.') : cdone === 0 ? T('Commence ce module : 10 minutes suffisent.') : T(cdone > 1 ? '{n} étapes validées sur {t}' : '{n} étape validée sur {t}', { n: cdone, t: sum.total });
    const cta = !sum || cdone === 0 ? T('Commencer') : sum.waiting ? T('Voir le parcours') : T('Continuer');
    const rows = mods.map((m) => `<button type="button" class="mod${m.finished ? ' fin' : ''}" data-mod="${esc(m.id)}"><span class="me">${m.emoji}</span><span class="mt"><b>${esc(m.name)}</b><i class="mbar"><u style="width:${m.pct}%"></u></i></span><small>${m.done}/${m.total}</small></button>`).join('');
    return `<div class="parcours">
      <div class="parcours-row">
        <div class="ring" style="--p:${pct}"><i>${pct}%</i></div>
        <div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>
      </div>
      <div class="pstats"><span class="pill xp">⭐ ${g.xp} XP</span><span class="pill">${T('Niveau')} ${lv.lvl}</span>${st ? `<span class="pill">🔥 ${T(st > 1 ? '{n} jours' : '{n} jour', { n: st })}</span>` : ''}</div>
      <button type="button" class="btn-main" data-act="to-mod" data-mod="${sum ? esc(sum.id) : 'python'}">${cta} →</button>
      ${rows ? `<h4 class="mods-t">${T('Tous mes modules')}</h4><div class="mods">${rows}</div>` : ''}
    </div>`;
  }

  function extractHtml() {
    const app = APP();
    const list = app ? [...app.articles].sort((a, b) => app.score(b) - app.score(a)).slice(0, 3) : [];
    if (!list.length) return '<p class="av-sub">' + T('Chargement des actus…') + '</p>';
    return list.map((a) => {
      const bg = photoOk(a.image) ? `style="background-image:url('${esc(a.image)}')"` : `style="background-image:url('assets/categories/${esc(app.catKey(a.category))}.svg')"`;
      return `<button type="button" class="xrow" data-art="${esc(a.id)}"><span class="th" ${bg}></span><span><span class="k">${esc(app.catLabel(a.category))}</span><h4>${esc(a.title)}</h4><small>${esc(a.source)} · ${esc(app.timeAgo(a.pubDate))}</small></span></button>`;
    }).join('');
  }

  function renderHome() {
    const p = getProfile();
    const ask = !p.name && !store.get('jt_name_skip');
    $('#view-home').innerHTML = `
      <div class="av-top"><span class="av-brand">Jikel<em>Tech</em></span><button type="button" class="avatar-btn" data-act="to-me" aria-label="Mon profil" style="background:none;border:none;padding:0;cursor:pointer">${avatarHtml()}</button></div>
      <h1 class="greet">${greeting()}${p.name ? ', <em>' + esc(p.name) + '</em>' : ''} 👋</h1>
      <p class="greet-sub">Qu'est-ce qu'on fait aujourd'hui ?</p>
      ${ask ? `<div class="name-ask"><p>Comment dois-je t'appeler ?</p>
        <form id="nameForm"><input id="nameInput" type="text" maxlength="24" placeholder="Ton prénom" autocomplete="given-name" aria-label="Ton prénom"><button class="btn-main" type="submit">OK</button></form>
        <small>Pas de compte : ton prénom reste sur ton téléphone. <button type="button" data-act="skip-name" style="background:none;border:none;color:var(--phosphor);cursor:pointer;font:inherit;text-decoration:underline">Plus tard</button></small></div>` : ''}
      <form class="hsearch" id="homeSearch" role="search"><span aria-hidden="true">⌕</span><input type="search" id="homeSearchInput" placeholder="Rechercher une actu, une marque, un sujet…" aria-label="Recherche" autocomplete="off"></form>
      <div class="hcards">
        <button type="button" class="hcard sos" data-act="to-sos"><span class="ic">🛠️</span><b>SOS Tech</b><small>Une panne ? On t'aide pas à pas.</small></button>
        <button type="button" class="hcard learn" data-act="to-learn"><span class="ic">🎓</span><b>Apprendre</b><small>Cours, jeux et badges.</small></button>
        <button type="button" class="hcard" data-act="to-news"><span class="ic">📰</span><b>Actualités</b><small>Tech et Cameroun, en bref.</small></button>
      </div>
      <h2 class="sect-title">Ton parcours</h2>
      <div id="homeParcours">${parcoursHtml()}</div>
      <h2 class="sect-title">À la une <button type="button" data-act="to-news">Toutes les actus →</button></h2>
      <div id="homeExtract">${extractHtml()}</div>`;
    I18N.apply($('#view-home'));
  }

  $('#view-home').addEventListener('click', (e) => {
    const md = e.target.closest('[data-mod]');
    if (md) { if (window.JT.openCourse) window.JT.openCourse(md.dataset.mod); else setTab('learn'); return; }
    const a = e.target.closest('[data-act],[data-art]');
    if (!a) return;
    if (a.dataset.art) { location.hash = '#a=' + encodeURIComponent(a.dataset.art); return; }
    const act = a.dataset.act;
    if (act === 'to-learn') setTab('learn');
    else if (act === 'to-sos') setTab('sos');
    else if (act === 'to-news') setTab('news');
    else if (act === 'to-me') setTab('me');
    else if (act === 'skip-name') { store.set('jt_name_skip', '1'); renderHome(); }
  });
  $('#view-home').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'nameForm') {
      const v = $('#nameInput').value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      setProfile({ name: v });
      track('name_set');
      renderHome();
      toast(T('Enchanté, {n} !', { n: v }));
    } else if (e.target.id === 'homeSearch') {
      const q = $('#homeSearchInput').value.trim();
      if (!q) return;
      setTab('news', { skipUrl: true });
      APP()?.search(q);
      track('search_from_home');
    }
  });

  // Les actus arrivent après le chargement : on met à jour l'extrait sans toucher au champ de recherche.
  document.addEventListener('lumen:data', () => { if (current === 'home' && $('#homeExtract')) { $('#homeExtract').innerHTML = extractHtml(); I18N.apply($('#homeExtract')); } });
  document.addEventListener('jt:ready', () => { if (current === 'home' && $('#homeParcours')) { $('#homeParcours').innerHTML = parcoursHtml(); I18N.apply($('#homeParcours')); } });

  /* ---------- Profil ---------- */
  function exportCode() {
    const data = { p: getProfile(), g: getProg(), r: jget('jt_rank', {}) };
    return 'JT1.' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function importCode(code) {
    const m = String(code || '').trim().match(/^JT1\.([A-Za-z0-9+/=]+)$/);
    if (!m || m[1].length > 60000) throw new Error('Code non valide.');
    const d = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (!d || typeof d !== 'object' || !d.g) throw new Error('Code non valide.');
    jset('jt_profile', { name: String(d.p?.name || '').slice(0, 24), color: COLORS.includes(d.p?.color) ? d.p.color : COLORS[0], since: String(d.p?.since || '') });
    const rr = d.r;
    if (rr && /^[0-9a-f]{12}$/.test(rr.uid || '') && /^[0-9a-f]{32}$/.test(rr.secret || '')) jset('jt_rank', { uid: rr.uid, secret: rr.secret, on: !!rr.on, last: 0 });
    const g = d.g;
    jset('jt_progress', { xp: Math.max(0, +g.xp || 0), streak: g.streak || {}, courses: g.courses && typeof g.courses === 'object' ? g.courses : {}, badges: Array.isArray(g.badges) ? g.badges.filter((b) => typeof b === 'string') : [], daily: g.daily || {}, solved: Math.max(0, +g.solved || 0), history: Array.isArray(g.history) ? g.history.slice(0, 40) : [] });
  }

  function historyHtml(g) {
    if (!g.history.length) return `<p class="av-sub">${T('Ton historique apparaîtra ici après ton premier chapitre ou défi.')}</p>`;
    const icon = { chap: '📘', exam: '🏆', daily: '⚡' };
    const fmt = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(I18N.locale, { day: 'numeric', month: 'short' }); } catch { return d; } };
    return `<ol class="hist">${g.history.slice(0, 12).map((h) => `<li class="${h.ok ? 'ok' : 'ko'}"><span class="hi">${icon[h.k] || '•'}</span><span class="ht"><b>${esc(h.l)}</b><small>${esc(fmt(h.d))}${h.n ? ' · ' + esc(h.n) : ''} · ${h.ok ? T('validé') : T('à refaire')}</small></span><span class="hx">${h.xp ? '+' + h.xp + ' XP' : ''}</span></li>`).join('')}</ol>`;
  }
  function modsProfileHtml() {
    const mods = window.JT.coursesProgress ? window.JT.coursesProgress() : [];
    if (!mods.length) return '';
    return `<div class="mods">${mods.map((m) => `<button type="button" class="mod${m.finished ? ' fin' : ''}" data-mod="${esc(m.id)}"><span class="me">${m.emoji}</span><span class="mt"><b>${esc(m.name)}</b><i class="mbar"><u style="width:${m.pct}%"></u></i></span><small>${m.done}/${m.total}</small></button>`).join('')}</div>`;
  }
  function badgesHtml(owned) {
    const names = {}; (window.JT.coursesProgress ? window.JT.coursesProgress() : []).forEach((m) => { names[m.id] = m.emoji + ' ' + m.name; });
    const groups = {};
    BADGES.forEach((b) => { const k = b.id.split(':')[0]; (groups[k] = groups[k] || []).push(b); });
    return Object.keys(groups).map((k) => {
      const list = groups[k], n = list.filter((b) => owned.has(b.id)).length;
      return `<details class="bgrp"${n ? ' open' : ''}><summary>${esc(names[k] || k)} <small>${n}/${list.length}</small></summary><div class="badges">${list.map((b) => `<div class="badge ${owned.has(b.id) ? 'on' : 'off'}"><span class="e">${b.e}</span><small>${esc(b.name)}</small></div>`).join('')}</div></details>`;
    }).join('');
  }
  let meView = 'hub', meTab = 0;
  const MEDAL_TXT = { bronze: ['Médaille de Bronze', 'Premiers pas réussis !'], silver: ['Médaille d\'Argent', 'Tu progresses vite !'], gold: ['Médaille d\'Or', 'Un vrai champion !'], legend: ['Médaille Légendaire', 'Tu es une légende !'] };
  const fmtN = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function renderMe() {
    const p = getProfile(), g = getProg(), lv = level(g.xp);
    const R = window.JT.rank, L = R.leagueOf(g.xp);
    const el = $('#view-me');
    const head = (title, ico) => `<div class="sub-head"><button type="button" class="sub-back" data-me="back" aria-label="${T('Retour')}">←</button><h2>${title}</h2><span class="sub-ico">${ico}</span></div>`;
    const tabs = (names) => `<div class="seg">${names.map((n, i) => `<button type="button" class="${meTab === i ? 'on' : ''}" data-metab="${i}">${n}</button>`).join('')}</div>`;
    const mods = window.JT.coursesProgress ? window.JT.coursesProgress() : [];
    let html = '';
    if (meView === 'hub') {
      const tile = (v, ico, t, sub) => `<button type="button" class="tile2" data-view="${v}"><span class="ti">${ico}</span><span class="tx"><b>${t}</b><small>${sub}</small></span><i class="ch">›</i></button>`;
      const avatar = p.photo ? `<span class="avatar photo big"><img src="${p.photo}" alt=""></span>` : avatarHtml('big');
      const msg = g.xp === 0 ? [T('Bienvenue !'), T('Valide ton premier chapitre 🚀')] : [T('Continue d\'avancer !'), T('Tu es sur la bonne voie 💪')];
      html = `<div class="av-top"><span class="av-brand">Jikel<em>Tech</em><i class="av-sec">${T('Profil')}</i></span></div>
        <div class="hero">
          <button type="button" class="hero-edit" data-me="editname" aria-label="${T('Changer mon prénom')}">✎</button>
          <label class="me-photo" for="photoInput" aria-label="${T('Changer la photo')}">${avatar}<span class="cam" aria-hidden="true">📷</span></label>
          <input type="file" id="photoInput" accept="image/*" hidden>
          <div class="hero-name"><b id="heroName">${p.name ? esc(p.name) : T('Invité')}</b> <span>${L.cur.e}</span></div>
          <form class="me-name-form" id="meNameForm" hidden><input class="field" id="meName" type="text" maxlength="24" placeholder="Ton prénom" value="${esc(p.name)}" aria-label="Ton prénom"><button class="btn-line" type="submit">✓</button></form>
          <p class="hero-tag">${T('Apprendre • Explorer • Réussir')}</p>
          <div class="hero-pills"><span class="pill2">📊 ${T('Niveau')} ${lv.lvl}</span><span class="pill2">⭐ ${fmtN(g.xp)} XP</span></div>
        </div>
        <h3 class="space-t">⭐ ${T('Ton espace')}</h3>
        <div class="tiles2">
          ${tile('rewards', '🏅', T('Mes récompenses'), T('Médailles & Badges'))}
          ${tile('rank', '🏆', T('Classement'), T('Top 100'))}
          ${tile('progress', '📈', T('Ma progression'), T('Stats & Historique'))}
          ${tile('settings', '⚙️', T('Paramètres'), T('Notifications, Thème…'))}
          ${tile('info', 'ℹ️', T('Informations'), T('À propos, Contact…'))}
        </div>
        <div class="encour"><span>👑</span><div><b>${msg[0]}</b><small>${msg[1]}</small></div></div>`;
    } else if (meView === 'rewards') {
      html = head(T('Mes récompenses'), '🏆') + tabs(['🏅 ' + T('Médailles'), '🎖️ ' + T('Badges')]);
      if (meTab === 0) {
        const cur = L.cur, tx = MEDAL_TXT[cur.id];
        const recent = g.badges.slice(-3).reverse().map((id) => BADGES.find((b) => b.id === id)).filter(Boolean);
        html += `<div class="medal-hero"><div class="laurel"><span class="lf">🌿</span><span class="mb">${cur.e}</span><span class="lf r">🌿</span></div>
          <h3>${T(tx[0])}</h3><p>${T(tx[1])}</p><span class="pill2">🛡️ ${T('Obtenue grâce à {n} XP', { n: fmtN(cur.min) + (cur.min ? '+' : '') })}</span></div>
          <div class="medals4">${R.LEAGUES.map((l, k) => `<div class="m4${k === L.i ? ' cur' : ''}${k > L.i ? ' lock' : ''}"><span>${l.e}</span><b>${T(l.n)}</b><small>${l.max ? '(' + l.min + '–' + l.max + ')' : '(' + fmtN(l.min) + '+)'}</small></div>`).join('')}</div>
          ${L.next ? `<p class="lg-next">${T('encore {n} XP pour {l}', { n: L.next.min - g.xp, l: T(L.next.n) })}</p>` : ''}
          <div class="rec-h"><h4>⭐ ${T('Badges récents')}</h4><button type="button" class="lnk" data-metab="1">${T('Voir tout')} →</button></div>
          ${recent.length ? `<div class="rec3">${recent.map((b) => `<div class="rb"><span>${b.e}</span><b>${esc(b.name)}</b></div>`).join('')}</div>` : `<p class="av-sub">${T('Tes badges apparaîtront ici après ton premier chapitre.')}</p>`}`;
      } else {
        html += `<h4 class="mods-t">${g.badges.length}/${BADGES.length} ${T('badges')}</h4>${badgesHtml(new Set(g.badges))}`;
      }
    } else if (meView === 'rank') {
      html = head(T('Classement'), '🏆') + tabs(['📊 Top 100', '👤 ' + T('Mes rangs')]) + `<div id="rkBoard" data-tab="${meTab}"></div>`;
    } else if (meView === 'progress') {
      html = head(T('Ma progression'), '📈') + tabs(['📊 ' + T('Statistiques'), '🕘 ' + T('Historique')]);
      if (meTab === 0) {
        const started = mods.filter((m) => m.done > 0).length;
        const tot = mods.reduce((n, m) => n + m.total, 0), dn = mods.reduce((n, m) => n + m.done, 0), pc = tot ? Math.round((dn / tot) * 100) : 0;
        const st = (ico, n, t) => `<div class="st4"><span>${ico}</span><small>${t}</small><b>${n}</b></div>`;
        html += `<div class="stats4">${st('📘', started, T('Cours suivis'))}${st('✅', g.solved, T('Défis réussis'))}${st('⭐', fmtN(g.xp), T('XP total'))}${st('🔥', streakNow(g) + ' ' + T('jours'), T('Série actuelle'))}</div>
          <div class="glob"><div><b>${T('Progression globale')}</b><b>${pc}%</b></div><i class="mbar"><u style="width:${pc}%"></u></i></div>
          <h4 class="mods-t">${T('Mes modules')}</h4>${modsProfileHtml()}
          <h4 class="mods-t">${T('Gestion des données')}</h4>
          <div class="rowlist">
            <button type="button" data-me="export"><span>🔳</span><div><b>${T('Générer mon code')}</b><small>${T('Sauvegarder ma progression')}</small></div><i>›</i></button>
            <button type="button" data-me="import"><span>🔄</span><div><b>${T('Restaurer avec un code')}</b><small>${T('Récupérer ma progression')}</small></div><i>›</i></button>
            <button type="button" data-me="reset" class="danger"><span>🗑️</span><div><b>${T('Effacer ma progression')}</b><small>${T('Recommencer depuis zéro')}</small></div><i>›</i></button>
          </div>
          <textarea class="code-box" id="meCode" hidden spellcheck="false" aria-label="Code de sauvegarde"></textarea>
          <div class="exbar" id="meCodeBar" hidden><button type="button" class="btn-main" data-me="copy">Copier</button><button type="button" class="btn-main" data-me="apply" hidden>Restaurer</button></div>
          <p class="msg" id="meMsg" role="status"></p>`;
      } else html += historyHtml(g);
    } else if (meView === 'settings') {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const pushOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      const sub = store.get('lumen_sub') === '1';
      html = head(T('Paramètres'), '⚙️') + `<div class="rowlist set">
          <div class="srow"><span>🔔</span><div><b>Notifications</b><small>${T('Recevoir les alertes et mises à jour')}</small></div><button type="button" class="sw${pushOn ? ' on' : ''}" data-me="push" aria-label="Notifications"><i></i></button></div>
          <div class="srow"><span>🌙</span><div><b>${T('Thème')}</b><small>${T('Choisir le mode d\'affichage')}</small></div><span class="seg mini"><button type="button" class="${light ? '' : 'on'}" data-theme-set="dark">${T('Sombre')}</button><button type="button" class="${light ? 'on' : ''}" data-theme-set="light">${T('Clair')}</button></span></div>
          <div class="srow"><span>✉️</span><div><b>Newsletter</b><small>${T('Recevoir la newsletter JikelTech')}</small></div><button type="button" class="${sub ? 'btn-line' : 'btn-main'} mini-btn" data-sub-btn>${sub ? T('Abonné ✔') : T('S\'abonner')}</button></div>
          <div class="srow"><span>🌐</span><div><b>${T('Langue')}</b><small>${T('Choisir votre langue')}</small></div><span class="seg mini"><button type="button" class="${I18N.lang === 'fr' ? 'on' : ''}" data-lang="fr">FR</button><button type="button" class="${I18N.lang === 'en' ? 'on' : ''}" data-lang="en">EN</button></span></div>
          <div class="srow"><span>🎨</span><div><b>${T('Couleur de l\'avatar')}</b></div><div class="colors" role="group" aria-label="Couleur de l'avatar">${COLORS.map((c) => `<button type="button" data-color="${c}" class="${c === p.color ? 'on' : ''}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div></div>
          ${p.photo ? `<div class="srow"><span>🖼️</span><div><b>${T('Photo de profil')}</b></div><button type="button" class="btn-line mini-btn" data-me="photo-del">${T('Retirer la photo')}</button></div>` : ''}
        </div><div class="note-ok">ℹ️ ${T('Tes préférences sont enregistrées automatiquement.')}</div>`;
    } else if (meView === 'info') {
      const row = (a, ico, t, sub) => `<button type="button" data-me="${a}"><span>${ico}</span><div><b>${t}</b><small>${sub}</small></div><i>›</i></button>`;
      html = head(T('Informations et assistance'), 'ℹ️') + `<div class="info-hero"><div class="brand-big">Jikel<em>Tech</em></div><p>${T('Innover • Apprendre • Partager')}</p></div>
        <div class="rowlist">${row('about', '📖', 'À propos', T('Notre vision et notre mission'))}${row('contact', '✉️', 'Contact', T('Écris-nous'))}${row('privacy', '🔒', 'Confidentialité', T('Tes données, nos engagements'))}${row('terms', '📜', 'Conditions', T('Règles d\'utilisation du site'))}</div>
        <div class="encour"><span>💚</span><div><b>JikelTech</b><small>${T('Merci d\'être avec nous !')} ❤️</small></div></div>`;
    }
    el.innerHTML = html;
    if (meView === 'rank') R.board($('#rkBoard'), meTab);
    // Le bouton newsletter de ce nouvel écran est rattaché au même comportement que les autres.
    $$('[data-sub-btn]', $('#view-me')).forEach((b) => b.addEventListener('click', () => $('#popupCta')?.click()));
    I18N.apply($('#view-me'));
  }

  document.addEventListener('jt:rank-change', () => renderMe());
  $('#view-me').addEventListener('change', (e) => {
    if (e.target.id !== 'photoInput') return;
    const f = e.target.files && e.target.files[0];
    if (!f || !/^image\//.test(f.type)) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
      const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
      c.getContext('2d').drawImage(img, sx, sy, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url);
      let q = 0.82, d = c.toDataURL('image/jpeg', q);
      while (d.length > 50000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
      setProfile({ photo: d }); renderMe(); toast(T('Photo enregistrée ✔'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast(T('Image non lisible.')); };
    img.src = url;
  });
  const meMsg = (t, err) => { const m = $('#meMsg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };

  $('#view-me').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id !== 'meNameForm') return;
    const v = $('#meName').value.trim().replace(/\s+/g, ' ');
    setProfile({ name: v });
    renderMe();
    toast(v ? T('Prénom enregistré') : T('Prénom effacé'));
  });

  $('#view-me').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-color]');
    if (c) { setProfile({ color: c.dataset.color }); renderMe(); return; }
    const vw = e.target.closest('[data-view]');
    if (vw) { meView = vw.dataset.view; meTab = 0; renderMe(); scrollTo(0, 0); return; }
    const mt = e.target.closest('[data-metab]');
    if (mt) { meTab = +mt.dataset.metab; renderMe(); return; }
    const ts = e.target.closest('[data-theme-set]');
    if (ts) { const isLight = document.documentElement.getAttribute('data-theme') === 'light'; if ((ts.dataset.themeSet === 'light') !== isLight) $('#themeToggle').click(); renderMe(); return; }
    const lb = e.target.closest('[data-lang]');
    if (lb) { I18N.set(lb.dataset.lang); return; }
    const b = e.target.closest('[data-me]');
    if (!b) return;
    const act = b.dataset.me;
    if (act === 'back') { meView = 'hub'; meTab = 0; renderMe(); scrollTo(0, 0); }
    else if (act === 'editname') { $('.hero-name').hidden = true; const fm = $('#meNameForm'); fm.hidden = false; $('#meName').focus(); $('#meName').select(); }
    else if (act === 'theme') { $('#themeToggle').click(); renderMe(); }
    else if (act === 'push') {
      const pb = $('#pushBtn');
      if (pb && !pb.hidden) pb.click(); else toast(T('Les notifications ne sont pas disponibles sur ce navigateur.'));
    }
    else if (act === 'photo-del') { setProfile({ photo: '' }); renderMe(); toast(T('Photo retirée')); }
    else if (act === 'about') $('#footerAbout').click();
    else if (act === 'contact') $('#footerContact').click();
    else if (act === 'privacy') $('#footerPrivacy').click();
    else if (act === 'terms') $('#footerTerms').click();
    else if (act === 'export') {
      const ta = $('#meCode');
      ta.hidden = false; ta.readOnly = true; ta.value = exportCode();
      $('#meCodeBar').hidden = false; $('[data-me="copy"]').hidden = false; $('[data-me="apply"]').hidden = true;
      ta.select();
      meMsg(T('Copie ce code et garde-le (note, message à toi-même).'));
    }
    else if (act === 'import') {
      const ta = $('#meCode');
      ta.hidden = false; ta.readOnly = false; ta.value = ''; ta.placeholder = T('Colle ici ton code JT1.…');
      $('#meCodeBar').hidden = false; $('[data-me="copy"]').hidden = true; $('[data-me="apply"]').hidden = false;
      ta.focus();
      meMsg(T('Attention : cela remplace la progression de ce téléphone.'));
    }
    else if (act === 'copy') {
      try { await navigator.clipboard.writeText($('#meCode').value); meMsg(T('Code copié ✔')); } catch { $('#meCode').select(); meMsg(T('Sélectionne le code et copie-le.')); }
    }
    else if (act === 'apply') {
      try { importCode($('#meCode').value); renderMe(); toast(T('Progression restaurée ✔')); }
      catch { meMsg(T('Ce code n\'est pas valide. Vérifie que tu as tout copié.'), true); }
    }
    else if (act === 'reset') {
      if (confirm(T('Effacer ton profil et toute ta progression sur ce téléphone ? Cette action est définitive.'))) {
        ['jt_profile', 'jt_progress', 'jt_name_skip'].forEach((k) => store.del(k));
        renderMe();
        toast(T('Progression effacée'));
      }
    }
  });

  /* ---------- Démarrage ---------- */
  setTab(current, { noHash: true, keepScroll: true });
})();
