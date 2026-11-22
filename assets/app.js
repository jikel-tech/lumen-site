/* LUMen — application front (aucune dépendance) */
(() => {
  'use strict';

  const C = window.LUMEN || {};
  const SITE = (C.SITE_URL || location.origin).replace(/\/$/, '');
  const CATS = {
    smartphones: T('Smartphones'),
    ia: T('Intelligence artificielle'),
    logiciels: T('Logiciels'),
    culture: T('Culture numérique'),
    afrique: T('Tech Afrique'),
  };
  const CAT_DESC = {
    smartphones: T('Téléphones, tablettes, montres et accessoires.'),
    ia: T('Modèles, outils et usages de l’intelligence artificielle.'),
    logiciels: T('Applications, systèmes, cybersécurité et développement.'),
    culture: T('Jeux, réseaux sociaux, streaming et société numérique.'),
    afrique: T('L’actualité tech du Cameroun et du continent africain.'),
  };
  const WSUBS = { tech: T('Tech'), educ: T('Éducation'), finance: T('Finance'), actus: T('Actus'), sport: T('Sport'), emploi: T('Emploi'), sante: T('Santé'), culture: T('Culture') };
  const SECTION_ORDER = ['afrique', 'ia', 'smartphones', 'logiciels', 'culture'];
  const PAGE = 12;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- Utilitaires ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : '#'; } catch { return '#'; } };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const snip = (s, n) => { s = String(s || '').trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 25)).trimEnd() + '…'; };
  const firstSentence = (s) => (String(s || '').match(/^.*?[.!?](\s|$)/) || [s || ''])[0].trim();
  const catLabel = (c) => CATS[c] || (c === 'favoris' ? T('Favoris') : c === 'wanda' ? 'Wanda Info' : T('Tech'));
  const validCat = (c) => c === 'all' || c === 'favoris' || c === 'wanda' || !!CATS[c];
  const catKey = (c) => (CATS[c] ? c : 'default');
  const href = (a) => '#a=' + encodeURIComponent(a.id);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée : on ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
  };

  /* ---------- Favoris et "Pour toi" (stockés uniquement sur cet appareil) ---------- */
  const readJsonStore = (k, d) => { try { const v = JSON.parse(store.get(k)); return v ?? d; } catch { return d; } };
  const getFavs = () => { const f = readJsonStore('lumen_favs', []); return Array.isArray(f) ? f.filter((a) => a && a.id && a.title && a.url) : []; };
  const isFav = (id) => getFavs().some((a) => a.id === id);
  function toggleFav(a) {
    let favs = getFavs();
    const was = favs.some((x) => x.id === a.id);
    if (was) favs = favs.filter((x) => x.id !== a.id);
    else {
      const { id, title, source, category, sub, url, pubDate, summary, keywords, image, imageBy, coverage, also } = a;
      favs = [{ id, title, source, category, sub, url, pubDate, summary, keywords, image, imageBy, coverage, also }, ...favs].slice(0, 60);
      bumpPref(a, 2);
    }
    store.set('lumen_favs', JSON.stringify(favs));
    track(was ? 'favorite_remove' : 'favorite_add', { article_id: a.id, category: a.category });
    return !was;
  }
  const getPrefs = () => { const p = readJsonStore('lumen_prefs', {}); return p && typeof p === 'object' ? p : {}; };
  function bumpPref(a, n = 1) {
    if (!CATS[a.category]) return;
    const p = getPrefs();
    p[a.category] = (p[a.category] || 0) + n;
    store.set('lumen_prefs', JSON.stringify(p));
  }
  const getRead = () => { const r = readJsonStore('lumen_read', []); return Array.isArray(r) ? r : []; };
  function markRead(a) {
    const r = getRead();
    if (r.includes(a.id)) return;
    store.set('lumen_read', JSON.stringify([a.id, ...r].slice(0, 200)));
    bumpPref(a, 1);
  }

  function timeAgo(iso) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(m)) return '';
    if (m < 1) return T('à l’instant');
    if (m < 60) return T('il y a {n} min', { n: m });
    if (m < 1440) return T('il y a {n} h', { n: Math.floor(m / 60) });
    return T('il y a {n} j', { n: Math.floor(m / 1440) });
  }

  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch { /* ignore */ } }

  /* ---------- Thème ---------- */
  const root = document.documentElement;
  const themeBtn = $('#themeToggle');
  function setTheme(t, save) {
    root.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'light' ? '☀' : '☾';
    $('meta[name="theme-color"]').setAttribute('content', t === 'light' ? '#F3F1EA' : '#0B0F0D');
    if (save) store.set('lumen_theme', t);
  }
  setTheme(store.get('lumen_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'), false);
  themeBtn.addEventListener('click', () => setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true));

  /* ---------- Données ---------- */
  let ARTICLES = [];
  let WANDA = [];
  let WEEKLY = null;
  let META = null;
  const view = { cat: 'all', q: '', sub: 'all' };
  let latestShown = PAGE;

  async function loadJson(url, fallback) {
    for (const u of [url, fallback]) {
      if (!u) continue;
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch { /* on essaie la source suivante */ }
    }
    return null;
  }

  const cleanArticles = (data) =>
    (Array.isArray(data) ? data : [])
      .filter((a) => a && typeof a.id === 'string' && typeof a.title === 'string' && typeof a.url === 'string')
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Tout le site mélangé : actus tech + actus du Cameroun (Wanda Info), de la plus récente à la plus ancienne.
  const allMixed = () => [...ARTICLES, ...WANDA].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const byId = (id) => ARTICLES.find((a) => a.id === id) || WANDA.find((a) => a.id === id) || getFavs().find((a) => a.id === id);

  function score(a) {
    const ageH = (Date.now() - new Date(a.pubDate).getTime()) / 3600000;
    return (a.coverage || 1) * 2 + Math.max(0, 1 - ageH / 48) * 3 + (a.aiDone ? 0.3 : 0);
  }

  /* ---------- Gabarits ---------- */
  const photoOk = (u) => typeof u === 'string' && (u.startsWith('https://images.pexels.com/') || u.startsWith('https://images.unsplash.com/')) && !/['"()\s]/.test(u);
  const favBtn = (a) => { const on = isFav(a.id); return `<span class="fav-btn${on ? ' on' : ''}" role="button" tabindex="0" data-fav="${esc(a.id)}" aria-pressed="${on}" aria-label="${on ? T('Retirer des favoris') : T('Enregistrer en favori')}">${on ? '★' : '☆'}</span>`; };
  const thumb = (a) => photoOk(a.image)
    ? `<span class="thumb cat-${catKey(a.category)} has-photo" style="background-image:url('${a.image}'),url('assets/categories/${catKey(a.category)}.svg')" role="img" aria-label="${esc(catLabel(a.category))}"${a.imageBy ? ` title="${esc(T('Photo d’illustration : {x} / {s}', { x: a.imageBy, s: /unsplash/.test(a.image || '') ? 'Unsplash' : 'Pexels' }))}"` : ''}>${favBtn(a)}</span>`
    : `<span class="thumb cat-${catKey(a.category)}" role="img" aria-label="${esc(catLabel(a.category))}">${favBtn(a)}</span>`;
  const kickerText = (a) => (a.category === 'wanda' && WSUBS[a.sub] ? 'Wanda · ' + WSUBS[a.sub] : catLabel(a.category));
  const kicker = (a) => `<span class="kicker${a.category === 'afrique' || a.category === 'wanda' ? ' k-afrique' : ''}">${esc(kickerText(a))}</span>`;
  const cov = (a) => ((a.coverage || 1) > 1 ? `<span class="badge-cov" title="Sujet couvert par plusieurs sources">${a.coverage} sources</span>` : '');
  const metaLine = (a) => `<div class="meta-line"><span>${esc(a.source)}</span><span>${esc(timeAgo(a.pubDate))}</span>${cov(a)}</div>`;

  const heroMain = (a) => `<div class="hero-main"><a class="card-btn" href="${href(a)}">${thumb(a)}${kicker(a)}<h2>${esc(a.title)}</h2>${a.summary ? `<p>${esc(snip(a.summary, 240))}</p>` : ''}${metaLine(a)}</a></div>`;
  const heroSide = (a) => `<a class="card-btn" href="${href(a)}">${thumb(a)}${kicker(a)}<h3>${esc(a.title)}</h3>${metaLine(a)}</a>`;
  const catCard = (a) => `<article class="cat-card"><a class="card-btn" href="${href(a)}">${thumb(a)}<div class="cc-body">${kicker(a)}<h3>${esc(a.title)}</h3>${a.summary ? `<p>${esc(snip(a.summary, 130))}</p>` : ''}${metaLine(a)}</div></a></article>`;
  const latestItem = (a) => `<article class="latest-item"><a class="card-btn" href="${href(a)}"><time datetime="${esc(a.pubDate)}">${esc(timeAgo(a.pubDate))}</time><div>${kicker(a)}<h3>${esc(a.title)}</h3><div class="meta-line"><span>${esc(a.source)}</span>${cov(a)}</div></div></a></article>`;

  /* ---------- Rendu ---------- */
  function filtered() {
    let list = view.cat === 'favoris' ? getFavs() : view.cat === 'wanda' ? WANDA : view.cat === 'all' ? allMixed() : ARTICLES;
    if (view.cat === 'wanda' && view.sub !== 'all') list = list.filter((a) => a.sub === view.sub);
    if (view.cat !== 'all' && view.cat !== 'favoris' && view.cat !== 'wanda') list = list.filter((a) => a.category === view.cat);
    const q = norm(view.q).trim();
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter((a) => {
        const hay = norm([a.title, a.source, kickerText(a), a.summary, (a.keywords || []).join(' ')].join(' '));
        return words.every((w) => hay.includes(w));
      });
    }
    return list;
  }

  function render() {
    const isHome = view.cat === 'all' && !view.q.trim();
    $('#homeView').hidden = !isHome;
    $('#listView').hidden = isHome;
    updateFavCount();
    $$('.cat-btn').forEach((b) => {
      const on = b.dataset.cat === view.cat;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.title = view.cat === 'all' ? T('LUMen — L’actualité tech, résumée et sourcée') : `${catLabel(view.cat)} — LUMen`;
    if (view.cat !== 'wanda') view.sub = 'all';
    if (isHome) renderHome(); else renderList();
    renderRefreshNote();
  }

  function renderHome() {
    renderTicker();
    const hero = $('#hero');
    if (!ARTICLES.length) {
      hero.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' + T('Les actus arrivent : la première collecte automatique a lieu dans les 30 prochaines minutes.') + '</div>';
      $('#catSections').innerHTML = '';
      $('#latestList').innerHTML = '';
      $('#moreBtn').hidden = true;
      $('#trending').innerHTML = '';
      renderWeekly();
      return;
    }

    // À la une : l'article le plus "chaud" (sources multiples + fraîcheur), puis 2 autres de rubriques différentes
    const ranked = [...ARTICLES].sort((a, b) => score(b) - score(a));
    const main = ranked[0];
    const side = [];
    for (const a of ranked.slice(1)) {
      if (side.length < 2 && a.category !== main.category && !side.some((s) => s.category === a.category)) side.push(a);
    }
    for (const a of ranked.slice(1)) if (side.length < 2 && !side.includes(a)) side.push(a);
    const heroIds = new Set([main, ...side].map((a) => a.id));
    hero.innerHTML = heroMain(main) + `<div class="hero-side">${side.map(heroSide).join('')}</div>`;
    renderForYou(heroIds);

    // Section Wanda Info (actus du Cameroun) juste après « À la une »
    const wandaItems = WANDA.slice(0, 3);
    const wandaBlock = wandaItems.length
      ? `<section class="block" aria-labelledby="sec-wanda"><h2 class="block-title" id="sec-wanda">🇨🇲 Wanda Info<button type="button" class="see-all" data-cat="wanda">${T('Voir tout →')}</button></h2><div class="cat-grid">${wandaItems.map(catCard).join('')}</div></section>`
      : '';

    // Sections par rubrique
    $('#catSections').innerHTML = wandaBlock + SECTION_ORDER.map((cat) => {
      const items = ARTICLES.filter((a) => a.category === cat && !heroIds.has(a.id)).slice(0, 3);
      if (!items.length) return '';
      return `<section class="block" aria-labelledby="sec-${cat}"><h2 class="block-title" id="sec-${cat}">${esc(catLabel(cat))}<button type="button" class="see-all" data-cat="${cat}">${T('Voir tout →')}</button></h2><div class="cat-grid">${items.map(catCard).join('')}</div></section>`;
    }).join('');

    // Dernières actus
    const wandaShown = new Set(wandaItems.map((a) => a.id));
    const rest = allMixed().filter((a) => !heroIds.has(a.id) && !wandaShown.has(a.id));
    $('#latestList').innerHTML = rest.slice(0, latestShown).map(latestItem).join('');
    $('#moreBtn').hidden = rest.length <= latestShown;

    // Tendances
    $('#trending').innerHTML = [...ranked, ...WANDA].sort((a, b) => score(b) - score(a)).slice(0, 6).map((a) => `<li><a class="card-btn" href="${href(a)}"><h3>${esc(a.title)}</h3></a></li>`).join('');
    renderWeekly();
  }

  // « Pour toi » : apparaît après quelques lectures, d'après les rubriques les plus lues sur CET appareil.
  function renderForYou(heroIds) {
    const box = $('#forYou');
    if (!box) return;
    const prefs = getPrefs();
    const total = Object.values(prefs).reduce((n, v) => n + (+v || 0), 0);
    if (total < 3) { box.innerHTML = ''; return; }
    const top = Object.entries(prefs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
    const read = new Set(getRead());
    const items = ARTICLES.filter((a) => top.includes(a.category) && !heroIds.has(a.id) && !read.has(a.id)).sort((a, b) => score(b) - score(a)).slice(0, 3);
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<section class="block" aria-labelledby="sec-foryou"><h2 class="block-title" id="sec-foryou">${T('Pour toi')}<button type="button" class="see-all" id="forYouReset">${T('Effacer mes préférences')}</button></h2><p class="for-you-note">${T('Selon ce que tu lis sur cet appareil : {x}.', { x: top.map((c) => esc(catLabel(c))).join(T(' et ')) })}</p><div class="cat-grid">${items.map(catCard).join('')}</div></section>`;
  }

  function renderSubNav() {
    const box = $('#subNav');
    if (!box) return;
    if (view.cat !== 'wanda') { box.hidden = true; box.innerHTML = ''; return; }
    const counts = {};
    WANDA.forEach((a) => { counts[a.sub] = (counts[a.sub] || 0) + 1; });
    const subs = Object.keys(WSUBS).filter((k) => counts[k]);
    if (view.sub !== 'all' && !counts[view.sub]) view.sub = 'all';
    box.innerHTML = [['all', T('Tout'), WANDA.length], ...subs.map((k) => [k, WSUBS[k], counts[k]])]
      .map(([k, label, n]) => `<button type="button" class="sub-btn${view.sub === k ? ' active' : ''}" data-sub="${k}">${esc(label)} <span>${n}</span></button>`).join('');
    box.hidden = WANDA.length === 0;
  }

  function renderList() {
    const list = filtered();
    const q = view.q.trim();
    const isW = view.cat === 'wanda';
    $('#listTitle').textContent = q ? T('Résultats pour « {q} »', { q }) : isW && view.sub !== 'all' ? `Wanda Info · ${WSUBS[view.sub]}` : catLabel(view.cat);
    renderSubNav();
    $('#listSub').textContent = q
      ? T(list.length > 1 ? '{n} actus trouvées' : '{n} actu trouvée', { n: list.length }) + (view.cat !== 'all' ? T(' dans {c}', { c: catLabel(view.cat) }) : '') + '.'
      : view.cat === 'favoris'
        ? T('Les actus que vous avez enregistrées, gardées sur cet appareil.') + ` ${T(list.length > 1 ? '{n} actus' : '{n} actu', { n: list.length })}.`
        : isW
          ? T('Wanda ! L’actualité du Cameroun par rubrique. Chaque titre renvoie vers le média d’origine.') + ` ${T(list.length > 1 ? '{n} actus' : '{n} actu', { n: list.length })}.`
          : `${CAT_DESC[view.cat] || ''} ${T(list.length > 1 ? '{n} actus' : '{n} actu', { n: list.length })}.`;
    const empty = view.cat === 'favoris' && !q ? T('Aucun favori pour l’instant : touchez ☆ sur une actu pour la garder ici.')
      : isW && !q ? T('Les actus du Cameroun arrivent très bientôt.') : T('Aucune actu ne correspond à votre recherche.');
    $('#listGrid').innerHTML = list.length ? list.map(catCard).join('') : `<div class="empty-state">${empty}</div>`;
  }

  function renderTicker() {
    const items = allMixed().slice(0, 8);
    const box = $('#ticker');
    if (!items.length) { box.hidden = true; return; }
    const one = items.map((a) => `<a class="ticker-item" href="${href(a)}"><b>${esc(kickerText(a))}</b>${esc(a.title)}</a>`).join('');
    const two = items.map((a) => `<a class="ticker-item" href="${href(a)}" tabindex="-1" aria-hidden="true"><b>${esc(kickerText(a))}</b>${esc(a.title)}</a>`).join('');
    const chars = items.reduce((n, a) => n + a.title.length + 14, 0);
    $('#tickerTrack').style.setProperty('--ticker-dur', Math.max(40, Math.round(chars * 0.22)) + 's');
    $('#tickerTrack').innerHTML = one + two;
    box.hidden = false;
  }

  function renderWeekly() {
    const box = $('#weeklyBox');
    if (!WEEKLY || !WEEKLY.title) { box.hidden = true; return; }
    const link = WEEKLY.path ? safeUrl(new URL(WEEKLY.path, location.href).href) : '';
    box.innerHTML = `<span class="kicker">${T('Analyse de la semaine')}</span><h2 id="weeklyTitle">${esc(WEEKLY.title)}</h2><p>${esc(snip(WEEKLY.intro || '', 220))}</p>${link ? `<a class="btn-solid" href="${esc(link)}">${T('Lire l’analyse')}</a>` : ''}<p class="ai-note">${T('Analyse LUMen rédigée avec l’aide de l’IA à partir des actus de la semaine.')}</p>`;
    box.hidden = false;
  }

  function updateFavCount() {
    const n = getFavs().length;
    const el = $('#favCount');
    if (el) el.textContent = n ? ` (${n})` : '';
  }

  function renderRefreshNote() {
    const iso = META?.updatedAt || ARTICLES[0]?.pubDate;
    $('#refreshNote').textContent = iso ? T('Mis à jour {t} · actualisation automatique', { t: timeAgo(iso) }) : T('Actualisation automatique');
  }

  /* ---------- Navigation (hash) ---------- */
  const baseUrl = () => location.pathname + location.search + (view.cat !== 'all' ? '#c=' + view.cat : '');

  function setCategory(cat, push = true) {
    view.cat = validCat(cat) ? cat : 'all';
    latestShown = PAGE;
    if (push) history.pushState(null, '', baseUrl());
    render();
    if (push && scrollY > 240) scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const aid = p.get('a');
    const cat = p.get('c');
    if (!aid) {
      const target = cat && validCat(cat) ? cat : 'all';
      if (target !== view.cat) { view.cat = target; render(); }
      closeModal(false);
      return;
    }
    const a = byId(aid);
    if (a) openModal(a); else closeModal(false);
  }

  /* ---------- Modales ---------- */
  let lastFocus = null;
  const articleOverlay = $('#modalOverlay');

  function lockScroll() { document.body.classList.toggle('lock', !!$('.modal-overlay.open')); }

  function showOverlay(ov, focusSel) {
    lastFocus = document.activeElement;
    ov.classList.add('open');
    lockScroll();
    setTimeout(() => (focusSel ? $(focusSel, ov) : $('.modal-close', ov))?.focus(), 30);
  }

  function hideOverlay(ov) {
    ov.classList.remove('open');
    lockScroll();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function openModal(a) {
    $('#modalMeta').textContent = `${kickerText(a)} · ${a.source} · ${timeAgo(a.pubDate)}`;
    $('#modalTitle').textContent = a.title;
    const sl = $('#modalSummary').previousElementSibling;
    if (sl && I18N.lang === 'en') sl.textContent = a.enOk ? 'Summary' : 'Summary (in French)';
    $('#modalSummary').textContent = a.summary || T('Pas de résumé disponible pour cet article. Lisez la source pour le détail.');
    $('#modalKeywords').innerHTML = (a.keywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join('');
    const also = $('#modalAlso');
    if (a.also?.length) {
      also.innerHTML = T('Aussi couvert par : ') + a.also.map((x) => `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.source)}</a>`).join(', ');
      also.hidden = false;
    } else also.hidden = true;
    $('#modalSourceBtn').href = safeUrl(a.url);
    $('#modalSourceBtn').textContent = T('Lire sur {s} →', { s: a.source });
    articleOverlay.dataset.id = a.id;
    markRead(a);
    syncModalFav(a.id);
    if (!articleOverlay.classList.contains('open')) showOverlay(articleOverlay);
    track('article_open', { article_id: a.id, category: a.category, source: a.source });
  }

  function syncModalFav(id) {
    const b = $('#modalFav');
    if (!b) return;
    const on = isFav(id);
    b.textContent = on ? T('★ Enregistré') : T('☆ Enregistrer');
    b.setAttribute('aria-pressed', String(on));
  }

  function closeModal(updateUrl = true) {
    if (!articleOverlay.classList.contains('open')) return;
    hideOverlay(articleOverlay);
    if (updateUrl && location.hash.startsWith('#a=')) history.replaceState(null, '', baseUrl());
  }

  function closeOverlay(ov) { ov === articleOverlay ? closeModal(true) : hideOverlay(ov); }

  $$('.modal-overlay').forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) closeOverlay(ov); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = $$('.modal-overlay.open').pop();
    if (open) closeOverlay(open);
  });

  [['footerAbout', 'aboutModal'], ['footerContact', 'contactModal'], ['footerPrivacy', 'privacyModal']].forEach(([t, m]) => {
    $('#' + t).addEventListener('click', (e) => { e.preventDefault(); showOverlay($('#' + m)); });
  });

  /* ---------- Wanda Info : rubriques ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.sub-btn');
    if (!b) return;
    view.sub = b.dataset.sub || 'all';
    renderList();
    track('wanda_sub', { sub: view.sub });
  });

  /* ---------- Favoris : boutons ★ ---------- */
  function onFavToggle(id) {
    const a = byId(id);
    if (!a) return;
    toggleFav(a);
    $$('[data-fav]').forEach((el) => {
      if (el.dataset.fav !== id) return;
      const on = isFav(id);
      el.classList.toggle('on', on);
      el.textContent = on ? '★' : '☆';
      el.setAttribute('aria-pressed', String(on));
      el.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Enregistrer en favori');
    });
    syncModalFav(id);
    updateFavCount();
    if (view.cat === 'favoris') renderList();
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]');
    if (f) { e.preventDefault(); e.stopPropagation(); onFavToggle(f.dataset.fav); return; }
    if (e.target.closest('#forYouReset')) { store.del('lumen_prefs'); store.del('lumen_read'); render(); }
  }, true);
  document.addEventListener('keydown', (e) => {
    const f = e.target.closest?.('[data-fav]');
    if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onFavToggle(f.dataset.fav); }
  }, true);
  $('#modalFav')?.addEventListener('click', () => { const id = articleOverlay.dataset.id; if (id) onFavToggle(id); });

  /* ---------- Partage ---------- */
  const shareUrl = (id) => `${SITE}/#a=${encodeURIComponent(id)}`;

  async function copyText(txt, btn, doneLabel) {
    try { await navigator.clipboard.writeText(txt); } catch { return; }
    const old = btn.textContent;
    btn.textContent = doneLabel;
    setTimeout(() => (btn.textContent = old), 2000);
  }

  $('#modalShare').addEventListener('click', async function () {
    const a = byId(articleOverlay.dataset.id);
    if (!a) return;
    const url = shareUrl(a.id);
    track('share', { method: navigator.share ? 'native' : 'copy', article_id: a.id });
    if (navigator.share) {
      try { await navigator.share({ title: a.title, text: firstSentence(a.summary) || a.title, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    copyText(url, this, T('Lien copié !'));
  });
  $('#copyLinkBtn').addEventListener('click', function () { copyText(SITE, this, T('Lien copié !')); });

  /* ---------- Newsletter ---------- */
  const isSub = () => store.get('lumen_sub') === '1';
  let nlMode = 'subscribe';
  let nlOpenedAt = 0;

  function updateSubButtons() {
    const sub = isSub();
    $$('[data-sub-btn]').forEach((b) => {
      b.textContent = sub ? T('Se désabonner') : T('S’abonner');
      b.classList.toggle('is-subscribed', sub);
    });
  }

  function setNlStatus(msg, kind) {
    const s = $('#nlStatus');
    s.textContent = msg || '';
    s.className = 'nl-status' + (kind ? ' ' + kind : '');
  }

  function openNl() {
    nlMode = isSub() ? 'unsubscribe' : 'subscribe';
    nlOpenedAt = Date.now();
    $('#nlModalTitle').textContent = nlMode === 'subscribe' ? T('3 actus tech par jour') : T('Se désabonner de la newsletter');
    $('#nlModalText').textContent = nlMode === 'subscribe'
      ? T('Une sélection courte chaque matin, directement dans ta boîte mail. Zéro spam.')
      : T('Entre l’adresse email avec laquelle tu t’es inscrit(e) pour ne plus recevoir la newsletter.');
    $('#nlSubmit').textContent = nlMode === 'subscribe' ? T('Je m’abonne') : T('Me désabonner');
    $('#nlForm').hidden = false;
    $('#nlForm').reset();
    $('#nlSubmit').disabled = false;
    $('#nlFallback').hidden = true;
    $('#nlFallback').innerHTML = '';
    setNlStatus('');
    showOverlay($('#nlModal'), '#nlEmail');
  }
  $$('[data-sub-btn]').forEach((b) => b.addEventListener('click', () => { $('#popup').classList.remove('visible'); openNl(); }));

  function nlFallback(mode) {
    const box = $('#nlFallback');
    box.hidden = false;
    if (mode === 'subscribe') {
      setNlStatus(T('Le formulaire d’inscription sécurisé s’ouvre dans un nouvel onglet. Termine l’inscription là-bas, puis reviens ici.'), '');
      window.open(C.BREVO_FORM_URL, '_blank', 'noopener');
      box.innerHTML = '<button type="button" class="btn-ghost" id="nlDone">' + T('J’ai terminé mon inscription') + '</button>';
      $('#nlDone').addEventListener('click', () => { store.set('lumen_sub', '1'); updateSubButtons(); hideOverlay($('#nlModal')); });
    } else {
      setNlStatus(T('Pour te désabonner, clique sur le lien « Se désabonner » en bas de n’importe quel email LUMen.'), '');
      box.innerHTML = '<button type="button" class="btn-ghost" id="nlDone">' + T('C’est fait') + '</button>';
      $('#nlDone').addEventListener('click', () => { store.del('lumen_sub'); updateSubButtons(); hideOverlay($('#nlModal')); });
    }
  }

  $('#nlForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#nlEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setNlStatus('Cette adresse email ne semble pas valide.', 'err'); return; }
    const btn = $('#nlSubmit');
    btn.disabled = true;
    setNlStatus(T('Un instant…'));
    try {
      const res = await fetch(C.NEWSLETTER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nlMode, email, website: $('#nlHp').value, elapsed: Date.now() - nlOpenedAt }),
      });
      if (res.status === 501 || res.status === 404 || res.status === 405) { nlFallback(nlMode); btn.disabled = false; return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNlStatus(data.error || T('Une erreur est survenue, réessaie dans un instant.'), 'err'); btn.disabled = false; return; }
      if (nlMode === 'subscribe' && data.pending) {
        setNlStatus('Presque fini ! Clique sur le lien de confirmation que tu viens de recevoir par email.', 'ok');
        track('newsletter_pending');
        return;
      }
      if (nlMode === 'subscribe') {
        store.set('lumen_sub', '1');
        setNlStatus(T('Merci ! Tu es inscrit(e) : les prochaines actus arrivent dans ta boîte mail.'), 'ok');
        track('newsletter_subscribe');
      } else {
        store.del('lumen_sub');
        setNlStatus(T('C’est fait : tu ne recevras plus la newsletter.'), 'ok');
        track('newsletter_unsubscribe');
      }
      updateSubButtons();
      setTimeout(() => hideOverlay($('#nlModal')), 2200);
    } catch {
      nlFallback(nlMode);
      btn.disabled = false;
    }
  });

  /* ---------- Popup newsletter (15 s, sauf si abonné ou fermé récemment) ---------- */
  const popup = $('#popup');
  setTimeout(() => {
    const dismissed = Number(store.get('lumen_popup_dismissed') || 0);
    if (isSub() || Date.now() - dismissed < 7 * 86400000 || $('.modal-overlay.open')) return;
    popup.classList.add('visible');
  }, 15000);
  $('#popupClose').addEventListener('click', () => { popup.classList.remove('visible'); store.set('lumen_popup_dismissed', String(Date.now())); });

  /* ---------- Notifications push (OneSignal, chargé seulement au clic) ---------- */
  const pushBtn = $('#pushBtn');
  if (C.ONESIGNAL_APP_ID) {
    pushBtn.hidden = false;
    let osPromise = null;
    const loadOS = () => (osPromise ||= new Promise((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({ appId: C.ONESIGNAL_APP_ID, serviceWorkerPath: 'sw.js', serviceWorkerParam: { scope: '/' }, allowLocalhostAsSecureOrigin: true });
          resolve(OneSignal);
        } catch (e) { reject(e); }
      });
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer = true;
      s.onerror = reject;
      document.head.appendChild(s);
    }));
    pushBtn.addEventListener('click', async () => {
      try {
        const OS = await loadOS();
        await OS.Notifications.requestPermission();
        pushBtn.title = T('Notifications activées');
        track('push_prompt');
      } catch { pushBtn.title = T('Notifications indisponibles sur ce navigateur'); }
    });
  }

  /* ---------- Google Analytics 4 (seulement si un vrai ID est configuré et « Ne pas suivre » absent) ---------- */
  (function initGA() {
    const id = C.GA_ID || '';
    if (!/^G-[A-Z0-9]{6,}$/.test(id) || /^G-X+$/.test(id)) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
  })();

  /* ---------- Événements généraux ---------- */
  $('#catNav').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { $('#searchInput').value = ''; view.q = ''; setCategory(b.dataset.cat); } });
  $('#main').addEventListener('click', (e) => { const b = e.target.closest('.see-all[data-cat]'); if (b) setCategory(b.dataset.cat); });
  $('#moreBtn').addEventListener('click', () => { latestShown += PAGE; renderHome(); });
  $('#logoLink').addEventListener('click', (e) => { e.preventDefault(); $('#searchInput').value = ''; view.q = ''; setCategory('all'); scrollTo({ top: 0, behavior: 'smooth' }); });

  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      view.q = e.target.value;
      // La recherche est globale : elle sort de la rubrique en cours.
      if (view.q.trim() && view.cat !== 'all') { view.cat = 'all'; history.replaceState(null, '', baseUrl()); }
      render();
    }, 120);
  });

  // Mobile : la loupe ouvre la barre de recherche sous l'en-tête.
  $('#searchToggle')?.addEventListener('click', () => {
    const header = $('.site-header');
    const open = header.classList.toggle('search-open');
    $('#searchToggle').setAttribute('aria-expanded', String(open));
    if (open) $('#searchInput').focus();
    else if ($('#searchInput').value) { $('#searchInput').value = ''; view.q = ''; render(); }
  });

  addEventListener('hashchange', applyHash);

  /* ---------- Passerelle vers le nouveau cadre (accueil, barre du bas : shell.js) ---------- */
  window.LUMEN_APP = {
    get articles() { return ARTICLES; },
    get wanda() { return WANDA; },
    baseUrl,
    timeAgo, catLabel, catKey, score, track, validCat,
    // Lance une recherche globale dans la vue Actualités.
    search(q) {
      const text = String(q || '').trim();
      $('#searchInput').value = text;
      view.q = text; view.cat = 'all'; view.sub = 'all'; latestShown = PAGE;
      $('.site-header').classList.toggle('search-open', !!text);
      history.replaceState(null, '', baseUrl());
      render();
    },
    // Affiche une rubrique (all, wanda, favoris, ia…) dans la vue Actualités.
    openCategory(cat) {
      $('#searchInput').value = ''; view.q = '';
      $('.site-header').classList.remove('search-open');
      setCategory(cat, false);
      history.replaceState(null, '', baseUrl());
    },
  };

  /* ---------- Démarrage ---------- */
  $('#todayDate').textContent = new Date().toLocaleDateString(I18N.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  updateSubButtons();

  async function refresh(first) {
    const [arts, weekly, meta, wanda] = await Promise.all([
      loadJson(C.ARTICLES_URL, C.ARTICLES_FALLBACK_URL),
      loadJson(C.WEEKLY_URL, C.WEEKLY_FALLBACK_URL),
      loadJson(C.ARTICLES_URL && C.ARTICLES_URL.replace('articles.json', 'meta.json'), 'data/meta.json'),
      loadJson(C.ARTICLES_URL && C.ARTICLES_URL.replace('articles.json', 'wanda.json'), 'data/wanda.json'),
    ]);
    const wlist = cleanArticles(wanda).map((a) => ({ ...a, category: 'wanda' }));
    // Interface anglaise : titre et résumé en anglais quand le collecteur les a produits (sinon le français).
    const loc = (a) => (I18N.lang === 'en' && a.summaryEn ? { ...a, title: a.titleEn || a.title, summary: a.summaryEn, enOk: true } : a);
    const list = cleanArticles(arts).map(loc);
    const sig = (l) => JSON.stringify(l.map((a) => [a.id, a.aiDone ? 1 : 0, a.image || '', a.coverage || 1, a.enOk ? 1 : 0]));
    const changed = sig(list) !== sig(ARTICLES) || sig(wlist) !== sig(WANDA);
    WANDA = wlist;
    WEEKLY = weekly && weekly.title ? weekly : WEEKLY;
    META = meta || META;
    if (list.length || first) ARTICLES = list.length ? list : ARTICLES;
    document.dispatchEvent(new CustomEvent('lumen:data'));
    if (first || changed) {
      if (first) { const p = new URLSearchParams(location.hash.slice(1)); if (p.get('c') && validCat(p.get('c'))) view.cat = p.get('c'); }
      render();
      if (first) applyHash();
    } else renderRefreshNote();
  }

  let lastRefresh = Date.now();
  const softRefresh = (minGapMs) => {
    if (document.hidden || $('.modal-overlay.open') || Date.now() - lastRefresh < minGapMs) return;
    lastRefresh = Date.now();
    refresh(false).catch(() => {});
  };
  refresh(true);
  setInterval(() => softRefresh(0), 5 * 60 * 1000);
  // L'application installée reste en mémoire : on actualise dès qu'on y revient.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { softRefresh(60 * 1000); navigator.serviceWorker?.getRegistration().then((r) => r && r.update()).catch(() => {}); } });
  addEventListener('pageshow', (e) => { if (e.persisted) softRefresh(30 * 1000); });
  setInterval(renderRefreshNote, 60 * 1000);

  /* ---------- Service worker (PWA) ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // Nouvelle version de l'application disponible : on recharge une fois pour l'appliquer.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (!$('.modal-overlay.open')) location.reload();
    });
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
