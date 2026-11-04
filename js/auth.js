(function () {
  'use strict';

  var SUPABASE_URL = 'https://jedjrzxewklahainnyfn.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK';
  var LOGIN = 'index.html';

  function ler() {
    try { return JSON.parse(localStorage.getItem('vd_sess') || sessionStorage.getItem('vd_sess') || 'null'); }
    catch (_) { return null; }
  }
  function limpar() {
    try { localStorage.removeItem('vd_sess'); sessionStorage.removeItem('vd_sess'); } catch (_) {}
  }
  function irLogin() { location.replace(LOGIN); }

  async function rpc(fn, args) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(args || {})
    });
    return r.json();
  }

  window.vdSessao = ler;
  window.vdSair = async function () {
    var s = ler();
    try { if (s && s.token) await rpc('vd_logout', { p_token: s.token }); } catch (_) {}
    limpar();
    irLogin();
  };

  var s = ler();
  if (!s || !s.token || s.exp < Date.now()) { limpar(); irLogin(); return; }
  var estilo = document.createElement('style');
  estilo.textContent = 'html{visibility:hidden}';
  document.head.appendChild(estilo);
  function mostrar() { if (estilo.parentNode) estilo.parentNode.removeChild(estilo); }

  function montarBarra(info) {
    function inserir() {
      var acts = document.querySelector('.top .acts') || document.querySelector('.acts');
      if (!acts || document.getElementById('vdUser')) return;
      var nome = document.createElement('span');
      nome.id = 'vdUser';
      nome.style.cssText = 'font-size:13px;margin-right:6px;align-self:center';
      nome.textContent = (info && (info.nome || info.usuario)) || s.nome || s.usuario || '';
      var b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = 'Sair';
      b.onclick = window.vdSair;
      acts.appendChild(nome);
      acts.appendChild(b);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inserir);
    else inserir();
  }

  rpc('vd_verificar', { p_token: s.token })
    .then(function (j) {
      if (j && j.ok) { mostrar(); montarBarra(j); }
      else if (j && j.sessao_expirada) { limpar(); irLogin(); }
      else { mostrar(); montarBarra(null); }  
    })
    .catch(function () { mostrar(); montarBarra(null); });
})();