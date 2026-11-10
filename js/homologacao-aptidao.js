(function () {
  'use strict';

  if (window.__fluxoHomologacaoCarregado) {
    console.warn('homologacao-aptidao.js já foi carregado, ignorando a segunda execução.');
    return;
  }
  window.__fluxoHomologacaoCarregado = true;

  if (typeof PRAZO_DIAS === 'undefined') window.PRAZO_DIAS = 7;

  const ST = { APT: 'AGUARDANDO_APTIDAO', DIR: 'AGUARDANDO_DIRETORIA', STB: 'STANDBY', LIB: 'LIBERADA' };
  window.HM_PEDIDOS = window.HM_PEDIDOS || [];
  DIR_TXT.APTIDAO = 'Aguardando preenchimento da aptidão';

  const pedido = id => id ? window.HM_PEDIDOS.find(p => String(p.id) === String(id)) : null;
  const eqLocalDoPedido = id => EQ_LOCAIS.find(x => String(x.pedido_id) === String(id));
  const qDaEquipe = eq => (eq && eq.local ? qLocal(eq.key) : null);
  const idDe = r => (r && typeof r === 'object') ? (Array.isArray(r) ? idDe(r[0]) : (r.id || null)) : r;
  const nomeEquipe = (eq, q) => (q && (q.nome || q.equipe || q.name)) || (eq && (eq.nome || eq.equipe || eq.name)) || '';

  function garantirEquipe(p) {
    let q = eqLocalDoPedido(p.id);
    if (!q) {
      q = criarEquipeLocal(p.equipe);
      q.pedido_id = p.id; q.recurso = p.recurso;
      q.apt = { ...APT_TODOS }; q.inapto = false;
      salvarEqLocais(); recarregarEquipes();
    }
    return q;
  }

  function sincronizar() {
    let mudou = false; const novos = [];

    // Fluxo novo (por integrante)
    EQ_LOCAIS.forEach(q => {
      Object.entries(q.ped_membros || {}).forEach(([cpf, pid]) => {
        const p = pedido(pid);
        if (p && p.status === ST.LIB && !mLocal(q, cpf)) novos.push({ q, nome: p.recurso, cpf });
      });
    });

    window.HM_PEDIDOS.forEach(p => {
      const q = eqLocalDoPedido(p.id); if (!q || p.status !== ST.LIB) return;
      if (!q.liberada) {
        q.liberada = true; q.apt = { ...APT_TODOS }; q.inapto = false;
        q.criada_em = p.liberada_em || p.aptidao_em || new Date().toISOString();
        mudou = true;
      }
      if (digitos(p.cpf).length === 11 && !mLocal(q, p.cpf)) novos.push({ q, nome: p.recurso, cpf: p.cpf });
    });

    if (mudou) { salvarEqLocais(); recarregarEquipes(); }
    novos.forEach(({ q, nome, cpf }) => addMembroLocal(q.key, nome, cpf));
  }
  const _hmCarregar = hmCarregar;
  hmCarregar = async function () {
    await _hmCarregar();
    const token = tokenAdm(); if (!token) return;
    try {
      let P = await vdRpc('painel_homologacao_pedidos', { p_token: token });
      if (P && !Array.isArray(P)) P = Array.isArray(P.data) ? P.data : (Array.isArray(P.rows) ? P.rows : []);
      window.HM_PEDIDOS = P || [];
      sincronizar();
    } catch (e) { console.warn('Pedidos de homologação:', e.message); }
  };

  const _dirStatusEq = dirStatusEq;
  dirStatusEq = function (eq) {
    const q = qDaEquipe(eq);
    if (!q || !q.pedido_id) return _dirStatusEq(eq);
    const p = pedido(q.pedido_id);
    if (!p) return q.liberada ? null : 'APTIDAO';
    if (p.status === ST.APT) return 'APTIDAO';
    if (p.status === ST.DIR) return 'AGUARDANDO';
    if (p.status === ST.STB) return 'STANDBY';
    return null;                                 
  };
  const _unidadeEquipe = unidadeEquipe;
  unidadeEquipe = function (eq) {
    const q = qDaEquipe(eq);
    if (q && q.pedido_id && dirStatusEq(eq) !== null) return null;
    return _unidadeEquipe(eq);
  };

  function blocoStatus(eq, q, ds) {
    const p = pedido(q.pedido_id), id = esc(q.pedido_id);
    const rec = esc(q.recurso || (p && p.recurso) || '');
    const resumo = p && p.status !== ST.APT ? `<div class="evid" style="margin-top:6px">Aptidão — ${APT.map(([k, t]) =>
      `${t}: <b style="color:${p['apt_' + k] ? '#16a34a' : '#dc2626'}">${p['apt_' + k] ? 'Apto' : 'Inapto'}</b>`).join(' · ')}
      ${p.apt_motivo ? '<br>Motivo: ' + esc(p.apt_motivo) : ''}${p.apt_anexo ? ' · <a href="' + esc(p.apt_anexo) + '" target="_blank" rel="noopener">anexo</a>' : ''}</div>` : '';
    let cor = '#4f46e5', corpo, acoes = '';
    if (ds === 'APTIDAO') {
      corpo = `📝 <b>Aguardando o preenchimento da Aptidão.</b> Nenhum documento pode ser enviado antes disso.`;
      if (p) acoes = `<button class="primary sm" onclick="aptAbrir('${id}')">Preencher aptidão</button>`;
    } else if (ds === 'AGUARDANDO') {
      corpo = `⏳ <b>Aguardando a diretoria.</b> O envio de documentos e o prazo de ${PRAZO_DIAS} dias só começam depois que ela homologar.`;
      acoes = `<a class="ghost sm" style="padding:6px 12px;border-radius:8px;text-decoration:none;display:inline-block" href="diretoria.html">Abrir análise da diretoria</a>`;
    } else {
      cor = '#d97706';
      corpo = `⏸ <b>Em standby.</b> A equipe só segue se a diretoria reverter.${p && p.diretoria_motivo ? '<br>Motivo: ' + esc(p.diretoria_motivo) : ''}`;
    }
    return `<div class="sec">Fluxo da homologação</div>
      <div class="aviso" style="border-color:${cor}">${corpo}<br>Recurso: <b>${rec}</b>${resumo}</div>
      ${acoes ? `<div class="row noprint" style="margin-top:8px;gap:8px;flex-wrap:wrap">${acoes}</div>` : ''}`;
  }


  function blocoIntegrantesPendentes(q) {
    if (!q || !q.ped_membros) return '';
    const lista = Object.keys(q.ped_membros).map(cpf => pedido(q.ped_membros[cpf])).filter(p => p && p.status !== ST.LIB);
    if (!lista.length) return '';
    return `<div class="sec">Integrantes aguardando liberação</div>` + lista.map(p => {
      const st = p.status === ST.STB
        ? '⏸ <b>Standby</b>' + (p.diretoria_motivo ? ' — ' + esc(p.diretoria_motivo) : '')
        : p.status === ST.APT
          ? '📝 <b>Aguardando aptidão</b>'
          : '⏳ <b>Aguardando a diretoria</b>';
      return `<div class="evid" style="padding:4px 0">${esc(p.recurso)} — ${st}</div>`;
    }).join('') + `<div class="msg" style="margin-top:4px">Os documentos desses integrantes só podem ser enviados depois da liberação.</div>`;
  }

  const _fluxoEquipe = fluxoEquipe;
  fluxoEquipe = function (eq) {
    const q = qDaEquipe(eq);
    if (q && q.pedido_id) {
      const ds = dirStatusEq(eq);
      if (ds) return blocoStatus(eq, q, ds);
      const rec = q.recurso || (pedido(q.pedido_id) || {}).recurso;
      return (rec ? `<p class="msg">Recurso: <b>${esc(rec)}</b></p>` : '') + _fluxoEquipe(eq);
    }
    return blocoIntegrantesPendentes(q) + _fluxoEquipe(eq);
  };


  const _novoEnvioEquipe = novoEnvioEquipe;
  novoEnvioEquipe = function (key) {
    const eq = EQUIPES.find(e => e.key === key);
    if (eq && dirStatusEq(eq) === 'APTIDAO') { alert('Preencha a Aptidão antes de enviar documentos.'); return; }
    _novoEnvioEquipe(key);
  };

  dispararHomologacao = function () {
    hmOverlay('Nova equipe', `
      <p class="dica">Informe o nome da equipe. A <b>Aptidão</b> será pedida de cada integrante, na hora de adicioná-lo (botão <b>+ Integrante</b>).</p>
      <div style="display:grid;gap:10px;margin-top:12px">
        <label>Nome da Equipe<input type="text" id="hmEquipe" placeholder="Ex.: Equipe Pedro Henrique" autocomplete="off"></label>
        <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
        <button class="primary" id="hmGo" onclick="hmEnviar()">Criar equipe</button>
      </div>`);
    setTimeout(() => { const n = document.getElementById('hmEquipe'); if (n) n.focus(); }, 50);
  };

  hmEnviar = function () {
    const equipe = document.getElementById('hmEquipe').value.trim().replace(/\s+/g, ' ');
    if (equipe.length < 2) { document.getElementById('hmErr').textContent = 'Informe o nome da equipe.'; return; }
    const q = criarEquipeLocal(equipe);
    q.liberada = true; q.apt = { ...APT_TODOS }; q.inapto = false;
    q.criada_em = new Date().toISOString();
    q.ped_membros = {};
    salvarEqLocais(); recarregarEquipes();
    F.modo = 'equipe'; if (view === 'home') renderHome();
    hmFechar(); abrirEquipe(q.key);
  };

  const _abrirAddMembro = abrirAddMembro;
  abrirAddMembro = function (key) {
    const eq = EQUIPES.find(e => e.key === key);
    if (!eq || !eq.local) return _abrirAddMembro(key);           
    const ds = dirStatusEq(eq);                                   
    if (ds) { alert('Esta equipe ainda não foi liberada (' + (DIR_TXT[ds] || ds) + '). Não é possível adicionar integrantes.'); return; }

    hmOverlay('Adicionar integrante', `
      <p class="dica">Informe o integrante e preencha a <b>Aptidão</b>. Se tudo estiver <b>Apto</b>, o envio dos documentos dele é liberado. Se houver algum <b>Inapto</b>, o caso vai para a diretoria analisar.</p>
      <div style="display:grid;gap:10px;margin-top:12px">
        <label>Nome<input type="text" id="mbNome" placeholder="Nome completo" autocomplete="off"></label>
        <label>CPF<input type="text" id="mbCpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off"></label>
        <div class="sec" style="margin:4px 0 0">Aptidão (obrigatório)</div>
        <div>${APT.map(aptLinha).join('')}</div>
        <div id="aptBox" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px">
          <label>Motivo de não estar apto (obrigatório)
            <textarea id="aptMotivo" rows="4" placeholder="Descreva o motivo para a diretoria analisar..." style="width:100%"></textarea></label>
          <label style="margin-top:8px;display:block">Anexo (opcional)
            <input type="file" id="aptAnexo" accept=".pdf,image/*,.doc,.docx"></label>
          <div class="msg" style="margin-top:6px">Todas as informações serão enviadas para a diretoria.</div>
        </div>
        <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
        <button class="primary" id="mbGo" onclick="mbAptConfirmar('${esc(key)}')">Confirmar integrante</button>
      </div>`);
    setTimeout(() => { const n = document.getElementById('mbNome'); if (n) n.focus(); }, 50);
  };

  async function mbAptConfirmar(key) {
    const eq = EQUIPES.find(e => e.key === key), q = qLocal(key);
    const err = m => { document.getElementById('hmErr').textContent = m; };
    if (!eq || !q) return err('Equipe não encontrada. Feche e abra a equipe novamente.');

    const nome = document.getElementById('mbNome').value.trim().replace(/\s+/g, ' ');
    const cpf = digitos(document.getElementById('mbCpf').value);
    if (nome.length < 3) return err('Informe o nome do integrante.');
    if (cpf.length !== 11) return err('Informe um CPF válido com 11 dígitos.');
    if (mLocal(q, cpf) || (q.ped_membros || {})[cpf]) return err('Este CPF já foi adicionado nesta equipe.');

    const apto = {}; APT.forEach(([k]) => apto[k] = aptValor(k));
    const inaptos = APT.filter(([k]) => !apto[k]).map(([, t]) => t);
    let motivo = null, arq = null;
    if (inaptos.length) {
      motivo = document.getElementById('aptMotivo').value.trim();
      if (motivo.length < 10) return err('Informe o motivo da inaptidão (mínimo 10 caracteres).');
      arq = document.getElementById('aptAnexo').files[0] || null;
      if (arq && arq.size > 10 * 1048576) return err('Anexo acima de 10 MB.');
    }
    const token = tokenAdm();
    if (!token) return err('Sessão sem token. Entre novamente.');

    const b = document.getElementById('mbGo'); b.disabled = true; b.textContent = 'Salvando...'; err('');
    const hdr = { apikey: VDSB.SUPABASE_ANON_KEY };
    let caminho = null, subiu = false, id = null;
    try {

      id = idDe(await vdRpc('painel_homologacao_criar', {
        p_token: token, p_equipe: nomeEquipe(eq, q), p_recurso: nome

      }));
      if (!id) throw new Error('O servidor não devolveu o ID do pedido.');

  
      let link = null;
      if (arq) {
        const seg = arq.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
        caminho = `homologacao/pedido-${id}/${Date.now()}_${seg}`;
        const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`,
          { method: 'POST', body: arq, headers: { ...hdr, 'Content-Type': arq.type || 'application/octet-stream' } });
        if (!up.ok) { const j = await up.json().catch(() => null); throw new Error((j && (j.message || j.error)) || 'upload do anexo ' + up.status); }
        subiu = true; link = linkStorage(caminho);
      }

      await vdRpc('painel_homologacao_aptidao', {
        p_token: token, p_id: id,
        p_trabalhista: apto.trabalhista, p_tecnico: apto.tecnico, p_patrimonial: apto.patrimonial,
        p_motivo: motivo, p_anexo: link
      });

      q.ped_membros = q.ped_membros || {};
      q.ped_membros[cpf] = id;
      salvarEqLocais();

      await hmCarregar();                                        
      const p = pedido(id) || { id, equipe: nomeEquipe(eq, q), recurso: nome };
      if (inaptos.length) aptEnviadaDiretoria(p, inaptos, !!arq);
      else aptLiberada(p);
      if (view === 'home' || view === 'equipe') render();
    } catch (e) {
      if (subiu) { try { await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`, { method: 'DELETE', headers: hdr }); } catch (_) {} }
      b.disabled = false; b.textContent = 'Confirmar integrante'; err('Não foi possível salvar: ' + e.message);
    }
  }

  function aptAbrir(id) {
    const p = pedido(id);
    if (!p) { alert('Pedido não encontrado. Feche e abra as homologações novamente.'); return; }
    if (p.status !== ST.APT) { alert('A aptidão deste pedido já foi preenchida.'); return; }
    hmOverlay('Aptidão (obrigatório)', `
      <p class="dica"><b>${esc(p.equipe)}</b> · Recurso: <b>${esc(p.recurso)}</b></p>
      <p class="dica">Se algum item estiver <b>Inapto</b>, o caso vai para a diretoria analisar. Se todos estiverem <b>Aptos</b>, o envio da documentação é liberado.</p>
      <div style="display:grid;gap:10px;margin-top:12px">
        <div>${APT.map(aptLinha).join('')}</div>
        <div id="aptBox" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px">
          <label>Motivo de não estar apto (obrigatório)
            <textarea id="aptMotivo" rows="4" placeholder="Descreva o motivo para a diretoria analisar..." style="width:100%"></textarea></label>
          <label style="margin-top:8px;display:block">Anexo (opcional)
            <input type="file" id="aptAnexo" accept=".pdf,image/*,.doc,.docx"></label>
          <div class="msg" style="margin-top:6px">Todas as informações serão enviadas para a diretoria.</div>
        </div>
        <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
        <button class="primary" id="aptGo" onclick="aptConfirmar('${esc(p.id)}')">Confirmar aptidão</button>
      </div>`);
  }

  async function aptConfirmar(id) {
    const p = pedido(id); if (!p) return;
    const err = m => { document.getElementById('hmErr').textContent = m; };
    const apto = {}; APT.forEach(([k]) => apto[k] = aptValor(k));
    const inaptos = APT.filter(([k]) => !apto[k]).map(([, t]) => t);
    let motivo = null, arq = null;
    if (inaptos.length) {
      motivo = document.getElementById('aptMotivo').value.trim();
      if (motivo.length < 10) return err('Informe o motivo da inaptidão (mínimo 10 caracteres).');
      arq = document.getElementById('aptAnexo').files[0] || null;
      if (arq && arq.size > 10 * 1048576) return err('Anexo acima de 10 MB.');
    }
    const token = tokenAdm();
    if (!token) return err('Sessão sem token. Entre novamente.');

    const b = document.getElementById('aptGo'); b.disabled = true; b.textContent = 'Salvando...'; err('');
    const hdr = { apikey: VDSB.SUPABASE_ANON_KEY };
    let caminho = null, subiu = false;
    try {
      let link = null;
      if (arq) {
        const seg = arq.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
        caminho = `homologacao/pedido-${p.id}/${Date.now()}_${seg}`;
        const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`,
          { method: 'POST', body: arq, headers: { ...hdr, 'Content-Type': arq.type || 'application/octet-stream' } });
        if (!up.ok) { const j = await up.json().catch(() => null); throw new Error((j && (j.message || j.error)) || 'upload do anexo ' + up.status); }
        subiu = true; link = linkStorage(caminho);
      }
      await vdRpc('painel_homologacao_aptidao', {
        p_token: token, p_id: p.id,
        p_trabalhista: apto.trabalhista, p_tecnico: apto.tecnico, p_patrimonial: apto.patrimonial,
        p_motivo: motivo, p_anexo: link
      });
      await hmCarregar();
      const atual = pedido(id) || p;
      if (inaptos.length) aptEnviadaDiretoria(atual, inaptos, !!arq);
      else { garantirEquipe(atual); sincronizar(); aptLiberada(atual); }
      if (view === 'home' || view === 'equipe') render();
    } catch (e) {
      if (subiu) { try { await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`, { method: 'DELETE', headers: hdr }); } catch (_) {} }
      b.disabled = false; b.textContent = 'Confirmar aptidão'; err('Não foi possível salvar: ' + e.message);
    }
  }

  const linkPedido = p => `${location.origin}/loginTecnico.html?homologacao=${encodeURIComponent(p.id)}&nome=${encodeURIComponent(p.recurso)}`;

  function aptLiberada(p) {
    const link = linkPedido(p);
    const msg = `Olá ${String(p.recurso).split(' ')[0]}! Para iniciar sua homologação, faça seu cadastro e envie seus documentos por aqui: ${link}`;
    const base = p.liberada_em ? new Date(p.liberada_em) : new Date();
    const venc = new Date(base.getTime() + PRAZO_DIAS * 864e5).toLocaleDateString('pt-BR');
    const eqL = eqLocalDoPedido(p.id) || EQ_LOCAIS.find(x => Object.values(x.ped_membros || {}).some(v => String(v) === String(p.id)));
    hmOverlay('Envio de documentos liberado', `
      <p class="dica"><b>${esc(p.equipe)}</b> · Recurso: <b>${esc(p.recurso)}</b></p>
      <p class="dica">Aptidão OK nos 3 itens. Prazo para homologar: até <b>${venc}</b> (${PRAZO_DIAS} dias).</p>
      <input type="text" id="aptLink" readonly value="${esc(link)}" onfocus="this.select()" style="margin-top:10px">
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="ghost" onclick="hmCopiar('aptLink')">📋 Copiar link</button>
        <a class="primary" style="padding:8px 14px;border-radius:8px;text-decoration:none;display:inline-block"
           target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>
        ${eqL ? `<button class="primary" onclick="aptAbrirEquipe('${esc(p.id)}')">Abrir a equipe</button>` : ''}
      </div>`);
  }

  function aptEnviadaDiretoria(p, inaptos, comAnexo) {
    hmOverlay('Enviado para a diretoria', `
      <p class="dica"><b>${esc(p.equipe)}</b> · Recurso: <b>${esc(p.recurso)}</b></p>
      <p class="dica">Inapto em: <b>${esc(inaptos.join(', '))}</b>${comAnexo ? ' · com anexo' : ''}.</p>
      <p class="dica">O envio de documentos deste recurso fica bloqueado até a decisão da diretoria. Se ela <b>aprovar</b>, o envio é liberado e o prazo de ${PRAZO_DIAS} dias começa;
        se <b>reprovar</b>, o recurso fica em <b>Standby</b>.</p>
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <a class="ghost" style="padding:8px 14px;border-radius:8px;text-decoration:none;display:inline-block" href="diretoria.html">Abrir análise da diretoria</a>
      </div>`);
  }

  function aptAbrirEquipe(id) {
    const p = pedido(id); if (!p) return;
    let q = EQ_LOCAIS.find(x => Object.values(x.ped_membros || {}).some(v => String(v) === String(id)));
    if (!q) q = garantirEquipe(p);
    sincronizar();
    hmFechar(); abrirEquipe(q.key);
  }
  function aptVerLink(id) { const p = pedido(id); if (p) aptLiberada(p); }

  function blocoPedidos() {
    const P = window.HM_PEDIDOS || [];
    const pend = P.filter(p => p.status === ST.APT);
    const nDir = P.filter(p => p.status === ST.DIR).length, nStb = P.filter(p => p.status === ST.STB).length;
    if (!pend.length && !nDir && !nStb) return '';
    let h = '<div id="aptPedidos">';
    if (nDir || nStb) h += `<p class="msg">Pedidos: ⏳ ${nDir} aguardando a diretoria · <a href="diretoria.html">abrir</a> &nbsp;|&nbsp; ⏸ ${nStb} em standby</p>`;
    if (pend.length) {
      h += `<div class="sec" style="margin:10px 0 0">Aguardando aptidão (${pend.length})</div>` + pend.map(p =>
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #e5e7eb">
          <div><b>${esc(p.equipe)}</b><div class="evid">Recurso: ${esc(p.recurso)}</div></div>
          <button class="primary sm" onclick="aptAbrir('${esc(p.id)}')">Preencher aptidão</button></div>`).join('');
    }
    return h + '</div>';
  }

  const _abrirHomologacoes = abrirHomologacoes;
  abrirHomologacoes = async function (filtro, modo) {
    await _abrirHomologacoes(filtro, modo);
    const o = document.getElementById('hmOv'), p = o && o.querySelector('p.dica');
    const bp = blocoPedidos();
    if (p && bp) p.insertAdjacentHTML('afterend', bp);
  };

  window.aptAbrir = aptAbrir;
  window.aptConfirmar = aptConfirmar;
  window.aptAbrirEquipe = aptAbrirEquipe;
  window.aptVerLink = aptVerLink;
  window.mbAptConfirmar = mbAptConfirmar;

  hmCarregar().then(() => { if (typeof render === 'function') render(); });
})();