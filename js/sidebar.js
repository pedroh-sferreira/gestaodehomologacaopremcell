(function () {
  'use strict';

  var KEY = 'premcell.sidebar.collapsed';         
  var root = document.documentElement;
  var mqMobile = window.matchMedia('(max-width:760px)');
  var sb = document.getElementById('sidebar');
  var btnToggle = document.getElementById('sbToggle');
  var btnOpen = document.getElementById('sbOpen');
  var overlay = document.getElementById('sbOverlay');
  var nav = document.getElementById('navPrincipal');
  if (!sb) return;

  function isMobile() { return mqMobile.matches; }
  function savePref(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }

  function syncAria() {
    var mob = isMobile(), open = root.classList.contains('sb-open'), col = root.classList.contains('sb-collapsed');
    if (btnToggle) {
      btnToggle.setAttribute('aria-expanded', String(mob ? open : !col));
      btnToggle.setAttribute('aria-label', mob ? 'Fechar menu' : (col ? 'Expandir menu' : 'Recolher menu'));
      btnToggle.title = btnToggle.getAttribute('aria-label');
    }
    if (btnOpen) btnOpen.setAttribute('aria-expanded', String(open));
  }
  function setCollapsed(v) {
    root.classList.toggle('sb-collapsed', v);
    savePref(v);
    hideTip();
    syncAria();
  }

  function openDrawer() { root.classList.add('sb-open'); syncAria(); if (btnToggle) btnToggle.focus(); }
  function closeDrawer(returnFocus) {
    root.classList.remove('sb-open'); syncAria();
    if (returnFocus && btnOpen) btnOpen.focus();
  }

  if (btnToggle) btnToggle.addEventListener('click', function () {
    if (isMobile()) closeDrawer(true); else setCollapsed(!root.classList.contains('sb-collapsed'));
  });
  if (btnOpen) btnOpen.addEventListener('click', openDrawer);
  if (overlay) overlay.addEventListener('click', function () { closeDrawer(true); });

  sb.addEventListener('click', function (e) {
    if (isMobile() && e.target.closest('#navPrincipal a, .sb-acts button')) closeDrawer(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('sb-open')) closeDrawer(true);
  });
  function onViewport() { if (!isMobile()) root.classList.remove('sb-open'); hideTip(); syncAria(); }
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', onViewport); else mqMobile.addListener(onViewport);

  var tip = document.createElement('div');
  tip.className = 'sb-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'sbTip';
  document.body.appendChild(tip);

  function showTip(el) {
    if (isMobile() || !root.classList.contains('sb-collapsed')) return;
    var txt = el.getAttribute('data-tip');
    if (!txt) return;
    tip.textContent = txt;
    var r = el.getBoundingClientRect();
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top = (r.top + r.height / 2 - tip.offsetHeight / 2) + 'px';
    tip.classList.add('on');
  }
  function hideTip() { tip.classList.remove('on'); }
  sb.addEventListener('mouseover', function (e) { var t = e.target.closest('[data-tip]'); if (t) showTip(t); });
  sb.addEventListener('mouseout', function (e) { if (e.target.closest('[data-tip]')) hideTip(); });
  sb.addEventListener('focusin', function (e) { var t = e.target.closest('[data-tip]'); if (t) showTip(t); });
  sb.addEventListener('focusout', hideTip);
  var navBox = sb.querySelector('.sb-nav');
  if (navBox) navBox.addEventListener('scroll', hideTip);
  var P = {
    home:  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    build: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01',
    money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
    map:   'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    file:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8'
  };
  var RULES = [
    [/inicio|home|colaborador|painel/, 'home'],
    [/parceir|clinica|treinamento/, 'build'],
    [/custo|negocia|valor/, 'money'],
    [/aprova|gerente|homolog/, 'check'],
    [/regional|regiao/, 'map'],
    [/usuario|login|equipe/, 'users']
  ];
  function pickIcon(text) {
    var t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(t)) return P[RULES[i][1]];
    return P.file;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function enhance() {
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
      if (a.getAttribute('data-sb-done')) return;
      var text = a.textContent.replace(/\s+/g, ' ').trim();
      var svg = a.querySelector('svg');
      Array.prototype.slice.call(a.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.nodeValue.trim()) {
          var s = document.createElement('span'); s.className = 'sb-label';
          a.replaceChild(s, n); s.appendChild(n);
        } else if (n.nodeType === 1 && n !== svg && n.tagName !== 'IMG') {
          n.classList.add('sb-label');
        }
      });
      if (svg) {
        svg.classList.add('sb-ico');
      } else {
        svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'sb-ico');
        var p = document.createElementNS(NS, 'path'); p.setAttribute('d', pickIcon(text));
        svg.appendChild(p); a.insertBefore(svg, a.firstChild);
      }
      a.setAttribute('data-tip', text);
      a.setAttribute('data-sb-done', '1');
    });
  }
  enhance();
  if (nav && window.MutationObserver) new MutationObserver(enhance).observe(nav, { childList: true, subtree: true });

  syncAria();
})();