/* JikelTech — langue de l'interface (FR par défaut, EN en option). Le texte français sert de clé. */
(function () {
  let lang = 'fr';
  try { const s = localStorage.getItem('jt_lang'); if (s === 'en' || s === 'fr') lang = s; } catch { /* ignore */ }
  const I = window.I18N = {
    lang,
    locale: lang === 'en' ? 'en-GB' : 'fr-FR',
    dict: {},
    add(d) { Object.assign(I.dict, d); },
    set(l) { try { localStorage.setItem('jt_lang', l); } catch { /* ignore */ } location.reload(); },
    t(fr, vars) {
      let s = (lang === 'en' && I.dict[fr]) || fr;
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
      return s;
    },
    apply(root) {
      if (lang !== 'en') return;
      root = root || document.body;
      const tr = (s) => { const k = s.trim(); const v = I.dict[k]; return v ? s.replace(k, v) : s; };
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n; const nodes = [];
      while ((n = w.nextNode())) { const p = n.parentNode && n.parentNode.nodeName; if (p !== 'SCRIPT' && p !== 'STYLE' && n.nodeValue.trim()) nodes.push(n); }
      nodes.forEach((x) => { const v = tr(x.nodeValue); if (v !== x.nodeValue) x.nodeValue = v; });
      root.querySelectorAll('[placeholder],[aria-label],[title],[data-i18n-html]').forEach((el) => {
        ['placeholder', 'aria-label', 'title'].forEach((a) => { if (el.hasAttribute(a)) { const v = I.dict[el.getAttribute(a).trim()]; if (v) el.setAttribute(a, v); } });
        const h = el.getAttribute('data-i18n-html');
        if (h && I.dict[h]) el.innerHTML = I.dict[h];
      });
    },
  };
  window.T = I.t;
  document.documentElement.lang = lang;
  const run = () => { I.apply(document.body); if (lang === 'en') document.title = I.dict[document.title] || document.title; };
  if (lang === 'en' && window.MutationObserver) {
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1) I.apply(n);
      else if (n.nodeType === 3 && n.nodeValue.trim()) { const k = n.nodeValue.trim(); if (I.dict[k]) n.nodeValue = n.nodeValue.replace(k, I.dict[k]); }
    }))).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
