/* Ligues (sur l'appareil) et classement en ligne facultatif (Supabase). */
(() => {
  'use strict';
  const JT = window.JT, T = window.T || ((s) => s);
  if (!JT) return;
  const { esc, jget, jset, getProg, getProfile, toast } = JT;
  const LEAGUES = [
    { id: 'bronze', n: 'Bronze', e: '🥉', min: 0 },
    { id: 'silver', n: 'Argent', e: '🥈', min: 250 },
    { id: 'gold', n: 'Or', e: '🥇', min: 700 },
    { id: 'plat', n: 'Platine', e: '💠', min: 1400 },
    { id: 'diam', n: 'Diamant', e: '💎', min: 2400 },
  ];
  const leagueOf = (xp) => { let i = 0; LEAGUES.forEach((l, k) => { if (xp >= l.min) i = k; }); return { i, cur: LEAGUES[i], next: LEAGUES[i + 1] || null }; };
  const cfg = () => window.LUMEN || {};
  const online = () => !!(cfg().RANK_URL && cfg().RANK_KEY);
  const getR = () => jget('jt_rank', {});
  const rid = (n) => { const a = new Uint8Array(n); (crypto || window.msCrypto).getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); };
  const hdr = () => { const k = cfg().RANK_KEY, h = { apikey: k, 'Content-Type': 'application/json' }; if (/^eyJ/.test(k)) h.Authorization = 'Bearer ' + k; return h; };

  async function rpc(name, body) {
    const r = await fetch(cfg().RANK_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('rpc ' + r.status);
    return true;
  }
  const chaptersOf = (g) => JT.doneChapters(g);
  async function submit(force) {
    const r = getR(), g = getProg(), p = getProfile();
    if (!online() || !r.on || !r.uid) return;
    const now = Date.now();
    if (!force && r.last && now - r.last < 600000) return;
    await rpc('submit_score', { p_uid: r.uid, p_secret: r.secret, p_name: (p.name || 'Anonyme').slice(0, 24), p_xp: g.xp | 0, p_chapters: chaptersOf(g) });
    jset('jt_rank', { ...getR(), last: now });
  }
  async function top() {
    const r = await fetch(cfg().RANK_URL + '/rest/v1/lb_public?select=uid,name,xp,chapters&order=xp.desc&limit=20', { headers: hdr() });
    if (!r.ok) throw new Error('top ' + r.status);
    return r.json();
  }

  function html() {
    const g = getProg(), L = leagueOf(g.xp), r = getR(), p = getProfile();
    const pct = L.next ? Math.min(100, Math.round(((g.xp - L.cur.min) / (L.next.min - L.cur.min)) * 100)) : 100;
    const leagues = LEAGUES.map((l, k) => `<span class="lg ${k <= L.i ? 'on' : ''}" title="${esc(T(l.n))}">${l.e}</span>`).join('');
    let on = '';
    if (!online()) on = `<p class="av-sub">${T('Le classement en ligne arrive bientôt. En attendant, monte de ligue en gagnant des XP.')}</p>`;
    else if (!r.on) on = `<p class="av-sub">${T('Rejoins le classement : ton prénom et tes XP seront visibles par les autres apprenants. Pas de compte ni de mot de passe.')}</p>
      <div class="exbar" style="margin-top:0"><button type="button" class="btn-main" data-rk="join">${T('Rejoindre le classement')}</button><button type="button" class="btn-line" data-rk="top">${T('Voir le top 20')}</button></div>`;
    else on = `<p class="av-sub">${T('Tu es dans le classement avec ton prénom « {n} ».', { n: esc(p.name || T('Anonyme')) })}</p>
      <div class="exbar" style="margin-top:0"><button type="button" class="btn-main" data-rk="top">${T('Voir le top 20')}</button><button type="button" class="btn-line" data-rk="sync">${T('Mettre à jour mon score')}</button><button type="button" class="btn-line" data-rk="leave">${T('Quitter le classement')}</button></div>`;
    return `<h2 class="sect-title">${T('Ligue et classement')}</h2>
      <div class="league"><div class="lg-now"><span class="lg-big">${L.cur.e}</span><div><b>${T('Ligue')} ${esc(T(L.cur.n))}</b><small>${g.xp} XP${L.next ? ' · ' + T('encore {n} XP pour {l}', { n: L.next.min - g.xp, l: T(L.next.n) }) : ' · ' + T('ligue maximale')}</small></div></div>
      <div class="xpbar" aria-hidden="true"><i style="width:${pct}%"></i></div><div class="lgs">${leagues}</div></div>
      ${on}<ol class="rk" id="rkList" hidden></ol><p class="msg" id="rkMsg" role="status"></p>`;
  }

  async function act(a) {
    const msg = (t, err) => { const m = document.getElementById('rkMsg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };
    const p = getProfile();
    try {
      if (a === 'join') {
        if (!p.name) { msg(T('Entre d\'abord ton prénom plus haut.'), true); return; }
        const r = getR(); jset('jt_rank', { uid: r.uid || rid(6), secret: r.secret || rid(16), on: true, last: 0 });
        await submit(true); toast(T('Tu es dans le classement ✔')); document.dispatchEvent(new CustomEvent('jt:rank-change'));
      } else if (a === 'sync') { await submit(true); msg(T('Score mis à jour ✔')); }
      else if (a === 'leave') {
        const r = getR(); try { await rpc('leave_score', { p_uid: r.uid, p_secret: r.secret }); } catch {}
        jset('jt_rank', { ...r, on: false }); toast(T('Tu as quitté le classement')); document.dispatchEvent(new CustomEvent('jt:rank-change'));
      } else if (a === 'top') {
        if (!online()) { msg(T('Le classement en ligne arrive bientôt.')); return; }
        msg(T('Chargement…'));
        const rows = await top(), me = getR().uid, ol = document.getElementById('rkList');
        ol.innerHTML = rows.length ? rows.map((x, i) => `<li class="${x.uid === me ? 'me' : ''}"><span class="n">${i + 1}</span><b>${esc(String(x.name || '').slice(0, 24))}</b><small>${leagueOf(x.xp | 0).cur.e} ${x.xp | 0} XP · ${x.chapters | 0} ${T('chapitres')}</small></li>`).join('') : `<li>${T('Personne pour l\'instant : sois le premier !')}</li>`;
        ol.hidden = false; msg('');
      }
    } catch { msg(T('Connexion impossible. Réessaie plus tard.'), true); }
  }

  JT.rank = { leagueOf, html, act, submit, LEAGUES };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-rk]'); if (b) act(b.dataset.rk); });
  document.addEventListener('jt:progress', () => { submit(false).catch(() => {}); });
})();
