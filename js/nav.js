(function () {
  var I = {
    validador: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',

    diretoria: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7"/>',

    standby: '<circle cx="12" cy="12" r="10"/><path d="M10 15V9M14 15V9"/>',

    gerente: '<path d="M18 20V10M12 20V4M6 20v-6"/>',

    parceiros: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',

    regional: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',

    relatorio: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'
  };

  var MENU = [
    { href: 'validador.html', ico: 'validador', rotulo: 'Validação de Documentação', perfis: ['homologador', 'diretoria', 'gerente'] },
    { href: 'diretoria.html', ico: 'diretoria', rotulo: 'Diretoria', perfis: ['diretoria'] },
    { href: 'standby.html',   ico: 'standby',   rotulo: 'Homologações Reprovadas', perfis: ['homologador','diretoria', 'gerente'] },
    { href: 'gerente.html',   ico: 'gerente',   rotulo: 'Gerente', perfis: ['gerente'] },
    { href: 'parceiros.html', ico: 'parceiros', rotulo: 'Parceiros', perfis: ['homologador', 'diretoria', 'gerente'] },
    { href: 'regional.html',  ico: 'regional',  rotulo: 'Regional', perfis: [] },
    { href: 'relatorio.html', ico: 'relatorio', rotulo: 'Relatório Regional', perfis: ['diretoria'] }
  ];

  function perfilUsuario() {
    var s = (window.vdSessao && window.vdSessao()) || null;
    return s && (s.perfil || s.Perfil) || null;
  }

  function podeVer(m) {
    var p = perfilUsuario();
    if (p === 'admin') return true;               
    if (!m.perfis || !m.perfis.length) return false;
    return p && m.perfis.indexOf(p) !== -1;
  }

  var nav = document.getElementById('navPrincipal');
  if (!nav) return;

  var atual = (location.pathname.split('/').pop() || 'validador.html').toLowerCase();

  nav.className = 'tabs';
  nav.setAttribute('aria-label', 'Navegação principal');

  nav.innerHTML = MENU.filter(podeVer).map(function (m) {
    var on = m.href === atual;

    return '<a href="' + m.href + '"' +
      (on ? ' aria-current="page"' : '') + '>' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
      I[m.ico] +
      '</svg>' +
      m.rotulo +
      '</a>';
  }).join('');

})();