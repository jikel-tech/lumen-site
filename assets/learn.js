/* JikelTech — Apprendre (cours, exercices-jeux, défi du jour, badges) et SOS Tech (guides de dépannage).
   Le contenu vit dans learn/*.json, lu sur GitHub : ajouter un chapitre ou un guide ne demande aucun déploiement. */
(() => {
  'use strict';
  const JT = window.JT;
  if (!JT) return;
  const { $, $$, esc, getProg, saveProg, logHist, touchStreak, level, toast, dayKey, track } = JT;
  const C = window.LUMEN || {};
  const BASES = [C.LEARN_URL || 'learn/', C.LEARN_FALLBACK_URL || 'learn/'];

  /* ---------- Chargement du contenu ---------- */
  const cache = {};
  async function loadJson(name) {
    if (cache[name]) return cache[name];
    const names = I18N.lang === 'en' ? [name.replace(/\.json$/, '.en.json'), name] : [name];
    for (const nm of names) {
      for (const base of BASES) {
        try {
          const r = await fetch(base + nm, { cache: 'no-cache' });
          if (!r.ok) continue;
          const d = await r.json();
          if (d) { cache[name] = d; return d; }
        } catch { /* on essaie la copie locale */ }
      }
    }
    return null;
  }

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");
  const shuffle = (a) => { const b = a.map((x, i) => [x, i]); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const dayNumber = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };

  /* ---------- Navigation interne (le bouton Retour du téléphone remonte d'un niveau) ---------- */
  function makeNav(getView, up) {
    const nav = { inside: false };
    nav.enter = () => { if (!nav.inside) { try { history.pushState({ jt: 1 }, '', location.href); } catch { /* ignore */ } nav.inside = true; } };
    nav.back = () => { // bouton « Retour » de l'écran
      const was = up();
      if (was === 'top' && nav.inside) { nav.inside = false; history.back(); }
    };
    nav.pop = () => { // bouton Retour du téléphone
      if (!nav.inside) return;
      const was = up();
      if (was === 'top') nav.inside = false;
      else { try { history.pushState({ jt: 1 }, '', location.href); } catch { /* ignore */ } }
    };
    nav.reset = () => { nav.inside = false; };
    return nav;
  }

  /* ======================================================================
     APPRENDRE
     ====================================================================== */
  const L = { view: 'domains', course: null, chapter: null, S: null };
  const learnEl = () => $('#view-learn');
  const stepsTotal = () => { const c = cache[L.course + '.json']; return c ? c.chapters.filter((x) => !x.soon).length : JT.TOTAL_STEPS; };
  const courseState = (g, cid) => g.courses[cid] || {};
  const chapterStatus = (course, g) => {
    const st = courseState(g, course.id);
    let foundCurrent = false;
    return course.chapters.map((c) => {
      if (c.soon) return 'soon';
      if (st[c.id]?.done) return 'done';
      if (!foundCurrent) { foundCurrent = true; return 'current'; }
      return 'locked';
    });
  };

  // Résumé pour l'accueil : le premier cours pas encore terminé (Python, puis Réseau), sinon le dernier.
  JT.courseSummary = () => {
    const g = getProg();
    const list = ['python', 'reseau', 'pylab', 'maintenance', 'cyber', 'linux', 'web'].map((id) => cache[id + '.json']).filter(Boolean);
    if (!list.length) return null;
    let pick = list[list.length - 1], i = -1, sts = [];
    for (const course of list) {
      const s = chapterStatus(course, g);
      if (s.indexOf('current') >= 0) { pick = course; sts = s; i = s.indexOf('current'); break; }
    }
    if (i < 0) sts = chapterStatus(pick, g);
    return { name: pick.title, total: pick.chapters.filter((x) => !x.soon).length, done: sts.filter((s) => s === 'done').length,
      nextTitle: i >= 0 ? pick.chapters[i].title : T('Parcours terminé 🏆'), waiting: i < 0 };
  };

  const learnNav = makeNav(() => L.view, () => {
    if (L.view === 'lesson') { L.view = 'course'; renderLearn(); return 'course'; }
    if (L.view === 'ex' || L.view === 'result') { L.view = 'lesson'; renderLearn(); return 'lesson'; }
    if (L.view === 'course') { L.view = 'domains'; renderLearn(); return 'top'; }
    return 'top';
  });

  async function renderLearn() {
    const el = learnEl();
    if (!el) return;
    if (L.view === 'domains') await renderDomains(el);
    else if (L.view === 'course') await renderCourse(el);
    else if (L.view === 'lesson') renderLesson(el);
    else if (L.view === 'ex') renderExercise(el);
    else if (L.view === 'result') renderResult(el);
    scrollTo(0, 0);
  }

  /* ----- Écran d'accueil d'Apprendre ----- */
  function dailyHtml(g, defis) {
    if (!defis || !defis.length) return '';
    const today = dayKey();
    if (g.daily.date === today) {
      return `<div class="daily"><div class="k">Défi du jour</div><h3>${g.daily.ok ? '✅ Bien joué ! +15 XP' : '🙂 Raté pour aujourd\'hui, mais tu as appris quelque chose.'}</h3><p class="av-sub" style="margin:0">Reviens demain pour un nouveau défi.</p></div>`;
    }
    const d = defis[dayNumber() % defis.length];
    L.daily = { d, perm: shuffle(d.options) };
    return `<div class="daily" id="daily"><div class="k">Défi du jour · +15 XP</div><h3>${esc(d.q)}</h3>
      <div class="opts" style="font-family:inherit">${L.daily.perm.map(([o, i]) => `<button type="button" class="opt" style="font-family:inherit" data-daily="${i}">${esc(o)}</button>`).join('')}</div><div id="dailyFb"></div></div>`;
  }

  async function renderDomains(el) {
    const [domains, defis] = await Promise.all([loadJson('domains.json'), loadJson('defis.json')]);
    if (L.view !== 'domains') return;
    const g = getProg();
    const lv = level(g.xp);
    el.innerHTML = `
      <div class="av-top"><span class="av-brand">Jikel<em>Tech</em><i class="av-sec">${T('Apprendre')}</i></span><span class="pill xp">⭐ ${g.xp} XP · ${T('Niv.')} ${lv.lvl}</span></div>
      <div class="hero-learn"><h2>Apprends en jouant</h2><p>Une leçon courte, puis des exercices pour valider. Chaque chapitre réussi te donne un badge.</p></div>
      ${dailyHtml(g, defis)}
      <h2 class="sect-title">Domaines</h2>
      ${domains ? `<div class="dom-grid">${domains.map((d) => `<button type="button" class="dom ${d.status === 'open' ? 'open' : 'soon'}" ${d.status === 'open' ? `data-open="${esc(d.course)}"` : 'disabled'}>
        <span class="tag ${d.status === 'open' ? 'go' : ''}">${d.status === 'open' ? 'Ouvert' : 'Bientôt'}</span><span class="ic">${esc(d.emoji)}</span><b>${esc(d.title)}</b><small>${esc(d.desc)}</small></button>`).join('')}</div>
      <p class="soon-note">De nouveaux domaines arrivent régulièrement : JavaScript, PHP, comptes en ligne…</p>`
      : '<p class="av-sub">Impossible de charger les cours. Vérifie ta connexion et réessaie.</p>'}`;
  }

  /* ----- Page d'un cours ----- */
  async function renderCourse(el) {
    const course = await loadJson(L.course + '.json');
    if (!course) { el.innerHTML = '<button class="back-btn" data-lback>← Retour</button><p class="av-sub">Impossible de charger ce cours. Vérifie ta connexion.</p>'; return; }
    const g = getProg();
    const sts = chapterStatus(course, g);
    const done = sts.filter((s) => s === 'done').length;
    el.innerHTML = `
      <button type="button" class="back-btn" data-lback>← Domaines</button>
      <h1 class="av-title">${esc(course.emoji)} ${esc(course.title)}</h1>
      <p class="av-sub">${esc(course.tagline)}</p>
      <div class="pstats"><span class="pill">${T('{a}/{b} étapes validées', { a: done, b: stepsTotal() })}</span><span class="pill xp">⭐ ${g.xp} XP</span></div>
      <div class="path">${course.chapters.map((c, i) => {
        const s = sts[i];
        const node = s === 'done' ? '✓' : s === 'soon' ? '…' : s === 'locked' ? '🔒' : c.final ? '🏆' : i + 1;
        const sub = s === 'soon' ? T('Bientôt disponible') : s === 'locked' ? (c.final ? T('Valide les 6 chapitres pour le débloquer') : T('Valide le chapitre précédent')) : `${c.minutes || 10} min · badge ${esc(c.badge?.emoji || '')} ${esc(c.badge?.name || '')}`;
        const clickable = s === 'done' || s === 'current';
        return `<button type="button" class="chap ${s} ${c.final ? 'final' : ''}" ${clickable ? `data-chap="${esc(c.id)}"` : 'disabled'}><span class="node">${node}</span><span><small>${c.final ? T('Examen final') : T('Chapitre {n}', { n: i + 1 })}</small><b>${esc(c.title)}</b><small>${sub}</small></span></button>`;
      }).join('')}
      </div>`;
  }

  /* ----- Leçon ----- */
  const chapterObj = () => cache[L.course + '.json']?.chapters.find((c) => c.id === L.chapter);
  function renderLesson(el) {
    const c = chapterObj();
    if (!c) { L.view = 'domains'; renderLearn(); return; }
    el.innerHTML = `
      <button type="button" class="back-btn" data-lback>← Parcours</button>
      <p class="av-sub" style="margin-bottom:4px">${esc(cache[L.course + '.json'].title)} · ${c.minutes || 10} min</p>
      <h1 class="av-title">${esc(c.title)}</h1>
      <div style="margin-top:18px">${c.lesson.map((s) => `<section class="lesson-sec"><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>
        ${s.code ? `<div class="codeblock"><span class="lbl">Code</span>${esc(s.code)}</div>` : ''}
        ${s.out ? `<div class="codeblock out"><span class="lbl">Résultat</span>${esc(s.out)}</div>` : ''}</section>`).join('')}</div>
      <div class="exbar"><button type="button" class="btn-main" data-start>Passer aux exercices →</button></div>`;
  }

  /* ----- Exercices ----- */
  function startSession() {
    const c = chapterObj();
    const exs = c.exercises;
    L.S = {
      idx: 0, hints: 0, firstTry: 0, xpEarned: 0,
      ex: exs.map((e) => ({ done: false, attempts: 0, hinted: false, perm: e.type === 'choice' || e.type === 'diag' ? shuffle(e.options) : e.type === 'order' ? shuffle(e.lines) : null, picked: [], log: [], sel: null, made: [], code: null, out: '', sol: false, lab: { sel: null, fixed: [], logs: {}, msg: '', wrong: 0 } })),
      locked: false,
    };
    L.view = 'ex';
    learnNav.enter();
    renderLearn();
  }

  const MAX_HINTS = 3;
  function renderExercise(el) {
    const c = chapterObj(), S = L.S;
    if (!c || !S) { L.view = 'lesson'; renderLearn(); return; }
    const e = c.exercises[S.idx], st = S.ex[S.idx];
    const bars = c.exercises.map((_, i) => `<i class="${S.ex[i].done ? 'ok' : i === S.idx ? 'cur' : ''}"></i>`).join('');
    let body = '';
    const term = e.cmds ? `<div class="term" role="log" aria-label="${esc(T('Terminal simulé'))}">${st.log.length ? st.log.map((i) => `<div><span class="pr">${e.obs ? '🔍' : '&gt;'} ${esc(e.cmds[i].c)}</span>\n${esc(e.cmds[i].out)}</div>`).join('') : `<span class="dim">${esc(T('Touche une commande pour la lancer.'))}</span>`}</div>
      <div class="cmds">${e.cmds.map((m, i) => `<button type="button" class="tile cmd ${st.log.includes(i) ? 'used2' : ''}" data-cmd="${i}" ${st.done ? 'disabled' : ''}>${esc(m.c)}</button>`).join('')}</div>` : '';
    if (e.type === 'code') {
      const code = st.code == null ? (e.starter || '') : st.code;
      const keys = ['⇥', '"', "'", '(', ')', ':', '[', ']', '{', '}', '=', '#', '+', '-', '*', '/', '%', '_', ',', '.'];
      body = `<div class="codeblock out"><span class="lbl">${esc(T('Sortie attendue'))}</span>${esc(e.expect)}</div>
        <textarea id="codeEd" class="code-ed" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="${esc(T('Éditeur de code Python'))}" rows="${Math.min(14, Math.max(6, code.split('\n').length + 1))}" ${st.done ? 'disabled' : ''}>${esc(code)}</textarea>
        <div class="keybar" aria-hidden="true">${keys.map((k) => `<button type="button" tabindex="-1" data-ins="${k === '⇥' ? '    ' : esc(k)}">${k}</button>`).join('')}</div>
        <div class="exbar"><button type="button" class="btn-line" data-run ${st.done ? 'disabled' : ''}>▶ ${T('Lancer')}</button><button type="button" class="btn-main" data-codecheck ${st.done ? 'disabled' : ''}>✓ ${T('Vérifier')}</button></div>
        <div class="term" id="codeOut" role="log" aria-live="polite">${st.out || `<span class="dim">${esc(T('Écris ton code, puis touche ▶ Lancer pour voir le résultat.'))}</span>`}</div>
        ${st.attempts >= 3 && !st.done && !st.sol ? `<button type="button" class="btn-line" data-sol>${esc(T('Voir une solution'))}</button>` : ''}
        ${st.sol && e.solution ? `<div class="codeblock"><span class="lbl">${esc(T('Une solution possible'))}</span>${esc(e.solution)}</div>` : ''}`;
    } else if (e.type === 'lab') {
      body = labHtml(e, st);
    } else if (e.type === 'link') {
      const lab = (id) => { const n = e.nodes.find((x) => x.id === id); return n ? `${n.e} ${n.label}` : id; };
      body = `<div class="nodes">${e.nodes.map((n) => `<button type="button" class="node-btn ${st.sel === n.id ? 'sel' : ''}" data-node="${esc(n.id)}" ${st.done ? 'disabled' : ''}><span>${esc(n.e)}</span><small>${esc(n.label)}</small></button>`).join('')}</div>
        <p class="av-sub" style="margin:6px 0">${esc(st.sel ? T('Touche l\'appareil à relier à {x}.', { x: lab(st.sel) }) : T('Touche un appareil, puis un deuxième pour tirer un câble.'))}</p>
        <div class="links">${st.made.length ? st.made.map((k) => { const [a, b] = k.split('|'); return `<button type="button" class="chip-link" data-unlink="${esc(k)}" ${st.done ? 'disabled' : ''}>${esc(lab(a))} ↔ ${esc(lab(b))} ✕</button>`; }).join('') : `<span class="av-sub">${esc(T('Aucun câble pour l\'instant.'))}</span>`}</div>
        <div class="exbar" style="margin-top:6px"><button type="button" class="btn-main" data-check ${st.done ? 'disabled' : ''}>Vérifier</button><button type="button" class="btn-line" data-clear ${st.done ? 'disabled' : ''}>Effacer</button></div>`;
    } else if (e.type === 'choice' || e.type === 'diag') {
      body = term + `<div class="opts">${st.perm.map(([o, i]) => `<button type="button" class="opt" data-opt="${i}" ${st.done ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`;
    } else if (e.type === 'fill') {
      body = `<div class="ansline"><input class="field" id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ta réponse" aria-label="Ta réponse" ${st.done ? 'disabled' : ''}><button type="button" class="btn-main" data-check ${st.done ? 'disabled' : ''}>Valider</button></div>`;
    } else if (e.type === 'order') {
      body = `<div class="picked" id="picked" data-empty="${esc(T('Touche les lignes dans le bon ordre'))}">${st.picked.map((pi, k) => `<button type="button" class="tile" data-unpick="${k}" ${st.done ? 'disabled' : ''}>${esc(st.perm[pi][0])}</button>`).join('')}</div>
        <div class="pool">${st.perm.map(([l], pi) => `<button type="button" class="tile ${st.picked.includes(pi) ? 'used' : ''}" data-pick="${pi}" ${st.done ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</div>
        <div class="exbar" style="margin-top:6px"><button type="button" class="btn-main" data-check ${st.done ? 'disabled' : ''}>Vérifier</button><button type="button" class="btn-line" data-clear ${st.done ? 'disabled' : ''}>Effacer</button></div>`;
    }
    el.innerHTML = `
      <button type="button" class="back-btn" data-lback>← Quitter</button>
      <div class="prog" aria-label="Progression du chapitre">${bars}</div>
      <p class="av-sub" style="margin-bottom:8px">${T('Exercice {a} sur {b}', { a: S.idx + 1, b: c.exercises.length })}</p>
      <div class="ex">
        <q>${esc(e.q)}</q>
        ${e.code ? `<div class="codeblock"><span class="lbl">Code</span>${esc(e.code)}</div>` : ''}
        ${body}
        <div id="fb">${st.done ? `<div class="feedback ok"><b>Correct !</b> ${esc(e.why || '')}</div>` : ''}</div>
        <div class="exbar">
          ${c.noHints ? '' : `<button type="button" class="btn-line" data-hint ${st.done || st.hinted || S.hints >= MAX_HINTS ? 'disabled' : ''}>💡 ${T(MAX_HINTS - S.hints > 1 ? 'Indice ({n} restants)' : 'Indice ({n} restant)', { n: MAX_HINTS - S.hints })}</button>`}
          <button type="button" class="btn-main right" data-next ${st.done ? '' : 'hidden'}>${S.idx + 1 < c.exercises.length ? 'Suivant →' : 'Terminer ✔'}</button>
        </div>
      </div>`;
    if (st.hinted && !st.done) $('#fb').innerHTML = `<div class="feedback hint">💡 ${esc(e.hint || '')}</div>`;
    if (e.type === 'fill' && !st.done) setTimeout(() => $('#ans')?.focus(), 50);
  }

  /* ----- Éditeur Python réel (Pyodide dans un Worker, chargé à la demande) ----- */
  const WORKER_SRC = `let py=null;
self.onmessage=async(ev)=>{const m=ev.data;try{
if(m.type==='init'){importScripts(m.base+'pyodide.js');py=await loadPyodide({indexURL:m.base});self.postMessage({type:'ready'});}
else if(m.type==='run'){let out='';py.setStdout({batched:(s)=>{out+=s+'\\n';}});py.setStderr({batched:(s)=>{out+=s+'\\n';}});
const g=py.globals.get('dict')();try{await py.runPythonAsync(m.code,{globals:g});self.postMessage({type:'done',id:m.id,out:out,err:''});}
catch(e){self.postMessage({type:'done',id:m.id,out:out,err:String(e&&e.message||e)});}finally{try{g.destroy();}catch(x){}}}
}catch(e){self.postMessage({type:'fatal',err:String(e&&e.message||e)});}};`;
  const PyRunner = {
    w: null, ready: null, seq: 0, waiting: {},
    base: () => ((window.LUMEN && window.LUMEN.PYODIDE_BASE) || 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'),
    reset() { try { if (this.w) this.w.terminate(); } catch { /* ignore */ } this.w = null; this.ready = null; Object.values(this.waiting).forEach((f) => f({ out: '', err: '', timeout: true })); this.waiting = {}; },
    ensure() {
      if (this.ready) return this.ready;
      this.ready = new Promise((resolve, reject) => {
        let w;
        try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); } catch (e) { reject(e); return; }
        this.w = w;
        w.onmessage = (ev) => {
          const m = ev.data;
          if (m.type === 'ready') resolve();
          else if (m.type === 'fatal') { reject(new Error(m.err)); this.reset(); }
          else if (m.type === 'done' && this.waiting[m.id]) { const f = this.waiting[m.id]; delete this.waiting[m.id]; f({ out: m.out, err: m.err }); }
        };
        w.onerror = (ev) => { reject(new Error(ev.message || 'worker')); this.reset(); };
        w.postMessage({ type: 'init', base: this.base() });
      });
      this.ready.catch(() => { this.ready = null; });
      return this.ready;
    },
    async run(code) {
      await this.ensure();
      return new Promise((resolve) => {
        const id = ++this.seq;
        const timer = setTimeout(() => { if (this.waiting[id]) this.reset(); }, 6000); // boucle infinie : on coupe
        this.waiting[id] = (r) => { clearTimeout(timer); resolve(r); };
        this.w.postMessage({ type: 'run', id, code });
      });
    },
  };
  const cleanCode = (s) => String(s).replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00A0/g, ' ').replace(/\r/g, '');
  const normOut = (s) => String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
  const friendlyErr = (err) => {
    const lines = String(err).trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] || err;
    const m = [...String(err).matchAll(/File "<exec>", line (\d+)/g)].pop();
    return (m ? T('Erreur à la ligne {n} :', { n: m[1] }) + ' ' : T('Erreur :') + ' ') + last;
  };
  const failC = (e, st, msg) => {
    fail(e, st, msg);
    const out = $('#codeOut');
    if (out && st.attempts >= 3 && !st.sol && !$('[data-sol]')) out.insertAdjacentHTML('afterend', `<button type="button" class="btn-line" data-sol>${esc(T('Voir une solution'))}</button>`);
  };
  async function runCode(e, st, check) {
    const out = $('#codeOut');
    const setOut = (html) => { st.out = html; if (out) out.innerHTML = html; };
    const code = cleanCode(($('#codeEd') || {}).value ?? st.code ?? '');
    st.code = code;
    if (!code.trim()) { setOut(`<span class="dim">${esc(T('Écris ton code d\'abord.'))}</span>`); return; }
    if (st.busy) return;
    st.busy = true;
    $$('[data-run],[data-codecheck]').forEach((b) => { b.disabled = true; });
    let loadTimer = null;
    try {
      if (!PyRunner.ready) {
        let s = 0;
        setOut(`<span class="dim">${esc(T('Chargement de l\'éditeur Python (≈ 10 Mo, une seule fois)…'))}</span>`);
        loadTimer = setInterval(() => { s++; if ($('#codeOut')) $('#codeOut').innerHTML = `<span class="dim">${esc(T('Chargement de l\'éditeur Python (≈ 10 Mo, une seule fois)…'))} ${s} s</span>`; }, 1000);
      }
      let r;
      try { r = await PyRunner.run(code); }
      catch { clearInterval(loadTimer); setOut(`<span class="err">${esc(T('Impossible de charger l\'éditeur Python. Vérifie ta connexion puis réessaie.'))}</span>`); return; }
      clearInterval(loadTimer);
      if (r.timeout) { setOut(`<span class="err">${esc(T('Ton programme tourne trop longtemps (boucle infinie ?). Il a été arrêté.'))}</span>`); if (check) failC(e, st, T('Ton programme ne se termine pas.')); return; }
      const shown = normOut(r.out);
      setOut(`${shown ? esc(shown) : `<span class="dim">${esc(T('(aucune sortie)'))}</span>`}${r.err ? `<div class="err">${esc(friendlyErr(r.err))}</div>` : ''}`);
      if (!check) return;
      if (r.err) { failC(e, st, T('Ton code provoque une erreur : corrige-la puis revérifie.')); return; }
      const bad = (e.must || []).find((m) => !new RegExp(m.re).test(code));
      if (bad) { failC(e, st, bad.msg); return; }
      if (normOut(r.out) === normOut(e.expect)) { st.code = code; succeed(e, st); }
      else failC(e, st, T('La sortie est différente de celle attendue. Compare les deux.'));
    } finally { clearInterval(loadTimer); st.busy = false; $$('[data-run],[data-codecheck]').forEach((b) => { b.disabled = !!st.done; }); }
  }

  /* ----- Labo immersif : l'entreprise en panne ----- */
  const labOut = (e, pc, i) => { const k = pc.fault && !st_fixed(pc) ? pc.fault : 'ok'; return String(e.out[k][i]).replace(/\{ip\}/g, pc.ip); };
  let _labSt = null;
  const st_fixed = (pc) => _labSt && _labSt.lab.fixed.includes(pc.id);
  function labHtml(e, st) {
    _labSt = st;
    const t = e.txt, lb = st.lab, faulty = e.pcs.filter((p) => p.fault);
    const sel = e.pcs.find((p) => p.id === lb.sel);
    const grid = e.pcs.map((p) => {
      const bad = p.fault && !lb.fixed.includes(p.id);
      return `<button type="button" class="pc-btn ${bad ? 'bad' : 'good'} ${lb.sel === p.id ? 'sel' : ''}" data-labpc="${esc(p.id)}"><span>${esc(p.icon || '💻')}</span><b>${esc(p.name)}</b><small>${bad ? esc(t.reported) : esc(t.good)}</small></button>`;
    }).join('');
    let panel = `<p class="av-sub" style="margin:10px 0">${esc(t.tap)}</p>`;
    if (sel) {
      const log = lb.logs[sel.id] || [];
      const term = log.length ? log.map((i) => `<div><span class="pr">${e.obs ? '🔍' : '&gt;'} ${esc(e.cmds[i])}</span>\n${esc(labOut(e, sel, i))}</div>`).join('') : `<span class="dim">${esc(e.obs ? T('Touche un test pour l\'effectuer.') : T('Touche une commande pour la lancer.'))}</span>`;
      panel = `<h3 class="lab-h">${esc(sel.name)} · ${esc(sel.ip)}</h3><div class="term" role="log">${term}</div>
        <div class="lab-k">${esc(t.run)}</div><div class="cmds">${e.cmds.map((c, i) => `<button type="button" class="tile cmd ${log.includes(i) ? 'used2' : ''}" data-labcmd="${i}">${esc(c)}</button>`).join('')}</div>
        <div class="lab-k">${esc(t.fix)}</div><div class="fixes">${e.repairs.map((r) => `<button type="button" class="btn-line fixbtn" data-labfix="${esc(r.id)}">🔧 ${esc(r.label)}</button>`).join('')}</div>`;
    }
    return `<div class="pcgrid">${grid}</div><div class="lab-prog">${esc(T(t.progress, { n: lb.fixed.length }))}</div><div class="labpanel">${panel}</div><div id="labfb">${lb.msg ? lb.msg : ''}</div>`;
  }
  function labClick(t, e, st) {
    const lb = st.lab;
    const pc = t.closest('[data-labpc]');
    if (pc) { lb.sel = pc.dataset.labpc; lb.msg = ''; renderExercise(learnEl()); return true; }
    const cmd = t.closest('[data-labcmd]');
    if (cmd && lb.sel) { const l = (lb.logs[lb.sel] = lb.logs[lb.sel] || []); const i = +cmd.dataset.labcmd; if (!l.includes(i)) l.push(i); lb.msg = ''; renderExercise(learnEl()); const tm = $('.term'); if (tm) tm.scrollTop = tm.scrollHeight; return true; }
    const fx = t.closest('[data-labfix]');
    if (fx && lb.sel) {
      const p = e.pcs.find((x) => x.id === lb.sel);
      const need = (e.fixes || { cable: 'cable', ip: 'dhcp', dns: 'dns' })[p.fault];
      const msg = (cls, s) => { lb.msg = `<div class="feedback ${cls}">${esc(s)}</div>`; };
      if (!p.fault || lb.fixed.includes(p.id)) { lb.wrong++; msg('ko', e.txt.ok); }
      else if (!(lb.logs[p.id] || []).length) { msg('hint', e.txt.need); }
      else if (fx.dataset.labfix === need) {
        lb.fixed.push(p.id); msg('ok', e.txt.fixed);
        if (lb.fixed.length === e.pcs.filter((x) => x.fault).length) {
          st.attempts = lb.wrong > 3 ? 1 : 0;
          lb.msg = '';
          succeed(e, st);
          return true;
        }
      } else { lb.wrong++; msg('ko', e.txt.wrong); }
      renderExercise(learnEl()); return true;
    }
    return false;
  }

  function succeed(e, st) {
    const S = L.S;
    const clean = st.attempts === 0;
    const xp = clean ? (st.hinted ? 7 : 10) : 4;
    if (clean) S.firstTry++;
    S.xpEarned += xp;
    st.done = true;
    const g = getProg();
    g.solved += 1; g.xp += xp; touchStreak(g); saveProg(g);
    track('exercise_ok', { course: L.course, chapter: L.chapter, first_try: clean });
    renderExercise(learnEl());
    toast(`+${xp} XP`);
  }

  function fail(e, st, msg) {
    st.attempts++;
    const extra = st.attempts >= 2 ? ' ' + T('Relis la leçon ou prends un indice si tu en as encore.') : '';
    const fb = $('#fb');
    if (fb) fb.innerHTML = `<div class="feedback ko"><b>Pas tout à fait.</b> ${esc(msg || T('Essaie encore.'))}${esc(extra)}</div>`;
  }

  function checkAnswer(kind, val) {
    const c = chapterObj(), S = L.S, e = c.exercises[S.idx], st = S.ex[S.idx];
    if (st.done) return;
    if (kind === 'choice') {
      if (+val === e.answer) succeed(e, st);
      else {
        const btn = $(`[data-opt="${val}"]`);
        btn?.classList.add('bad'); if (btn) btn.disabled = true;
        fail(e, st, T('Ce n\'est pas la bonne réponse.'));
      }
    } else if (kind === 'fill') {
      if (!norm(val)) return;
      const ok = e.answer.some((a) => norm(a) === norm(val));
      if (ok) succeed(e, st); else fail(e, st, T('Vérifie l\'orthographe, les majuscules et les guillemets.'));
    } else if (kind === 'link') {
      const want = new Set(e.links.map((p) => p.slice().sort().join('|')));
      const have = new Set(st.made);
      const missing = [...want].filter((k) => !have.has(k)).length, extra = [...have].filter((k) => !want.has(k)).length;
      if (!missing && !extra) succeed(e, st);
      else fail(e, st, [missing ? T(missing > 1 ? 'Il manque {n} câbles.' : 'Il manque {n} câble.', { n: missing }) : '', extra ? T(extra > 1 ? '{n} câbles sont en trop ou mal placés.' : '{n} câble est en trop ou mal placé.', { n: extra }) : ''].filter(Boolean).join(' '));
    } else if (kind === 'order') {
      const seq = st.picked.map((pi) => st.perm[pi][0]);
      if (seq.length === e.lines.length && seq.every((l, i) => l === e.lines[i])) succeed(e, st);
      else { fail(e, st, seq.length < e.lines.length ? T('Il manque des lignes.') : T('Ce n\'est pas le bon ordre.')); }
    }
  }

  function finishChapter() {
    const c = chapterObj(), S = L.S;
    const total = c.exercises.length;
    const score = S.firstTry / total;
    const need = c.passScore ?? cache[L.course + '.json'].passScore ?? 0.6;
    const pass = score >= need;
    const g = getProg();
    let bonus = 0, newBadge = false;
    if (pass) {
      const cs = (g.courses[L.course] = g.courses[L.course] || {});
      const first = !cs[c.id]?.done;
      cs[c.id] = { done: true, score: Math.max(cs[c.id]?.score || 0, S.firstTry), total, at: dayKey() };
      if (first) { bonus = c.bonus || 30; g.xp += bonus; }
      const bid = `${L.course}:${c.id}`;
      if (!g.badges.includes(bid)) { g.badges.push(bid); newBadge = true; }
      touchStreak(g);
      saveProg(g);
      track('chapter_done', { course: L.course, chapter: c.id, score: S.firstTry + '/' + total });
    }
    logHist(g, c.final ? 'exam' : 'chap', c.title, S.xpEarned + bonus, pass, S.firstTry + '/' + total);
    saveProg(g);
    L.result = { pass, score: S.firstTry, total, xp: S.xpEarned + bonus, bonus, newBadge, badge: c.badge };
    L.view = 'result';
    renderLearn();
  }

  function renderResult(el) {
    const r = L.result, c = chapterObj();
    if (!r || !c) { L.view = 'domains'; renderLearn(); return; }
    const stars = r.score === r.total ? '⭐⭐⭐' : r.score / r.total >= 0.8 ? '⭐⭐' : r.pass ? '⭐' : '';
    el.innerHTML = r.pass ? `
      <div class="result"><div class="big">${esc(r.badge?.emoji || '🏅')}</div>
        <h2>${c.final ? 'Examen réussi !' : 'Chapitre validé !'}</h2>
        <p>${r.newBadge ? `Nouveau badge : <b>${esc(r.badge?.name || '')}</b>` : 'Tu avais déjà ce badge.'}<br>${T('{a}/{b} du premier coup', { a: r.score, b: r.total })} ${stars}</p>
        <div class="xpgain">+${r.xp} XP</div>
        <div class="exbar" style="justify-content:center"><button type="button" class="btn-main" data-toparcours>Continuer le parcours →</button></div></div>`
      : `<div class="result"><div class="big">📖</div>
        <h2>Pas encore validé</h2>
        <p>${T('{a}/{b} du premier coup. Il faut au moins {m} pour valider. Relis la leçon, tu vas y arriver !', { a: r.score, b: r.total, m: Math.ceil((c.passScore || cache[L.course + '.json'].passScore || 0.6) * r.total) })}</p>
        <div class="exbar" style="justify-content:center"><button type="button" class="btn-line" data-lback>Relire la leçon</button><button type="button" class="btn-main" data-start>Recommencer</button></div></div>`;
  }

  /* ----- Clics dans Apprendre ----- */
  learnEl().addEventListener('click', async (e) => {
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) { L.course = open.dataset.open; L.view = 'course'; learnNav.enter(); renderLearn(); return; }
    const chap = t.closest('[data-chap]');
    if (chap) { L.chapter = chap.dataset.chap; L.view = 'lesson'; learnNav.enter(); renderLearn(); track('chapter_open', { chapter: L.chapter }); return; }
    if (t.closest('[data-lback]')) { learnNav.back(); return; }
    if (t.closest('[data-start]')) { startSession(); return; }
    if (t.closest('[data-toparcours]')) { L.view = 'course'; L.S = null; renderLearn(); return; }

    const dly = t.closest('[data-daily]');
    if (dly && L.daily) {
      const ok = +dly.dataset.daily === L.daily.d.answer;
      const g = getProg();
      g.daily = { date: dayKey(), ok };
      if (ok) { g.xp += 15; touchStreak(g); }
      logHist(g, 'daily', T('Défi du jour'), ok ? 15 : 0, ok, '');
      saveProg(g);
      $$('[data-daily]').forEach((b) => { b.disabled = true; if (+b.dataset.daily === L.daily.d.answer) b.classList.add('good'); else if (b === dly) b.classList.add('bad'); });
      $('#dailyFb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'ko'}"><b>${ok ? 'Bravo ! +15 XP' : 'Pas cette fois.'}</b> ${esc(L.daily.d.why || '')}</div>`;
      track('daily_challenge', { ok });
      return;
    }

    if (L.view !== 'ex' || !L.S) return;
    const S = L.S, c = chapterObj(), ex = c.exercises[S.idx], st = S.ex[S.idx];
    const opt = t.closest('[data-opt]');
    if (ex.type === 'code') {
      const ins = t.closest('[data-ins]');
      if (ins) { const ta = $('#codeEd'); if (ta && !ta.disabled) { const a = ta.selectionStart, b = ta.selectionEnd, v = ins.dataset.ins; ta.value = ta.value.slice(0, a) + v + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + v.length; st.code = ta.value; ta.focus(); } return; }
      if (t.closest('[data-run]')) { runCode(ex, st, false); return; }
      if (t.closest('[data-codecheck]')) { runCode(ex, st, true); return; }
      if (t.closest('[data-sol]')) { st.code = ($('#codeEd') || {}).value ?? st.code; st.sol = true; renderExercise(learnEl()); return; }
    }
    if (ex.type === 'lab' && !st.done && labClick(t, ex, st)) return;
    const cmd = t.closest('[data-cmd]');
    if (cmd) { const i = +cmd.dataset.cmd; if (!st.log.includes(i)) st.log.push(i); renderExercise(learnEl()); const tm = $('.term'); if (tm) tm.scrollTop = tm.scrollHeight; return; }
    const nd = t.closest('[data-node]');
    if (nd) {
      const id = nd.dataset.node;
      if (st.sel === id) st.sel = null;
      else if (!st.sel) st.sel = id;
      else { const k = [st.sel, id].sort().join('|'); const at = st.made.indexOf(k); if (at >= 0) st.made.splice(at, 1); else st.made.push(k); st.sel = null; }
      renderExercise(learnEl()); return;
    }
    const ul = t.closest('[data-unlink]');
    if (ul) { st.made = st.made.filter((k) => k !== ul.dataset.unlink); renderExercise(learnEl()); return; }
    if (opt) {
      if (ex.cmds && !st.log.length && !st.done) { const fb = $('#fb'); if (fb) fb.innerHTML = `<div class="feedback hint">${esc(e.obs ? T('Fais d\'abord un test pour enquêter.') : T('Lance d\'abord une commande pour enquêter.'))}</div>`; return; }
      checkAnswer('choice', opt.dataset.opt); return;
    }
    if (t.closest('[data-check]')) { checkAnswer(ex.type, ex.type === 'fill' ? $('#ans').value : null); return; }
    const pick = t.closest('[data-pick]');
    if (pick) { const pi = +pick.dataset.pick; if (!st.picked.includes(pi)) st.picked.push(pi); renderExercise(learnEl()); return; }
    const unpick = t.closest('[data-unpick]');
    if (unpick) { st.picked.splice(+unpick.dataset.unpick, 1); renderExercise(learnEl()); return; }
    if (t.closest('[data-clear]')) { st.picked = []; st.made = []; st.sel = null; renderExercise(learnEl()); return; }
    if (t.closest('[data-hint]')) {
      if (st.hinted || S.hints >= MAX_HINTS) return;
      st.hinted = true; S.hints++;
      renderExercise(learnEl());
      return;
    }
    if (t.closest('[data-next]')) {
      if (S.idx + 1 < c.exercises.length) { S.idx++; renderExercise(learnEl()); scrollTo(0, 0); }
      else finishChapter();
    }
  });
  learnEl().addEventListener('input', (e) => {
    if (e.target.id === 'codeEd' && L.S) { const st = L.S.ex[L.S.idx]; if (st) st.code = e.target.value; }
  });
  learnEl().addEventListener('mousedown', (e) => { if (e.target.closest('.keybar')) e.preventDefault(); });
  learnEl().addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'ans') { e.preventDefault(); checkAnswer('fill', e.target.value); }
  });

  /* ======================================================================
     SOS TECH
     ====================================================================== */
  const Sx = { view: 'list', guide: null, q: '', tag: 'tous', done: {} };
  const EN = I18N.lang === 'en';
  const sosEl = () => $('#view-sos');
  const sosNav = makeNav(() => Sx.view, () => { Sx.view = 'list'; renderSos(); return 'top'; });
  const TAGS = EN ? ['tous', 'phone', 'computer', 'network', 'security'] : ['tous', 'téléphone', 'ordinateur', 'réseau', 'sécurité'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  async function renderSos() {
    const el = sosEl();
    const guides = await loadJson('sos.json');
    if (!el) return;
    if (!guides) { el.innerHTML = '<div class="av-top"><span class="av-brand">Jikel<em>Tech</em><i class="av-sec">SOS Tech</i></span></div><p class="av-sub">Impossible de charger les guides. Vérifie ta connexion.</p>'; return; }
    if (Sx.view === 'guide') {
      const gd = guides.find((x) => x.id === Sx.guide);
      if (!gd) { Sx.view = 'list'; return renderSos(); }
      const done = Sx.done[gd.id] || [];
      el.innerHTML = `<div class="guide">
        <button type="button" class="back-btn" data-sback>← Tous les guides</button>
        <h2>${esc(gd.emoji)} ${esc(gd.title)}</h2>
        <p class="intro">${esc(gd.intro)}</p>
        <p class="av-sub" style="margin-bottom:12px">Fais les étapes dans l'ordre. Touche une étape quand elle est faite.</p>
        <ol class="gsteps">${gd.steps.map((s, i) => `<li><button type="button" class="gstep ${done.includes(i) ? 'done' : ''}" data-step="${i}"><span class="n">${done.includes(i) ? '✓' : i + 1}</span><span><b>${esc(s.t)}</b><p>${esc(s.d)}</p></span></button></li>`).join('')}</ol>
        ${gd.warn ? `<div class="warnbox"><b>À savoir : </b>${esc(gd.warn)}</div>` : ''}
        <p class="soon-note">Ça n'a pas résolu ton problème ? Passe par un technicien de confiance, et dis-lui ce que tu as déjà essayé.</p></div>`;
      return;
    }
    const q = Sx.q.trim().toLowerCase();
    const list = guides.filter((x) => (Sx.tag === 'tous' || x.tags.includes(Sx.tag)) && (!q || (x.title + ' ' + x.tags.join(' ') + ' ' + x.intro).toLowerCase().includes(q)));
    el.innerHTML = `
      <div class="av-top"><span class="av-brand">Jikel<em>Tech</em><i class="av-sec">SOS Tech</i></span></div>
      <h1 class="av-title">Un problème ? On t'aide.</h1>
      <p class="av-sub">Des guides pas à pas pour dépanner ton téléphone, ton PC ou ta connexion.</p>
      <div class="hsearch"><span aria-hidden="true">⌕</span><input type="search" id="sosSearch" value="${esc(Sx.q)}" placeholder="Décris ton problème (ex. : wifi, lent, batterie…)" aria-label="Chercher un guide" autocomplete="off"></div>
      <div class="chips-row">${TAGS.map((t) => `<button type="button" class="sub-btn ${Sx.tag === t ? 'active' : ''}" data-tag="${t}">${t === 'tous' ? T('Tous') : cap(t)}</button>`).join('')}</div>
      <div class="sos-list">${list.length ? list.map((x) => `<button type="button" class="sos-card" data-guide="${esc(x.id)}"><span class="ic">${esc(x.emoji)}</span><span><b>${esc(x.title)}</b><small>${T('{n} étapes', { n: x.steps.length })}</small></span></button>`).join('') : '<p class="av-sub">Aucun guide ne correspond. D\'autres arrivent bientôt.</p>'}</div>
      <p class="soon-note">De nouveaux guides sont ajoutés régulièrement.</p>`;
    if (Sx.focusSearch) { Sx.focusSearch = false; const i = $('#sosSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }

  sosEl().addEventListener('click', (e) => {
    const t = e.target;
    const g = t.closest('[data-guide]');
    if (g) { Sx.guide = g.dataset.guide; Sx.view = 'guide'; sosNav.enter(); renderSos(); scrollTo(0, 0); track('sos_guide_open', { guide: Sx.guide }); return; }
    if (t.closest('[data-sback]')) { sosNav.back(); return; }
    const tag = t.closest('[data-tag]');
    if (tag) { Sx.tag = tag.dataset.tag; renderSos(); return; }
    const step = t.closest('[data-step]');
    if (step) {
      const i = +step.dataset.step;
      const arr = (Sx.done[Sx.guide] = Sx.done[Sx.guide] || []);
      const k = arr.indexOf(i);
      if (k >= 0) arr.splice(k, 1); else arr.push(i);
      const y = scrollY; renderSos().then(() => scrollTo(0, y));
    }
  });
  sosEl().addEventListener('input', (e) => {
    if (e.target.id === 'sosSearch') { Sx.q = e.target.value; Sx.focusSearch = true; renderSos(); }
  });

  /* ---------- Raccord avec les onglets et le bouton Retour ---------- */
  addEventListener('popstate', () => {
    const tab = ['learn', 'sos'].find((t) => document.body.classList.contains('tab-' + t));
    if (tab === 'learn') learnNav.pop(); else if (tab === 'sos') sosNav.pop();
  });
  document.addEventListener('jt:tab', (e) => {
    learnNav.reset(); sosNav.reset();
    if (e.detail === 'learn') { if (L.view === 'ex' || L.view === 'result') L.view = 'domains'; renderLearn(); }
    else if (e.detail === 'sos') { Sx.view = 'list'; renderSos(); }
  });

  // Charge les cours en arrière-plan pour que « Ton parcours » affiche le bon chapitre.
  Promise.all([loadJson('python.json'), loadJson('reseau.json'), loadJson('pylab.json'), loadJson('maintenance.json'), loadJson('cyber.json'), loadJson('linux.json'), loadJson('web.json'), loadJson('domains.json')]).then(() => document.dispatchEvent(new CustomEvent('jt:ready')));

  if (document.body.classList.contains('tab-learn')) renderLearn();
  if (document.body.classList.contains('tab-sos')) renderSos();
})();
