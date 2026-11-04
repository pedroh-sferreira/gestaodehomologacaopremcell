const APT = [['trabalhista', 'Trabalhista'], ['tecnico', 'Técnico'], ['patrimonial', 'Patrimonial']];
let HOMOL_FORA = [];  

hmCarregar = async function () {
  const token = tokenAdm(); if (!token) return;
  try {
    const L = await vdRpc('painel_homologacoes_apt', { p_token: token }) || [];
    HOMOL = L.filter(h => !h.status_diretoria || h.status_diretoria === 'APROVADA');
    HOMOL_FORA = L.filter(h => h.status_diretoria === 'AGUARDANDO' || h.status_diretoria === 'STANDBY');
  } catch (e) { console.warn('Homologações:', e.message); }
};

const _abrirHomologacoes = abrirHomologacoes;
abrirHomologacoes = async function (filtro) {
  await _abrirHomologacoes(filtro);
  const o = document.getElementById('hmOv'), p = o && o.querySelector('p.dica');
  if (!p || !HOMOL_FORA.length) return;
  const nA = HOMOL_FORA.filter(h => h.status_diretoria === 'AGUARDANDO').length;
  const nS = HOMOL_FORA.length - nA;
  p.insertAdjacentHTML('afterend', `<p class="msg">⏳ ${nA} aguardando a diretoria · <a href="diretoria.html">abrir</a>
    &nbsp;|&nbsp; ⏸ ${nS} em standby · <a href="standby.html">ver</a></p>`);
};


const aptValor = k => { const r = document.querySelector(`input[name="apt_${k}"]:checked`); return !r || r.value === 'apto'; };

function aptLinha([k, t]) {
  const op = (v, rot) => `<label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer">
    <input type="radio" name="apt_${k}" value="${v}" ${v === 'apto' ? 'checked' : ''} onchange="aptAtualizar()" style="width:auto;margin:0"> ${rot}</label>`;
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #e5e7eb">
    <b>${t}</b><span style="display:flex;gap:16px">${op('apto', 'Apto')}${op('inapto', 'Inapto')}</span></div>`;
}

function aptAtualizar() {
  const inapto = APT.some(([k]) => !aptValor(k));
  const b = document.getElementById('aptBox'); if (!b) return;
  b.style.display = inapto ? 'block' : 'none';
  if (!inapto) {
    document.getElementById('aptMotivo').value = '';
    document.getElementById('aptAnexo').value = '';
  }
}

dispararHomologacao = function () {
  hmOverlay('Disparar homologação', `
    <p class="dica">Se algum item estiver <b>Inapto</b>, o caso vai para a análise da diretoria antes de seguir. O prazo de ${PRAZO_DIAS} dias só começa quando a diretoria homologar.</p>
    <div style="display:grid;gap:10px;margin-top:12px">
      <label>Nome do técnico<input type="text" id="hmNome" placeholder="Nome completo" autocomplete="off"></label>
      <label>CPF<input type="text" id="hmCpf" placeholder="000.000.000-00" inputmode="numeric" oninput="maskCpf(this)"></label>
      <div><div class="sec" style="margin:4px 0 0">Aptidão</div>${APT.map(aptLinha).join('')}</div>
      <div id="aptBox" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px">
        <label>Motivo de não estar apto (obrigatório)
          <textarea id="aptMotivo" rows="4" placeholder="Descreva o motivo para a diretoria analisar..." style="width:100%"></textarea></label>
        <label style="margin-top:8px;display:block">Anexo (opcional)
          <input type="file" id="aptAnexo" accept=".pdf,image/*,.doc,.docx"></label>
        <div class="msg" style="margin-top:6px">Todas as informações serão enviadas para a diretoria.</div>
      </div>
      <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
      <button class="primary" id="hmGo" onclick="hmEnviar()">Disparar</button>
    </div>`);
  setTimeout(() => { const n = document.getElementById('hmNome'); if (n) n.focus(); }, 50);
};

function hmSucesso(nome, cpf, cep) {
  const link = `${location.origin}/loginTecnico.html?cpf=${cpf}&nome=${encodeURIComponent(nome)}`;
  const msg = `Olá ${nome.split(' ')[0]}! Para iniciar sua homologação, faça seu cadastro e envie seus documentos por aqui: ${link}`;
  const venc = new Date(Date.now() + PRAZO_DIAS * 864e5).toLocaleDateString('pt-BR');
  hmOverlay('Homologação disparada', `
    <p class="dica"><b>${esc(nome)}</b> · CPF ${esc(fmtCpf(cpf))} · CEP ${esc(fmtCep(cep))}</p>
    <p class="dica">Prazo para homologar: até <b>${venc}</b> (${PRAZO_DIAS} dias).</p>
    <input type="text" id="hmLink" readonly value="${esc(link)}" onfocus="this.select()" style="margin-top:10px">
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="ghost" onclick="hmCopiar()">📋 Copiar link</button>
      <a class="primary" style="padding:8px 14px;border-radius:8px;text-decoration:none;display:inline-block"
         target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>
    </div>`);
}

function hmEnviadaDiretoria(nome, cpf, cep, inaptos, comAnexo) {
  hmOverlay('Enviado para a diretoria', `
    <p class="dica"><b>${esc(nome)}</b> · CPF ${esc(fmtCpf(cpf))} · CEP ${esc(fmtCep(cep))}</p>
    <p class="dica">Inapto em: <b>${esc(inaptos.join(', '))}</b>${comAnexo ? ' · com anexo' : ''}.</p>
    <p class="dica">O caso aguarda a decisão da diretoria. Se for <b>Autorizado homologar</b>, seguirá o trâmite normal e o link do técnico é liberado;
      se não, a equipe fica em <b>Standby</b>.</p>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <a class="ghost" style="padding:8px 14px;border-radius:8px;text-decoration:none;display:inline-block" href="diretoria.html">Abrir análise da diretoria</a>
    </div>`);
}

hmEnviar = async function () {
  const nome = document.getElementById('hmNome').value.trim();
  const cpf = digitos(document.getElementById('hmCpf').value);
  const cep = digitos(document.getElementById('hmCep').value);
  const err = m => { document.getElementById('hmErr').textContent = m; };
  if (nome.length < 3) return err('Informe o nome do técnico.');
  if (!cpfOk(cpf)) return err('CPF inválido.');
  if (cep.length !== 8) return err('CEP deve ter 8 dígitos.');

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

  const b = document.getElementById('hmGo'); b.disabled = true; b.textContent = 'Disparando...'; err('');
  const hdr = { apikey: VDSB.SUPABASE_ANON_KEY };
  let caminho = null, subiu = false;
  try {
    let link = null;
    if (arq) {
      const seg = arq.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
      caminho = `homologacao/${cpf}/${Date.now()}_${seg}`;
      const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`,
        { method: 'POST', body: arq, headers: { ...hdr, 'Content-Type': arq.type || 'application/octet-stream' } });
      if (!up.ok) { const j = await up.json().catch(() => null); throw new Error((j && (j.message || j.error)) || 'upload do anexo ' + up.status); }
      subiu = true; link = linkStorage(caminho);
    }
    await vdRpc('painel_homologacao_disparar_apt', {
      p_token: token, p_nome: nome, p_cpf: cpf, p_cep: cep,
      p_trabalhista: apto.trabalhista, p_tecnico: apto.tecnico, p_patrimonial: apto.patrimonial,
      p_motivo: motivo, p_anexo: link
    });
    if (inaptos.length) hmEnviadaDiretoria(nome, cpf, cep, inaptos, !!arq);
    else hmSucesso(nome, cpf, cep);
    hmCarregar();
  } catch (e) {
    if (subiu) { try { await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`, { method: 'DELETE', headers: hdr }); } catch (_) {} }
    b.disabled = false; b.textContent = 'Disparar'; err('Não foi possível disparar: ' + e.message);
  }
};

hmCarregar().then(hmReconciliar);  