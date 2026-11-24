/* Ligues (sur l'appareil) et classement en ligne facultatif (Supabase). */
(() => {
  'use strict';
  const JT = window.JT, T = window.T || ((s) => s);
  if (!JT) return;
  const { esc, jget, jset, getProg, getProfile, toast } = JT;
  const LEAGUES = [
    { id: 'bronze', n: 'Bronze', e: '🥉', min: 0, max: 199 },
    { id: 'silver', n: 'Argent', e: '🥈', min: 200, max: 499 },
    { id: 'gold', n: 'Or', e: '🥇', min: 500, max: 999 },
    { id: 'legend', n: 'Légendaire', e: '👑', min: 1000, max: 0 },
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
    const r = await fetch(cfg().RANK_URL + '/rest/v1/lb_public?select=uid,name,xp,chapters&order=xp.desc&limit=100', { headers: hdr() });
    if (!r.ok) throw new Error('top ' + r.status);
    return r.json();
  }

  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const av = (name, uid) => `<span class="rk-av" style="background:hsl(${hue(uid || name)} 55% 45%)">${esc([...String(name || '?')][0].toUpperCase())}</span>`;
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');

  async function board(el, tab) {
    if (!el) return;
    const g = getProg(), r = getR(), p = getProfile(), L = leagueOf(g.xp);
    const ctl = () => !online() ? '' : (!r.on
      ? `<button type="button" class="btn-main wide" data-rk="join">🏆 ${T('Rejoindre le classement')}</button>`
      : `<div class="exbar" style="margin-top:10px"><button type="button" class="btn-line" data-rk="sync">${T('Mettre à jour mon score')}</button><button type="button" class="btn-line" data-rk="leave">${T('Quitter le classement')}</button></div>`);
    if (!online()) { el.innerHTML = `<p class="av-sub">${T('Le classement en ligne arrive bientôt. En attendant, monte de ligue en gagnant des XP.')}</p>`; return; }
    el.innerHTML = `<p class="av-sub">${T('Chargement…')}</p>`;
    let rows = [];
    try { if (r.on) await submit(false).catch(() => {}); rows = await top(); } catch { el.innerHTML = `<p class="msg err">${T('Connexion impossible. Réessaie plus tard.')}</p>`; return; }
    const me = r.uid, pos = rows.findIndex((x) => x.uid === me);
    if (tab === 1) {
      el.innerHTML = `<div class="myrank"><span class="lg-big">${L.cur.e}</span><div><b>${T('Ligue')} ${esc(T(L.cur.n))}</b><small>${fmt(g.xp)} XP</small></div></div>
        <div class="stats4"><div class="st4"><span>🏆</span><small>${T('Ma position')}</small><b>${r.on ? (pos >= 0 ? '#' + (pos + 1) : T('Hors top 100')) : '—'}</b></div><div class="st4"><span>👥</span><small>${T('Classés')}</small><b>${rows.length}</b></div></div>${ctl()}<p class="msg" id="rkMsg" role="status"></p>`;
      return;
    }
    if (!rows.length) { el.innerHTML = `<p class="av-sub">${T('Personne pour l\'instant : sois le premier !')}</p>${ctl()}<p class="msg" id="rkMsg" role="status"></p>`; return; }
    const pod = (x, k) => x ? `<div class="pod p${k}"><span class="crown">${k === 1 ? '👑' : ''}</span>${av(x.name, x.uid)}<span class="pn">${k}</span><b>${esc(String(x.name).slice(0, 14))}</b><small>${fmt(x.xp | 0)} XP</small></div>` : '<div class="pod"></div>';
    const list = rows.slice(3).map((x, i) => `<li class="${x.uid === me ? 'me' : ''}"><span class="n">${i + 4}</span>${av(x.name, x.uid)}<b>${esc(String(x.name).slice(0, 24))}</b>${x.uid === me ? `<em class="toi">${T('Toi')}</em>` : `<small>${fmt(x.xp | 0)} XP</small>`}</li>`).join('');
    el.innerHTML = `<div class="podium">${pod(rows[1], 2)}${pod(rows[0], 1)}${pod(rows[2], 3)}</div><ol class="rk">${list}</ol>${ctl()}<p class="msg" id="rkMsg" role="status"></p>`;
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

  JT.rank = { leagueOf, board, act, submit, LEAGUES };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-rk]'); if (b) act(b.dataset.rk); });
  document.addEventListener('jt:progress', () => { submit(false).catch(() => {}); });
})();
