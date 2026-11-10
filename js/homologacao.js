console.info('homologacao.js v12 (nome do integrante resolvido pelo CPF + equipes + aptidão + diretoria + custo por lista de itens + card único + parcelas corrigidas + modais SaaS de custo) carregado');
const ALERTA_DIAS = 3;

const APT = [['trabalhista', 'Trabalhista'], ['tecnico', 'Técnico'], ['patrimonial', 'Patrimonial']];
const APT_TODOS = { trabalhista: true, tecnico: true, patrimonial: true };
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const cpfOk = s => {
  const d = digitos(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => { let t = 0; for (let i = 0; i < n; i++) t += +d[i] * (n + 1 - i); t = (t * 10) % 11; return t === 10 ? 0 : t; };
  return dv(9) === +d[9] && dv(10) === +d[10];
};
const maskCpf = i => { const d = digitos(i.value).slice(0, 11); i.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); };
const fmtCep = s => { const d = digitos(s); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (s || ''); };

let HOMOL = [];
let HOMOL_FORA = [];
let HM_MODO = 'equipes';
const NOMES_CACHE_KEY = 'hm_nomes_db_v1';
let NOMES_DB = (() => {
  try { return JSON.parse(localStorage.getItem(NOMES_CACHE_KEY) || '{}') || {}; } catch (_) { return {}; }
})();

const qLocal = key => EQ_LOCAIS.find(x => x.key === key);
const mLocal = (q, cpf) => q && q.membros.find(m => digitos(m.cpf) === digitos(cpf));

const NOME_PLACEHOLDER = /^(instalador|l[ií]der)\s+\d+$/i;
const nomeValido = n => { n = String(n || '').trim(); return n && !NOME_PLACEHOLDER.test(n) ? n : ''; };
function nomeCpf(cpf, fallback) {
  const c = digitos(cpf);
  if (c.length === 11) {
    if (NOMES_DB[c]) return NOMES_DB[c];
    const h = HOMOL.concat(HOMOL_FORA).find(x => digitos(x.cpf) === c);
    if (nomeValido(fallback)) return String(fallback).trim();
    if (h && nomeValido(h.nome)) return h.nome;
    const col = COLABS.find(x => !x.sem && x.cpf === c);
    if (col && nomeValido(col.nome)) return col.nome;
  }
  return String(fallback || '').trim();
}
const nomeMembro = m => m ? nomeCpf(m.cpf, m.nome) : '';

function hmOverlay(titulo, corpo, largo, cls, sub) {
  let o = document.getElementById('hmOv');
  if (!o) {
    o = document.createElement('div'); o.id = 'hmOv';
    o.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto';
    o.onclick = e => { if (e.target === o) hmFechar(); };
    document.body.appendChild(o);
  }
  o.className = cls === 'neg' ? 'hmOvNeg' : '';
  if (cls === 'neg') {
    o.innerHTML = `<div class="card negModal" style="max-width:${largo ? 1040 : 560}px;width:100%;margin:0">
      <div class="negMHead">
        <div class="negMTit"><h2>${esc(titulo)}</h2>${sub ? `<div class="negMSub">${esc(sub)}</div>` : ''}</div>
        <button type="button" class="negClose" onclick="hmFechar()" aria-label="Fechar">✕</button>
      </div>
      <div class="negMBody">${corpo}</div></div>`;
    return;
  }
  o.innerHTML = `<div class="card" style="max-width:${largo ? 1000 : 560}px;width:100%;margin:0">
    <div class="chead"><h2>${esc(titulo)}</h2><button class="ghost sm" onclick="hmFechar()">Fechar</button></div>${corpo}</div>`;
}
function hmFechar() { const o = document.getElementById('hmOv'); if (o) o.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') hmFechar(); });

async function hmCarregarNomes() {
  const token = tokenAdm(); if (!token) return;
  try {
    const L = await vdRpc('painel_nomes_por_cpf', { p_token: token }) || [];
    const mapa = {};
    L.forEach(r => { const c = digitos(r.cpf); if (c.length === 11 && r.nome) mapa[c] = String(r.nome).trim(); });
    NOMES_DB = mapa;
    try { localStorage.setItem(NOMES_CACHE_KEY, JSON.stringify(mapa)); } catch (_) {}
  } catch (e) { console.warn('Nomes por CPF:', e.message); }
}

function hmCorrigirNomesLocais() {
  let mudou = false;
  EQ_LOCAIS.forEach(q => {
    const porCpf = new Map(), lista = [];
    (q.membros || []).forEach(x => {
      const c = digitos(x.cpf);
      const certo = NOMES_DB[c];
      if (certo && certo !== x.nome) { x.nome = certo; mudou = true; }
      if (c.length === 11 && porCpf.has(c)) {    
        const ja = porCpf.get(c);
        if (x.lider) ja.lider = true;
        if (!ja.uf && x.uf) ja.uf = x.uf;
        mudou = true;
        return;
      }
      if (c.length === 11) porCpf.set(c, x);
      lista.push(x);
    });
    q.membros = lista;
  });
  if (mudou) salvarEqLocais();
  return mudou;
}

function hmCorrigirColabs(lista) {
  let mudou = false;
  (lista || COLABS || []).forEach(g => {
    if (!g || g.sem) return;
    const c = digitos(g.cpf);
    if (c.length !== 11) return;
    const h = HOMOL.concat(HOMOL_FORA).find(x => digitos(x.cpf) === c);
    const certo = NOMES_DB[c] || (h && nomeValido(h.nome) ? h.nome : '');
    if (certo && certo !== g.nome) { g.nome = certo; mudou = true; }
  });
  return mudou;
}
async function hmCarregar() {
  const token = tokenAdm(); if (!token) return;
  try {
    await hmCarregarNomes();
    const L = await vdRpc('painel_homologacoes_apt', { p_token: token }) || [];
    HOMOL = L.filter(h => !h.status_diretoria || h.status_diretoria === 'APROVADA');
    HOMOL_FORA = L.filter(h => h.status_diretoria === 'AGUARDANDO' || h.status_diretoria === 'STANDBY');
    const a = hmCorrigirNomesLocais();
    const b = hmCorrigirColabs();
    if ((a || b) && typeof render === 'function') render();  
  } catch (e) { console.warn('Homologações:', e.message); }
}
async function hmRegistrarApt(m, apto, motivo, anexo, uf) {
  const token = tokenAdm(); if (!token) throw new Error('Sessão sem token. Entre novamente.');
  const a = apto || APT_TODOS;
  try {
    await vdRpc('painel_homologacao_disparar_apt', {
      p_token: token, p_nome: nomeCpf(m.cpf, m.nome), p_cpf: digitos(m.cpf), p_cep: null,
      p_trabalhista: !!a.trabalhista, p_tecnico: !!a.tecnico, p_patrimonial: !!a.patrimonial,
      p_motivo: motivo || null, p_anexo: anexo || null
    });
  } catch (e) {
    if (!/homologacoes_cpf_aberta|duplicate key/i.test(e.message)) throw e;
  }
  if (uf) await hmSalvarEstado(m.cpf, uf);
}

async function hmSalvarEstado(cpf, uf) {
  try { await vdRpc('painel_homologacao_estado', { p_token: tokenAdm(), p_cpf: digitos(cpf), p_estado: uf }); }
  catch (e) { console.warn('Estado de atuação:', e.message); toastDl('⚠ Estado de atuação não foi salvo no banco: ' + e.message, true); }
}
async function hmVincularEquipe(key, verbose) {
  const token = tokenAdm(); if (!token) return;
  const eq = EQUIPES.find(e => e.key === key); if (!eq) return;
  const lid = eq.membros.find(m => m.lider);
  if (!lid || digitos(lid.cpf).length !== 11) {
    if (verbose) toastDl('Defina o líder da equipe (★) para liberar o acesso dos integrantes.', true);
    return;
  }
  const membros = eq.membros.filter(m => digitos(m.cpf).length === 11).map(m => ({ cpf: digitos(m.cpf), nome: nomeMembro(m) }));
  try {
    const r = await vdRpc('painel_equipe_vincular', { p_token: token, p_lider_cpf: digitos(lid.cpf), p_membros: membros });
    const conf = (r && r.conflitos) || [];
    if (conf.length) alert('Estas pessoas já pertencem à equipe de outro líder e não foram vinculadas:\n' + conf.map(c => (c.nome || '') + ' — ' + fmtCpf(c.cpf)).join('\n'));
    else if (verbose) toastDl('Acesso vinculado: os integrantes entram direto na equipe ao fazer login.', true);
  } catch (e) { toastDl('⚠ Vínculo da equipe não foi salvo: ' + e.message, true); }
}
async function hmDesvincular(cpfs) {
  const token = tokenAdm(); if (!token) return;
  for (const c of (cpfs || [])) {
    if (digitos(c).length !== 11) continue;
    try { await vdRpc('painel_equipe_desvincular', { p_token: token, p_cpf: digitos(c) }); }
    catch (e) { console.warn('Desvincular:', e.message); }
  }
}
function dirStatusEq(eq) {
  const q = eq && eq.local ? qLocal(eq.key) : null;
  if (!q || !q.inapto) return null;
  const cpfs = eq.membros.map(m => digitos(m.cpf)).filter(c => c.length === 11);
  if (!cpfs.length) return 'SEM_ENVIO';
  const fora = HOMOL_FORA.filter(h => cpfs.includes(digitos(h.cpf)));
  if (fora.some(h => h.status_diretoria === 'STANDBY')) return 'STANDBY';
  if (fora.some(h => h.status_diretoria === 'AGUARDANDO')) return 'AGUARDANDO';
  return cpfs.every(c => HOMOL.some(h => digitos(h.cpf) === c)) ? 'APROVADA' : 'SEM_ENVIO';
}
const DIR_TXT = { SEM_ENVIO: 'Não enviada à diretoria', AGUARDANDO: 'Aguardando a diretoria', STANDBY: 'Em standby', APROVADA: 'Homologada pela diretoria' };

const _addMembroLocal = addMembroLocal;
addMembroLocal = function (key, nome, cpf) {
  const q = qLocal(key), novo = !!q && !mLocal(q, cpf);
  const ok = _addMembroLocal(key, nome, cpf);
  if (ok && q && q.uf) { const mm = mLocal(q, cpf); if (mm && !mm.uf) { mm.uf = q.uf; salvarEqLocais(); } }
  if (ok && novo && tokenAdm()) {
    hmRegistrarApt({ nome: nome || mLocal(q, cpf).nome || '', cpf }, q.apt, q.apt_motivo, q.apt_anexo, q.uf)
      .then(hmCarregar).then(() => { if (view === 'equipe') render(); })
      .catch(e => toastDl('⚠ Servidor: ' + e.message, true));
  }
  if (ok && novo) hmVincularEquipe(key);
  return ok;
};

mesclarEquipes = function (base) {
  const dbs = (base || []).filter(e => !e.local);
  const sobram = [], novos = [];

  dbs.forEach(e => {
    const cpfs = e.membros.map(m => digitos(m.cpf)).filter(c => c.length === 11);
    const nomes = e.membros.filter(m => digitos(m.cpf).length !== 11)
      .map(m => norm(m.nome)).filter(n => n.split(' ').length >= 2);
    const q = EQ_LOCAIS.find(x => (x.membros || []).some(m =>
      cpfs.includes(digitos(m.cpf)) || (m.nome && nomes.includes(norm(m.nome)))));
    if (!q) { sobram.push(e); return; }
    console.info('Equipe do servidor unificada com a sua:', eqTitulo(e), '→', eqTitulo(q));
    e.membros.forEach(m => {
      const c = digitos(m.cpf);
      if (c.length !== 11) return;
      if (q.membros.some(x => digitos(x.cpf) === c)) return;
      const nome = nomeMembro(m);
      q.membros.push({ cpf: c, nome, uf: q.uf || '' });
      novos.push({ q, m: { nome, cpf: c } });
    });
    q.membros.forEach(x => {
      const certo = nomeMembro(x);
      if (certo && certo !== x.nome) x.nome = certo;
    });
  });

  if (novos.length) {
    salvarEqLocais();
    if (tokenAdm()) {
      Promise.all(novos.map(({ q, m }) => hmRegistrarApt(m, q.apt, q.apt_motivo, q.apt_anexo, q.uf).catch(() => {})))
        .then(hmCarregar).then(() => { if (view === 'equipe') render(); });
    }
  }
  return sobram.concat(EQ_LOCAIS.map(eqLocalParaEquipe));
};

const _novoEnvioEquipe = novoEnvioEquipe;
novoEnvioEquipe = function (key) {
  const eq = EQUIPES.find(e => e.key === key), st = eq && dirStatusEq(eq);
  if (st === 'AGUARDANDO' || st === 'STANDBY') {
    alert('Esta equipe está ' + (st === 'STANDBY' ? 'em standby' : 'aguardando a análise da diretoria') + '. Os documentos só podem ser enviados depois que a diretoria homologar.');
    return;
  }
  _novoEnvioEquipe(key);
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
  const det = document.getElementById('hmDet'), obs = document.getElementById('hmDetObs');
  if (det && inapto) det.open = true;
  if (obs) obs.textContent = inapto ? '(obrigatório: informe ao menos um integrante com CPF)' : '(opcional)';
  if (!inapto) {
    document.getElementById('aptMotivo').value = '';
    document.getElementById('aptAnexo').value = '';
  }
}

function linhaMembro() {
  return `<div class="hmRow" style="display:grid;grid-template-columns:1fr 160px auto;gap:8px;align-items:end">
    <label>Nome<input type="text" class="hmNome" placeholder="Nome completo" autocomplete="off"></label>
    <label>CPF<input type="text" class="hmCpf" placeholder="000.000.000-00" inputmode="numeric" oninput="maskCpf(this)"></label>
    <button type="button" class="ghost sm" title="Remover" onclick="this.closest('.hmRow').remove()">✕</button>
  </div>`;
}
function hmAddMembro() {
  const box = document.getElementById('hmMembros'); if (!box) return;
  box.insertAdjacentHTML('beforeend', linhaMembro());
  const n = box.querySelectorAll('.hmNome'); n[n.length - 1].focus();
}

function dispararHomologacao() {
  hmOverlay('Disparar homologação — criar equipe', `
    <p class="dica">Informe o <b>nome da equipe</b> ou o <b>nome completo</b> do técnico. O card da equipe é criado agora.
      Se algum item de aptidão estiver <b>Inapto</b>, o caso vai para a análise da diretoria antes de seguir e o prazo de ${PRAZO_DIAS} dias só começa quando ela homologar.
      Sem inapto, o prazo começa agora; envie os documentos dentro da equipe: quem aparecer em cada documento entra na equipe e você escolhe o líder.</p>
    <div style="display:grid;gap:10px;margin-top:12px">
      <label>Nome da equipe / técnico<input type="text" id="hmEqNome" placeholder="Ex.: Equipe Pedro Henrique ou Pedro Henrique Santos Ferreira" autocomplete="off"></label>
      <label>Estado de atuação <span style="color:var(--nok)">*</span>
        <select id="hmUf"><option value="">Selecione...</option>${UFS.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
        <span class="msg" style="display:block;margin:4px 0 0">Obrigatório. Vale para todos os integrantes desta equipe.</span></label>
      <div><div class="sec" style="margin:4px 0 0">Aptidão</div>${APT.map(aptLinha).join('')}</div>
      <div id="aptBox" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px">
        <label>Motivo de não estar apto (obrigatório)
          <textarea id="aptMotivo" rows="4" placeholder="Descreva o motivo para a diretoria analisar..." style="width:100%"></textarea></label>
        <label style="margin-top:8px;display:block">Anexo (opcional)
          <input type="file" id="aptAnexo" accept=".pdf,image/*,.doc,.docx"></label>
        <div class="msg" style="margin-top:6px">Todas as informações serão enviadas para a diretoria.</div>
      </div>
      <details id="hmDet">
        <summary>Integrantes <span id="hmDetObs" class="msg">(opcional)</span></summary>
        <div id="hmMembros" style="display:grid;gap:10px;margin-top:10px">${linhaMembro()}</div>
        <div class="row" style="margin-top:10px"><button type="button" class="ghost sm" onclick="hmAddMembro()">＋ Adicionar integrante</button></div>
      </details>
      <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
      <button class="primary" id="hmGo" onclick="hmEnviar()">Criar equipe</button>
    </div>`);
  setTimeout(() => { const n = document.getElementById('hmEqNome'); if (n) n.focus(); }, 50);
}

const linkTecnico = m => `${location.origin}/loginTecnico.html?cpf=${digitos(m.cpf)}&nome=${encodeURIComponent(m.nome || '')}`;
function hmLinksHtml(lista) {
  const msgDe = m => `Olá ${(m.nome || '').split(' ')[0]}! Para iniciar sua homologação, faça seu cadastro e envie seus documentos por aqui: ${linkTecnico(m)}`;
  return lista.map((m, i) => `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0">
      <p class="dica" style="margin:0"><b>${esc(m.nome || 'Sem nome')}</b> · CPF ${esc(fmtCpf(m.cpf))}</p>
      <input type="text" id="hmLink${i}" readonly value="${esc(linkTecnico(m))}" onfocus="this.select()" style="margin-top:6px">
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <button class="ghost sm" onclick="hmCopiar('hmLink${i}')">📋 Copiar link</button>
        <a class="primary sm" style="padding:6px 12px;border-radius:8px;text-decoration:none;display:inline-block"
           target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msgDe(m))}">WhatsApp</a>
      </div></div>`).join('');
}
function hmCopiar(id) {
  const i = document.getElementById(id); if (!i) return; i.select();
  (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.resolve(document.execCommand('copy')))
    .then(() => toastDl('Link copiado.', true));
}
function hmLinksEquipe(key) {
  const eq = EQUIPES.find(e => e.key === key); if (!eq) return;
  hmOverlay('Links dos técnicos — ' + eqTitulo(eq), eq.membros.length ? hmLinksHtml(eq.membros.map(m => ({ ...m, nome: nomeMembro(m) }))) : '<p class="msg">Equipe sem integrantes.</p>');
}

async function hmEnviar() {
  const err = m => { document.getElementById('hmErr').textContent = m; };
  const nome = (document.getElementById('hmEqNome').value || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 3) return err('Informe o nome da equipe ou o nome completo do técnico.');
  const uf = (document.getElementById('hmUf').value || '').toUpperCase();
  if (!UFS.includes(uf)) return err('Selecione o estado de atuação.');

  const rows = [...document.querySelectorAll('#hmMembros .hmRow')].map(r => ({
    nome: r.querySelector('.hmNome').value.trim().replace(/\s+/g, ' '),
    cpf: digitos(r.querySelector('.hmCpf').value)
  })).filter(m => m.nome || m.cpf);
  const vistos = new Set();
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    if (m.nome.length < 3) return err('Informe o nome do integrante (linha ' + (i + 1) + ').');
    if (!cpfOk(m.cpf)) return err('CPF inválido (linha ' + (i + 1) + ').');
    if (vistos.has(m.cpf)) return err('CPF repetido (linha ' + (i + 1) + ').');
    vistos.add(m.cpf);
  }

  const apto = {}; APT.forEach(([k]) => apto[k] = aptValor(k));
  const inaptos = APT.filter(([k]) => !apto[k]).map(([, t]) => t);
  let motivo = null, arq = null;
  if (inaptos.length) {
    motivo = document.getElementById('aptMotivo').value.trim();
    if (motivo.length < 10) return err('Informe o motivo da inaptidão (mínimo 10 caracteres).');
    arq = document.getElementById('aptAnexo').files[0] || null;
    if (arq && arq.size > 10 * 1048576) return err('Anexo acima de 10 MB.');
    if (!rows.length) return err('Para enviar à diretoria, informe ao menos um integrante (nome e CPF): a diretoria analisa por CPF.');
  }
  const token = tokenAdm();
  if (inaptos.length && !token) return err('Sessão sem token. Entre novamente.');

  const b = document.getElementById('hmGo'); b.disabled = true; b.textContent = 'Criando...'; err('');

  let link = null;
  if (arq) {
    try {
      const seg = arq.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
      const caminho = `homologacao/${rows[0].cpf}/${Date.now()}_${seg}`;
      const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`,
        { method: 'POST', body: arq, headers: { apikey: VDSB.SUPABASE_ANON_KEY, 'Content-Type': arq.type || 'application/octet-stream' } });
      if (!up.ok) { const j = await up.json().catch(() => null); throw new Error((j && (j.message || j.error)) || 'upload do anexo ' + up.status); }
      link = linkStorage(caminho);
    } catch (e) { b.disabled = false; b.textContent = 'Criar equipe'; return err('Não foi possível enviar o anexo: ' + e.message); }
  }

  const q = criarEquipeLocal(nome);
  q.apt = apto; q.inapto = inaptos.length > 0; q.apt_motivo = motivo; q.apt_anexo = link; q.uf = uf; salvarEqLocais();

  const ok = [], falhas = [];
  for (const m of rows) {
    _addMembroLocal(q.key, m.nome, m.cpf);
    { const mm = mLocal(q, m.cpf); if (mm) mm.uf = uf; }
    if (!token) continue;
    try { await hmRegistrarApt(m, apto, motivo, link, uf); ok.push(m); }
    catch (e) { falhas.push({ ...m, erro: e.message }); }
  }
  salvarEqLocais();
  F.modo = 'equipe';
  if (view === 'home') renderHome();

  const avisoFalhas = falhas.length ? `<div class="aviso">⚠ A equipe foi criada, mas o registro no servidor falhou para:<br>${falhas.map(f => esc(f.nome) + ' — ' + esc(f.erro)).join('<br>')}<br>Abra a equipe e use <b>📨 Reenviar à diretoria</b>.</div>` : '';
  if (inaptos.length) {
    hmOverlay('Enviado para a diretoria', `
      <p class="dica"><b>${esc(eqTitulo({ nome }))}</b> criada. Inapto em: <b>${esc(inaptos.join(', '))}</b>${link ? ' · com anexo' : ''}.</p>
      <p class="dica">O caso aguarda a decisão da diretoria. Se for <b>Homologar</b>, segue o trâmite normal, o prazo de ${PRAZO_DIAS} dias começa e você pode enviar os documentos da equipe;
        se não, a equipe fica em <b>Standby</b>.</p>
      ${avisoFalhas}
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <a class="ghost" style="padding:8px 14px;border-radius:8px;text-decoration:none;display:inline-block" href="diretoria.html">Abrir análise da diretoria</a>
        <button class="primary" onclick="hmFechar();abrirEquipe('${esc(q.key)}')">Abrir a equipe</button>
      </div>`);
  } else {
    const venc = new Date(Date.now() + PRAZO_DIAS * 864e5).toLocaleDateString('pt-BR');
    hmOverlay('Equipe criada', `
      <p class="dica"><b>${esc(eqTitulo({ nome }))}</b> criada. Prazo para homologar: até <b>${venc}</b> (${PRAZO_DIAS} dias).</p>
      <p class="dica">Próximo passo: abra a equipe e clique em <b>📤 Enviar documento</b>.</p>
      ${avisoFalhas}${hmLinksHtml(ok)}
      <div class="row" style="margin-top:14px"><button class="primary" onclick="hmFechar();abrirEquipe('${esc(q.key)}')">Abrir a equipe</button></div>`);
  }
  hmVincularEquipe(q.key);
  hmCarregar();
}
async function hmReenviarDiretoria(key) {
  const q = qLocal(key); if (!q) return;
  if (!tokenAdm()) { alert('Sessão sem token. Entre novamente.'); return; }
  await hmCarregar();
  const conhecido = c => HOMOL.concat(HOMOL_FORA).some(h => digitos(h.cpf) === digitos(c));
  const faltam = q.membros.filter(m => !conhecido(m.cpf));
  if (!faltam.length) { toastDl('Todos já estão registrados no servidor.', true); render(); return; }
  const falhas = [];
  for (const m of faltam) {
    try { await hmRegistrarApt({ ...m, nome: nomeMembro(m) }, q.apt, q.apt_motivo, q.apt_anexo, q.uf); } catch (e) { falhas.push((nomeMembro(m) || fmtCpf(m.cpf)) + ' — ' + e.message); }
  }
  await hmCarregar(); render();
  if (falhas.length) alert('Não foi possível registrar:\n' + falhas.join('\n'));
  else toastDl('Enviado à diretoria.', true);
}

function abrirAddMembro(key) {
  hmOverlay('Adicionar integrante', `
    <p class="dica">Use quando a pessoa ainda não tem documento enviado. Quem tiver documento enviado pela equipe entra sozinho.</p>
    <div style="display:grid;gap:10px;margin-top:12px">
      <label>Nome<input type="text" id="hmAddNome" placeholder="Nome completo" autocomplete="off"></label>
      <label>CPF<input type="text" id="hmAddCpf" placeholder="000.000.000-00" inputmode="numeric" oninput="maskCpf(this)"></label>
      <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
      <button class="primary" onclick="hmAddMembroEq('${esc(key)}')">Adicionar</button>
    </div>`);
  setTimeout(() => { const n = document.getElementById('hmAddNome'); if (n) n.focus(); }, 50);
}
function hmAddMembroEq(key) {
  const err = m => { document.getElementById('hmErr').textContent = m; };
  const nome = document.getElementById('hmAddNome').value.trim().replace(/\s+/g, ' ');
  const cpf = digitos(document.getElementById('hmAddCpf').value);
  if (nome.length < 3) return err('Informe o nome do integrante.');
  if (!cpfOk(cpf)) return err('CPF inválido.');
  if (!addMembroLocal(key, nome, cpf)) return err('Não foi possível adicionar.');
  hmFechar(); render();
}
function eqSetLider(key, cpf) { definirLider(key, cpf); render(); hmVincularEquipe(key, true); }
function eqRemover(key, cpf) {
  if (!confirm('Remover esta pessoa da equipe? Os documentos dela continuam em "Colaboradores".')) return;
  removerMembroLocal(key, cpf); render(); hmDesvincular([cpf]);
}
function eqRenomear(key) {
  const q = EQ_LOCAIS.find(x => x.key === key); if (!q) return;
  const n = prompt('Novo nome da equipe:', q.nome);
  if (n === null) return;
  if (n.trim().length < 3) { alert('Informe um nome com pelo menos 3 caracteres.'); return; }
  renomearEquipeLocal(key, n.trim()); render();
}
function eqExcluir(key) {
  const q = EQ_LOCAIS.find(x => x.key === key); if (!q) return;
  if (!confirm('Excluir a equipe "' + q.nome + '"? As pessoas e os documentos continuam em "Colaboradores".')) return;
  const cpfsEq = q.membros.map(m => m.cpf);
  excluirEquipeLocal(key); irHome(); hmDesvincular(cpfsEq);
}

function eqAlterarUf(key) {
  const q = qLocal(key); if (!q) return;
  hmOverlay('Estado de atuação da equipe', `
    <p class="dica">O estado escolhido é aplicado a <b>todos os integrantes</b> de ${esc(eqTitulo(q))}.</p>
    <div style="display:grid;gap:10px;margin-top:12px">
      <label>Estado de atuação
        <select id="hmUfEq"><option value="">Selecione...</option>${UFS.map(u => `<option value="${u}" ${q.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <div id="hmErr" class="msg" style="color:var(--nok);margin:0"></div>
      <button class="primary" onclick="eqSalvarUf('${esc(key)}')">Salvar</button>
    </div>`);
}
async function eqSalvarUf(key) {
  const q = qLocal(key); if (!q) return;
  const uf = (document.getElementById('hmUfEq').value || '').toUpperCase();
  if (!UFS.includes(uf)) { document.getElementById('hmErr').textContent = 'Selecione o estado de atuação.'; return; }
  q.uf = uf; q.membros.forEach(m => { m.uf = uf; }); salvarEqLocais();
  if (tokenAdm()) await Promise.all(q.membros.filter(m => digitos(m.cpf).length === 11).map(m => hmSalvarEstado(m.cpf, uf)));
  hmFechar(); render(); toastDl('Estado ' + uf + ' aplicado a ' + q.membros.length + ' integrante(s).', true);
}

const fmtD = s => s ? fmtDH(String(s).replace('T', ' ').slice(0, 16)) : '—';
const fmtDia = d => d.toLocaleDateString('pt-BR');
const decorridos = (a, b) => ((b ? new Date(b) : new Date()) - new Date(a)) / 864e5;

function slaDe(h) {
  const venc = new Date(new Date(h.disparada_em).getTime() + PRAZO_DIAS * 864e5);
  if (h.concluida_em) {
    const d = decorridos(h.disparada_em, h.concluida_em), noPrazo = d <= PRAZO_DIAS;
    return { tipo: noPrazo ? 'ok' : 'fora', d, venc,
      txt: noPrazo ? `Concluída em ${Math.max(1, Math.ceil(d))} dia(s) · no prazo` : `Concluída em ${Math.ceil(d)} dia(s) · ${Math.ceil(d - PRAZO_DIAS)} dia(s) fora do prazo` };
  }
  const d = decorridos(h.disparada_em), rest = PRAZO_DIAS - d;
  if (rest < 0) return { tipo: 'atrasada', d, venc, txt: `ATRASADA há ${Math.ceil(-rest)} dia(s)` };
  const r = Math.ceil(rest);
  return { tipo: r <= ALERTA_DIAS ? 'atencao' : 'andamento', d, venc, txt: r <= 0 ? 'Vence hoje' : `Dia ${Math.min(PRAZO_DIAS, Math.floor(d) + 1)} de ${PRAZO_DIAS} · restam ${r} dia(s)` };
}
const BADGE_SLA = { ok: 'b-ok', fora: 'b-warn', atrasada: 'b-nok', atencao: 'b-warn', andamento: 'b-warn' };

function etapaDe(h) {
  if (h.concluida_em) return 'Concluída';
  if (!h.cadastrado_em) return 'Aguardando cadastro do técnico';
  if (!h.primeiro_envio_em) return 'Aguardando 1º documento';
  return 'Em validação';
}

const maxData = L => L.length ? L.reduce((a, b) => new Date(a) > new Date(b) ? a : b) : null;
const minData = L => L.length ? L.reduce((a, b) => new Date(a) < new Date(b) ? a : b) : null;

function hmReconciliarEquipes() {
  let mudou = false;
  EQ_LOCAIS.forEach(q => {
    const eq = EQUIPES.find(e => e.key === q.key); if (!eq) return;
    const ds = dirStatusEq(eq);
    const todos = (!ds || ds === 'APROVADA') && eq.membros.length > 0 &&
      eq.membros.every(m => { const g = grupoDoMembro(m); return g && g.est === 'ok'; });
    if (todos && !q.concluida_em) { q.concluida_em = new Date().toISOString(); mudou = true; }
    if (!todos && q.concluida_em) { q.concluida_em = null; mudou = true; }
  });
  if (mudou) salvarEqLocais();
}

function unidadeEquipe(eq) {
  const gs = eq.membros.map(grupoDoMembro);
  const n = eq.membros.length;
  const nConc = gs.filter(g => g && g.est === 'ok').length;
  const nEnv = gs.filter(g => g && g.envios.length).length;
  const hs = eq.membros.map(m => HOMOL.find(h => digitos(h.cpf) === m.cpf)).filter(Boolean);
  const q = eq.local ? EQ_LOCAIS.find(x => x.key === eq.key) : null;
  if (q && q.inapto && dirStatusEq(eq) !== 'APROVADA') return null;
  const disp = q ? (q.inapto ? minData(hs.map(h => h.disparada_em)) : q.criada_em) : minData(hs.map(h => h.disparada_em));
  if (!disp) return null;
  let conc = null;
  if (q) conc = q.concluida_em || null;
  else if (n > 0 && hs.length === n && hs.every(h => h.concluida_em)) conc = maxData(hs.map(h => h.concluida_em));
  const envios = [];
  gs.forEach(g => g && g.envios.forEach(e => { const d = new Date(String(e.data_hora || '').replace(' ', 'T')); if (!isNaN(d)) envios.push(d.toISOString()); }));
  const h = { disparada_em: disp, cadastrado_em: null, primeiro_envio_em: minData(envios), concluida_em: conc };
  return { eq, hs, n, nConc, nEnv, nCad: 0, h, s: slaDe(h), sem: nEnv === 0 && !conc, team: true };
}
function unidadePessoa(h) {
  return { eq: null, hs: [h], n: 1, nConc: h.concluida_em ? 1 : 0, nCad: h.cadastrado_em ? 1 : 0, nEnv: h.primeiro_envio_em ? 1 : 0,
    h, s: slaDe(h), sem: !h.cadastrado_em && !h.concluida_em, team: false };
}
function montarUnidades(modo) {
  const un = [], emEquipe = new Set();
  if (modo === 'equipes') {
    EQUIPES.forEach(eq => {
      const u = unidadeEquipe(eq);
      if (u) { un.push(u); eq.membros.forEach(m => emEquipe.add(m.cpf)); }
    });
  }
  HOMOL.forEach(h => { if (!emEquipe.has(digitos(h.cpf))) un.push(unidadePessoa(h)); });
  return un;
}
function etapaUnidade(u) {
  if (!u.team) return etapaDe(u.hs[0]);
  if (!u.n) return 'Equipe sem integrantes: envie documentos';
  if (u.h.concluida_em) return 'Equipe concluída';
  return `${u.nConc}/${u.n} completos · ${u.nEnv}/${u.n} já enviaram documentos`;
}
function nomeUnidade(u) {
  if (!u.team) { const h = u.hs[0]; return `${esc(nomeCpf(h.cpf, h.nome))}<div class="evid">CPF ${esc(fmtCpf(h.cpf))}</div>`; }
  const marca = m => { const g = grupoDoMembro(m); return g ? (g.est === 'ok' ? '✓' : g.envios.length ? '…' : '○') : '○'; };
  return `<b>${esc(eqTitulo(u.eq))}</b> <span class="evid">(${u.n} pessoa(s))</span>
    <a href="#" class="noprint" onclick="hmFechar();abrirEquipe('${esc(u.eq.key)}');return false"> abrir</a>
    ${u.eq.local && qLocal(u.eq.key) && qLocal(u.eq.key).uf ? `<div class="evid">Estado: ${esc(qLocal(u.eq.key).uf)}</div>` : ''}
    <div class="evid">${u.eq.membros.map(m => `${marca(m)} ${esc(nomeMembro(m) || fmtCpf(m.cpf))}${m.lider ? ' ★' : ''}`).join(' · ')}</div>`;
}

async function abrirHomologacoes(filtro, modo) {
  if (modo) HM_MODO = modo;
  hmOverlay('Acompanhamento de homologações', '<p class="msg"><span class="spin"></span>Carregando...</p>', true);
  await hmCarregar();
  await hmReconciliar();
  hmReconciliarEquipes();
  const f = filtro || 'todas';
  const S = montarUnidades(HM_MODO);

  const abertas = S.filter(x => !x.h.concluida_em);
  const atrasadas = abertas.filter(x => x.s.tipo === 'atrasada');
  const atencao = abertas.filter(x => x.s.tipo === 'atencao');
  const conc = S.filter(x => x.h.concluida_em);
  const concNoPrazo = conc.filter(x => x.s.tipo === 'ok');
  const pct = conc.length ? Math.round(concNoPrazo.length / conc.length * 100) : null;
  const media = conc.length ? (conc.reduce((t, x) => t + x.s.d, 0) / conc.length) : null;

  const filtros = {
    todas: () => true,
    abertas: x => !x.h.concluida_em,
    atrasadas: x => x.s.tipo === 'atrasada',
    atencao: x => x.s.tipo === 'atencao',
    semcad: x => x.sem,
    concluidas: x => !!x.h.concluida_em
  };
  const L = S.filter(filtros[f] || filtros.todas).sort((a, b) =>
    (!!a.h.concluida_em - !!b.h.concluida_em) ||
    (a.h.concluida_em ? new Date(b.h.concluida_em) - new Date(a.h.concluida_em) : new Date(a.h.disparada_em) - new Date(b.h.disparada_em)));
  const nA = HOMOL_FORA.filter(h => h.status_diretoria === 'AGUARDANDO').length;
  const nS = HOMOL_FORA.length - nA;

  const btn = (k, t) => `<button class="${f === k ? 'primary' : 'ghost'} sm" onclick="abrirHomologacoes('${k}')">${t}</button>`;
  const btnModo = (m, t) => `<button class="${HM_MODO === m ? 'primary' : 'ghost'} sm" onclick="abrirHomologacoes('${f}','${m}')">${t}</button>`;
  hmOverlay('Acompanhamento de homologações', `
    <p class="dica">Prazo do homologador: <b>${PRAZO_DIAS} dias</b> a partir da criação da equipe (se houve inapto, a partir da homologação pela diretoria). A equipe só é concluída quando todos os integrantes estão com a documentação OK.</p>
    ${HOMOL_FORA.length ? `<p class="msg">⏳ ${nA} aguardando a diretoria · <a href="diretoria.html">abrir</a> &nbsp;|&nbsp; ⏸ ${nS} em standby · <a href="standby.html">ver</a></p>` : ''}
    <div class="row" style="gap:8px;flex-wrap:wrap;margin:8px 0 0">${btnModo('equipes', '👥 Por equipe')}${btnModo('pessoas', '👤 Por pessoa')}</div>
    <div class="counters" style="margin:10px 0 14px">
      <div class="cnt"><b>${abertas.length}</b><span>Em andamento</span></div>
      <div class="cnt nok"><b>${atrasadas.length}</b><span>Atrasadas</span></div>
      <div class="cnt pend"><b>${atencao.length}</b><span>Vencem em até ${ALERTA_DIAS} dias</span></div>
      <div class="cnt ok"><b>${pct === null ? '—' : pct + '%'}</b><span>Concluídas no prazo${conc.length ? ' (' + concNoPrazo.length + '/' + conc.length + ')' : ''}</span></div>
      <div class="cnt"><b>${media === null ? '—' : media.toFixed(1).replace('.', ',')}</b><span>Média de dias p/ concluir</span></div>
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin:0 0 12px">
      ${btn('todas', 'Todas (' + S.length + ')')}${btn('abertas', 'Em andamento (' + abertas.length + ')')}${btn('atrasadas', 'Atrasadas (' + atrasadas.length + ')')}
      ${btn('atencao', 'Vencendo (' + atencao.length + ')')}${btn('semcad', 'Sem início (' + S.filter(filtros.semcad).length + ')')}${btn('concluidas', 'Concluídas (' + conc.length + ')')}
    </div>
    ${L.length ? `<div style="overflow-x:auto"><table><tr><th>${HM_MODO === 'equipes' ? 'Equipe / Técnico' : 'Técnico'}</th><th>Disparada</th><th>Prazo até</th><th>Cadastro</th><th>1º envio</th><th>Concluída</th><th>Etapa</th><th>Prazo</th></tr>` +
      L.map(u => `<tr${u.s.tipo === 'atrasada' ? ' style="background:#fef2f2"' : ''}>
          <td>${nomeUnidade(u)}</td>
          <td>${fmtD(u.h.disparada_em)}</td><td>${fmtDia(u.s.venc)}</td><td>${fmtD(u.h.cadastrado_em)}</td><td>${fmtD(u.h.primeiro_envio_em)}</td><td>${fmtD(u.h.concluida_em)}</td>
          <td>${esc(etapaUnidade(u))}</td><td><span class="badge ${BADGE_SLA[u.s.tipo]}">${esc(u.s.txt)}</span></td></tr>`).join('') + `</table></div>`
      : '<p class="msg">Nenhuma homologação nesta visão.</p>'}`, true);
}
const RESP_GRUPOS = [
  { k: 'empresa', t: '🏢 Responsabilidade da Empresa', cor: '#2563eb', bg: '#eff6ff',
    re: /\baso\b|\bos\b|nr ?0?1\b|epi/ },
  { k: 'tecnico', t: '👷 Responsabilidade do Técnico', cor: '#ea580c', bg: '#fff7ed',
    re: /nr ?35|nr ?10\b|nr ?0?6\b|contrato|cnpj|\brg\b|\bcnh\b/ },
  { k: 'outros', t: 'Outros', cor: '#64748b', bg: '#f8fafc', re: /.*/ }
];
function docsPorResp() {
  const grupos = RESP_GRUPOS.map(g => ({ ...g, itens: [] }));
  DOCS.forEach((d, i) => {
    const txt = norm((d.nome || '') + ' ' + (d.ab || ''));
    const ordem = [grupos[1], grupos[0], grupos[2]];
    ordem.find(g => g.re.test(txt)).itens.push({ d, i });
  });
  return grupos.filter(g => g.itens.length);
}

function fluxoEquipe(eq) {
  hmReconciliarEquipes();
  const q = eq.local ? qLocal(eq.key) : null, k = esc(eq.key);
  const ds = dirStatusEq(eq);
  const u = unidadeEquipe(eq);

  if (!u && q && q.inapto) {
    const cor = ds === 'STANDBY' ? '#d97706' : '#4f46e5';
    const falta = eq.membros.some(m => !HOMOL.concat(HOMOL_FORA).some(h => digitos(h.cpf) === digitos(m.cpf)));
    return `<div class="sec">Fluxo da homologação</div>
      <div class="aviso" style="border-color:${cor}">${ds === 'STANDBY' ? '⏸' : '⏳'} <b>${esc(DIR_TXT[ds] || '')}</b>.
        ${ds === 'STANDBY' ? 'A equipe só segue se a diretoria reverter o standby.' : 'O prazo de ' + PRAZO_DIAS + ' dias e o envio de documentos só começam depois que a diretoria homologar.'}
        ${q.uf ? '<br>Estado de atuação: <b>' + esc(q.uf) + '</b>' : ''}${aptResumo(q)}</div>
      <div class="row noprint" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <a class="ghost sm" style="padding:6px 12px;border-radius:8px;text-decoration:none;display:inline-block" href="diretoria.html">Abrir análise da diretoria</a>
        ${falta ? `<button class="primary sm" onclick="hmReenviarDiretoria('${k}')">📨 Reenviar à diretoria</button>` : ''}</div>`;
  }
  if (!u) return '';

  const passos = [{ t: 'Equipe criada', d: fmtD(u.h.disparada_em), ok: true }];
  if (q && q.inapto) passos.push({ t: 'Diretoria', d: DIR_TXT[ds] || '', ok: ds === 'APROVADA' });
  passos.push(
    { t: 'Integrantes', d: u.n + ' pessoa(s)', ok: u.n > 0 },
    { t: 'Documentos enviados', d: u.nEnv + '/' + u.n, ok: u.n > 0 && u.nEnv === u.n, parcial: u.nEnv > 0 },
    { t: 'Documentação completa', d: u.nConc + '/' + u.n, ok: u.n > 0 && u.nConc === u.n, parcial: u.nConc > 0 },
    { t: 'Concluída', d: u.h.concluida_em ? fmtD(u.h.concluida_em) : '', ok: !!u.h.concluida_em }
  );
  const cor = p => p.ok ? '#16a34a' : p.parcial ? '#d97706' : '#94a3b8';
  const sinal = { OK: '✓', ATENCAO: '✓', RELEVADO: '⚖', NOK: '✗', PENDENTE: '○' };
  const corSt = { OK: '#16a34a', ATENCAO: '#d97706', RELEVADO: '#4f46e5', NOK: '#dc2626', PENDENTE: '#94a3b8' };
  const linhas = eq.membros.map(m => {
    const g = grupoDoMembro(m);
    const ml = q ? mLocal(q, m.cpf) : null, ufm = (ml && ml.uf) || (q && q.uf) || '—';
    return `<tr><td>${esc(nomeMembro(m) || fmtCpf(m.cpf))}${m.lider ? ' ★' : ''}</td><td><b>${esc(ufm)}</b></td>` +
      DOCS.map((d, i) => { const st = g ? g.st[i] : 'PENDENTE'; return `<td style="text-align:center;color:${corSt[st]};font-weight:700" title="${esc(d.nome)}: ${esc(rot(st))}">${sinal[st]}</td>`; }).join('') + `</tr>`;
  }).join('');
  return `<div class="sec">Fluxo da homologação</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0">
      ${passos.map((p, i) => `<div style="flex:1;min-width:130px;border:1px solid ${cor(p)};border-radius:10px;padding:8px 10px">
        <div style="color:${cor(p)};font-weight:700">${p.ok ? '✓' : p.parcial ? '◐' : '○'} ${i + 1}. ${esc(p.t)}</div>
        <div class="evid">${esc(p.d) || '—'}</div></div>`).join('')}
    </div>
    <p class="msg"><span class="badge ${BADGE_SLA[u.s.tipo]}">${esc(u.s.txt)}</span> &nbsp;Prazo até ${fmtDia(u.s.venc)}${q && q.uf ? ' · Estado de atuação: <b>' + esc(q.uf) + '</b>' : ''}${q ? aptResumo(q, true) : ''}</p>
    ${q ? `<div class="row noprint" style="margin:0 0 8px"><button class="ghost sm" onclick="hmLinksEquipe('${k}')">🔗 Links dos técnicos</button> <button class="ghost sm" onclick="eqAlterarUf('${k}')">📍 Estado: ${esc(q.uf || 'definir')}</button></div>` : ''}
    ${eq.membros.length ? `<div style="overflow-x:auto"><table><tr><th>Integrante</th><th>UF</th>${DOCS.map(d => `<th style="text-align:center">${esc(d.ab)}</th>`).join('')}</tr>${linhas}</table></div>` : ''}`;
}

function aptResumo(q, curto) {
  if (!q || !q.apt) return '';
  const itens = APT.map(([k, t]) => `${t}: <b style="color:${q.apt[k] ? '#16a34a' : '#dc2626'}">${q.apt[k] ? 'Apto' : 'Inapto'}</b>`).join(' · ');
  if (curto && !q.inapto) return '';
  return `<div class="evid" style="margin-top:6px">Aptidão — ${itens}${q.apt_motivo ? '<br>Motivo: ' + esc(q.apt_motivo) : ''}${q.apt_anexo ? ' · <a href="' + esc(q.apt_anexo) + '" target="_blank" rel="noopener">anexo</a>' : ''}</div>`;
}
async function hmMarcar(cpf, etapa, quando) {
  const token = tokenAdm(); if (!token || digitos(cpf).length !== 11) return false;
  try {
    await vdRpc('homologacao_marcar', { p_token: token, p_cpf: digitos(cpf), p_etapa: etapa, p_quando: quando || null });
    return true;
  } catch (e) { console.warn('Homologação (' + etapa + '):', e.message); return false; }
}

async function hmReconciliar() {
  if (!HOMOL.length || !COLABS.length) return;
  let mudou = false;
  for (const h of HOMOL.filter(x => !x.concluida_em)) {
    const g = COLABS.find(c => !c.sem && c.cpf === digitos(h.cpf));
    if (!g) continue;
    if (!h.primeiro_envio_em && g.envios.length) {
      const datas = g.envios.map(e => new Date(String(e.data_hora || '').replace(' ', 'T'))).filter(d => !isNaN(d));
      const quando = datas.length ? new Date(Math.min(...datas)).toISOString() : null;
      if (await hmMarcar(h.cpf, 'primeiro_envio', quando)) mudou = true;
    }
    if (g.est === 'ok') { if (await hmMarcar(h.cpf, 'concluida')) mudou = true; }
  }
  if (mudou) await hmCarregar();
}

const _validarEnvio = validarEnvio;
validarEnvio = async function () {
  await _validarEnvio();
  const cpf = digitos(ENV.res && ENV.res.dados && ENV.res.dados.cpf);
  if (cpf.length === 11) { await hmMarcar(cpf, 'primeiro_envio'); hmCarregar(); }
  hmReconciliarEquipes();
};

const _carregarHist = carregarHist;
carregarHist = async function () {
  await _carregarHist();
  await hmCarregar();
  await hmReconciliar();
  hmReconciliarEquipes();
};

hmCarregar().then(hmReconciliar);


const NEG_MODOS = { PARCELAS: 'Parcelas', POR_SITE: 'Por site', A_VISTA: 'À vista' };
const NEG_ITENS = ['ASO', 'OS NR01', 'NR10', 'NR35', 'NR06', 'Ficha de EPI', 'Contrato', 'Outro'];
const DESC_MET = { PARCELADO: 'Parcelado', A_VISTA: 'À vista' };
const NEG_GER = {
  PENDENTE: ['b-warn', '⏳ Aguardando o gerente'],
  APROVADA: ['b-ok', '✓ Gerente aprovou'],
  RECUSADA: ['b-nok', '✗ Gerente recusou']
};
const NEG_PILL = { PENDENTE: 'pend', APROVADA: 'ok', RECUSADA: 'nok' };
let NEGS = [], NEG_ERRO = '', NEG_ALVO = null, NEG_EDIT = null, NEG_BACK = null;
const NEG_F = { q: '', tipo: '', ger: '' };

const fmtBRL = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const negData = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const negItens = n => Array.isArray(n.itens) ? n.itens : [];

const negNum = v => { const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
const negTotal = n => {
  const v = negNum(n.valor);
  if (v > 0) return Math.round(v * 100) / 100;
  return Math.round(negItens(n).reduce((s, i) => s + negNum(i.valor), 0) * 100) / 100;
};
const negQtdParcelas = p => { const q = Math.floor(negNum(p)); return q >= 1 ? q : 0; };

function negParcelasCentavos(total, n) {
  const q = negQtdParcelas(n);
  if (!q) return [];
  const c = Math.round(negNum(total) * 100), base = Math.floor(c / q), resto = c - base * q;
  return Array.from({ length: q }, (_, i) => base + (i < resto ? 1 : 0));
}

const negParcelas = (total, n) => negParcelasCentavos(total, n).map(c => c / 100);
function negParcelasTxt(total, n) {
  const grupos = [];
  negParcelasCentavos(total, n).forEach(c => { const g = grupos[grupos.length - 1]; if (g && g.c === c) g.q++; else grupos.push({ c, q: 1 }); });
  return grupos.map(g => `${g.q}x de ${fmtBRL(g.c / 100)}`).join(' + ');
}

const negModoTxt = n => {
  if (negItens(n).length) return negItens(n).length + ' item(ns)';
  const q = negQtdParcelas(n.parcelas);
  if (n.modo_pagamento === 'PARCELAS' && q >= 2) return negParcelasTxt(negTotal(n), q);
  return NEG_MODOS[n.modo_pagamento] || '';
};
const negStatus = n => NEG_GER[n.status_gerente] ? n.status_gerente : 'PENDENTE';
const negGerBadge = n => { const s = negStatus(n); return `<span class="negPill ${NEG_PILL[s]}">${NEG_GER[s][1]}</span>`; };

const negMetodoTxt = n => {
  const total = negTotal(n), q = negQtdParcelas(n.metodo_parcelas);
  let t = DESC_MET[n.metodo_desconto] || n.metodo_desconto || '—';
  if (n.metodo_desconto === 'PARCELADO') {
    t += q >= 2 ? ' em ' + negParcelasTxt(total, q) : ' (nº de parcelas não informado)';
  } else if (n.metodo_desconto === 'A_VISTA') {
    t += ' (' + fmtBRL(total) + ')';
  }
  return t + (n.metodo_desconto_obs ? ' — ' + n.metodo_desconto_obs : '');
};

const negLn = t => `<div class="negLn" title="${esc(t)}">${esc(t)}</div>`;

function negGerInfo(n) {
  const s = negStatus(n);
  if (s === 'PENDENTE') return '';
  const quando = `${s === 'APROVADA' ? 'Aprovou' : 'Recusou'} em ${negData(n.gerente_decidido_em)}${n.gerente_nome ? ' · ' + n.gerente_nome : ''}`;
  if (s === 'APROVADA') {
    return `<div style="margin-top:6px">${negLn(quando)}${negLn('💳 ' + negMetodoTxt(n))}${n.gerente_obs ? negLn('📝 ' + n.gerente_obs) : ''}</div>`;
  }
  return `<div style="margin-top:6px">${negLn(quando)}${negLn('📝 Motivo: ' + (n.gerente_obs || '—'))}</div>`;
}
function parseValor(s) {
  s = String(s || '').replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
async function negCarregar() {
  const token = tokenAdm(); if (!token) { NEG_ERRO = 'Sessão sem token.'; return; }
  try {
    let L = await vdRpc('painel_negociacao_listar', { p_token: token });
    if (L && !Array.isArray(L)) L = Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : []);
    NEGS = (L || []).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    NEG_ERRO = '';
  } catch (e) { NEG_ERRO = e.message; console.warn('Custo Homologação:', e.message); }
}
function negRefrescar() { document.querySelectorAll('.negX').forEach(x => x.remove()); negInjetar(); }

function negAlvo(tipo, key) {
  if (tipo === 'equipe') {
    const eq = EQUIPES.find(e => e.key === key); if (!eq) return null;
    return { tipo: 'EQUIPE', titulo: eqTitulo(eq), sub: eq.membros.length + ' pessoa(s)' + (eq.lider ? ' · líder ' + eq.lider : ''), eq };
  }
  const g = COLABS.find(c => c.key === key); if (!g || g.sem) return null;
  return { tipo: 'COLABORADOR', titulo: g.nome || 'Colaborador', sub: g.cpf ? 'CPF ' + fmtCpf(g.cpf) : 'CPF não identificado', g };
}
function negDoAlvo(al) {
  if (al.tipo === 'COLABORADOR') { const c = digitos(al.g.cpf); return NEGS.filter(n => n.tipo === 'COLABORADOR' && digitos(n.cpf) === c); }
  const lid = al.eq.membros.find(m => m.lider), lc = lid ? digitos(lid.cpf) : '', nome = eqTitulo(al.eq);
  return NEGS.filter(n => n.tipo === 'EQUIPE' && (n.equipe_nome === nome || (lc.length === 11 && digitos(n.lider_cpf) === lc)));
}

function negUltima(al) {
  const L = negDoAlvo(al); if (!L.length) return '';
  const u = L[0], s = negStatus(u), o = u.observacao ? String(u.observacao) : '';
  const ger = s === 'APROVADA' ? `✓ Gerente aprovou · 💳 ${esc(negMetodoTxt(u))}` : s === 'RECUSADA' ? '✗ Gerente recusou' : '⏳ Aguardando o gerente';
  return `<div class="evid">💰 ${L.length} custo(s) · último: ${esc(fmtBRL(negTotal(u)))} · ${esc(negModoTxt(u))}${o ? ' · 📝 ' + esc(o.slice(0, 60)) + (o.length > 60 ? '…' : '') : ''}</div>
    <div class="evid"><b>${ger}</b></div>`;
}

function negOverlay(titulo, corpo, sub) { hmOverlay(titulo, corpo, true, 'neg', sub); }

function negTabela(L, comAlvo) {
  const itensTd = n => negItens(n).length
    ? negItens(n).map(i => `<div class="negLn" title="${esc(i.item + (i.obs ? ' — ' + i.obs : ''))}">${esc(i.item)} · <b>${esc(fmtBRL(negNum(i.valor)))}</b>${i.obs ? ' · ' + esc(i.obs) : ''}</div>`).join('')
    : `${esc(negModoTxt(n))}${n.observacao ? `<div class="negLn" title="${esc(n.observacao)}">📝 ${esc(n.observacao)}</div>` : ''}`;
  return `<div class="negTblWrap"><table class="negTbl"><tr><th>Lançado em</th>${comAlvo ? '<th>Equipe / Colaborador</th>' : ''}<th>Itens</th><th>Total</th><th>Estado</th><th>Gerente</th><th></th></tr>` +
    L.map(n => `<tr><td>${esc(negData(n.criado_em))}${n.atualizado_em ? `<div class="negLn">editado em ${esc(negData(n.atualizado_em))}</div>` : ''}</td>
      ${comAlvo ? `<td>${n.tipo === 'EQUIPE' ? '👥 ' + esc(n.equipe_nome || '') + `<div class="negLn">${(n.cpfs || []).length} integrante(s)</div>`
        : '👤 ' + esc(n.nome || '') + `<div class="negLn">CPF ${esc(fmtCpf(n.cpf))}</div>`}</td>` : ''}
      <td>${itensTd(n)}</td><td><b class="negTot">${esc(fmtBRL(negTotal(n)))}</b></td><td>${esc(n.estado_atuacao || '—')}</td>
      <td>${negGerBadge(n)}${negGerInfo(n)}</td>
      <td><button type="button" class="negBtnG negSm" onclick="negEditar('${esc(n.id)}')">✎ Editar</button></td></tr>`).join('') + `</table></div>`;
}
async function abrirNegociacoes() {
  negOverlay('Custo Homologação', '<p class="msg"><span class="spin"></span>Carregando...</p>', 'Custos lançados por equipe e colaborador');
  await negCarregar();
  NEG_BACK = abrirNegociacoes;
  negOverlay('Custo Homologação', `
    <div class="negHint">ⓘ Aprovação feita pelo gerente em <a href="gerente.html">gerente.html</a></div>
    <div class="negToolbar">
      <input type="text" id="negQ" placeholder="Buscar por equipe, colaborador, CPF, item ou observação..." value="${esc(NEG_F.q)}" oninput="NEG_F.q=this.value;negFiltrar()">
      <select id="negT" onchange="NEG_F.tipo=this.value;negFiltrar()">
        ${[['', 'Equipes e colaboradores'], ['EQUIPE', 'Só equipes'], ['COLABORADOR', 'Só colaboradores']].map(([v, t]) => `<option value="${v}" ${NEG_F.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <select id="negG" onchange="NEG_F.ger=this.value;negFiltrar()">
        ${[['', 'Todos os status do gerente'], ['PENDENTE', 'Aguardando o gerente'], ['APROVADA', 'Gerente aprovou'], ['RECUSADA', 'Gerente recusou']].map(([v, t]) => `<option value="${v}" ${NEG_F.ger === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div id="negTab"></div>`, 'Custos lançados por equipe e colaborador');
  negFiltrar();
  negRefrescar();
}
function negFiltrar() {
  const box = document.getElementById('negTab'); if (!box) return;
  if (NEG_ERRO) { box.innerHTML = `<div class="negErr">⚠ ${esc(NEG_ERRO)}</div>`; return; }
  const q = norm(NEG_F.q);
  const L = NEGS.filter(n => (!NEG_F.tipo || n.tipo === NEG_F.tipo) && (!NEG_F.ger || negStatus(n) === NEG_F.ger) &&
    (!q || norm([n.equipe_nome, n.nome, n.cpf, n.observacao, negItens(n).map(i => i.item + ' ' + (i.obs || '')).join(' ')].join(' ')).includes(q)));
  const tot = L.reduce((s, n) => s + Math.round(negTotal(n) * 100), 0) / 100;
  const c = k => L.filter(n => negStatus(n) === k).length;
  box.innerHTML = L.length ? `<div class="negKpis">
      <div class="negKpi"><span>Total lançado</span><b>${esc(fmtBRL(tot))}</b></div>
      <div class="negKpi"><span>Aguardando gerente</span><b>${c('PENDENTE')}</b></div>
      <div class="negKpi"><span>Aprovados</span><b>${c('APROVADA')}</b></div>
      <div class="negKpi"><span>Recusados</span><b>${c('RECUSADA')}</b></div></div>${negTabela(L, true)}`
    : '<div class="negEmpty">Nenhum custo encontrado.</div>';
}

function negLinha(i) {
  i = i || {};
  const v = negNum(i.valor);
  return `<div class="negRow negGrid">
    <select class="negItem" aria-label="Item" onchange="negAtualizar()"><option value="">Selecione...</option>
      ${NEG_ITENS.map(t => `<option ${i.item === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <input type="text" class="negVal" aria-label="Valor" inputmode="decimal" placeholder="0,00" autocomplete="off"
      value="${v > 0 ? esc(v.toFixed(2).replace('.', ',')) : ''}" oninput="negAtualizar()">
    <input type="text" class="negObsI" aria-label="Observação" maxlength="200" placeholder="Observação (opcional)" value="${esc(i.obs || '')}">
    <button type="button" class="negIconBtn" title="Remover item" onclick="this.closest('.negRow').remove();negAtualizar()">✕</button>
  </div>`;
}
function negAddItem() {
  const box = document.getElementById('negItens'); if (!box) return;
  box.insertAdjacentHTML('beforeend', negLinha());
  const s = box.querySelectorAll('.negItem'); s[s.length - 1].focus();
  negAtualizar();
}
function negLerItens() {
  return [...document.querySelectorAll('#negItens .negRow')].map(r => ({
    item: r.querySelector('.negItem').value,
    valor: parseValor(r.querySelector('.negVal').value),
    obs: r.querySelector('.negObsI').value.trim().slice(0, 200)
  }));
}

function negForm(p) {
  p = p || {};
  const its = Array.isArray(p.itens) && p.itens.length ? p.itens : [{}];
  return `<div class="negForm">
      <div class="negSecRow"><div class="negSecT">Lista de custos</div>
        <button type="button" class="negBtnG negSm" onclick="negAddItem()">＋ Adicionar item</button></div>
      <div class="negScroll"><div class="negInner">
        <div class="negGrid negRowHead"><span>Item</span><span>Valor (R$)</span><span>Observação</span><span></span></div>
        <div id="negItens">${its.map(i => negLinha(i)).join('')}</div>
      </div></div>
      <div class="negTotalBar">
        <div><div class="negTotL">Total do lançamento</div><div class="negTotN" id="negTotalN">0 item(ns)</div></div>
        <div class="negTotV" id="negTotalV">${esc(fmtBRL(0))}</div>
      </div>
      <div class="negHint">ⓘ Depois de lançado, o custo vai para a aprovação do gerente, que define o método de desconto.</div>
      <div id="negErr" class="negErr"></div>
      <div class="negActions">
        <button type="button" class="negBtnG" onclick="negCancelar()">Cancelar</button>
        <button type="button" class="negBtnP" id="negGo" onclick="negSalvar()">${p.id ? 'Salvar alterações' : 'Lançar custo'}</button>
      </div>
    </div>`;
}

const negAlvoCard = (ico, t1, t2, tag) => `<div class="negTarget"><div class="negAv">${ico}</div>
  <div class="negTInfo"><div class="negT1" title="${esc(t1)}">${esc(t1)}</div><div class="negT2" title="${esc(t2)}">${esc(t2)}</div></div>${tag || ''}</div>`;

function negAbrir(tipo, key) {
  const al = negAlvo(tipo, key); if (!al) return;
  if (al.tipo === 'COLABORADOR' && digitos(al.g.cpf).length !== 11) { alert('Este colaborador não tem CPF identificado, não é possível lançar o custo.'); return; }
  NEG_ALVO = al; NEG_EDIT = null; NEG_BACK = () => negAbrir(tipo, key);
  const eqp = al.tipo === 'EQUIPE';
  negOverlay('Lançar Custo Homologação', `
    ${negAlvoCard(eqp ? '👥' : '👤', al.titulo, al.sub, `<span class="negTag">${eqp ? 'Equipe' : 'Colaborador'}</span>`)}
    ${negForm()}
    <div>
      <div class="negSecT" style="margin-bottom:10px">Já lançados para ${eqp ? 'esta equipe' : 'este colaborador'}</div>
      <div id="negLista"><span class="msg"><span class="spin"></span>Carregando...</span></div>
    </div>`, 'Informe os itens de custo; o gerente define o método de desconto');
  negAtualizar();
  setTimeout(() => { const n = document.querySelector('#negItens .negItem'); if (n) n.focus(); }, 50);
  negCarregar().then(() => {
    const box = document.getElementById('negLista'); if (!box || NEG_ALVO !== al) return;
    if (NEG_ERRO) { box.innerHTML = `<div class="negErr">⚠ ${esc(NEG_ERRO)}</div>`; return; }
    const L = negDoAlvo(al);
    box.innerHTML = L.length ? negTabela(L, false) : '<div class="negEmpty">Nenhum custo lançado ainda.</div>';
  });
}

function negEditar(id) {
  const n = NEGS.find(x => String(x.id) === String(id)); if (!n) return;
  NEG_EDIT = n; NEG_ALVO = null;
  const eqp = n.tipo === 'EQUIPE';
  const t1 = eqp ? (n.equipe_nome || '') : (n.nome || '');
  const t2 = (eqp ? '' : 'CPF ' + fmtCpf(n.cpf) + ' · ') + 'lançado em ' + negData(n.criado_em) + (n.estado_atuacao ? ' · ' + n.estado_atuacao : '');
  const txtAviso = 'O gerente já ' + (negStatus(n) === 'APROVADA' ? 'aprovou' : 'recusou') + ' este custo. Ao salvar, ele volta para aguardando o gerente.';
  const aviso = negStatus(n) !== 'PENDENTE' ? `<div class="negAlert" title="${esc(txtAviso)}">⚠ ${esc(txtAviso)}</div>` : '';
  const itens = negItens(n).length ? negItens(n) : [{ item: 'Outro', valor: negTotal(n), obs: n.observacao || '' }];
  negOverlay('Editar Custo Homologação', `
    ${negAlvoCard(eqp ? '👥' : '👤', t1, t2, negGerBadge(n))}
    ${negGerInfo(n)}${aviso}
    ${negForm({ id: n.id, itens })}`, 'Alterações voltam para a aprovação do gerente');
  negAtualizar();
}
function negVoltar() { NEG_EDIT = null; if (NEG_BACK) NEG_BACK(); else hmFechar(); }
function negCancelar() { if (NEG_EDIT) negVoltar(); else hmFechar(); }
function negAtualizar() {
  const its = negLerItens();
  const c = its.reduce((s, i) => s + (i.valor > 0 ? Math.round(i.valor * 100) : 0), 0);
  const v = document.getElementById('negTotalV'); if (v) v.textContent = fmtBRL(c / 100);
  const n = document.getElementById('negTotalN'); if (n) n.textContent = its.length + ' item(ns)';
}

async function negSalvar() {
  const al = NEG_ALVO, ed = NEG_EDIT;
  if (!al && !ed) return;
  const err = m => { document.getElementById('negErr').textContent = m; };
  const itens = negLerItens();
  if (!itens.length) return err('Adicione ao menos um item.');
  for (let k = 0; k < itens.length; k++) {
    const i = itens[k], n = k + 1;
    if (!i.item) return err('Selecione o item (linha ' + n + ').');
    if (!(i.valor > 0)) return err('Informe o valor do item (linha ' + n + ').');
    if (i.item === 'Outro' && i.obs.length < 3) return err('Descreva o item "Outro" na observação (linha ' + n + ').');
  }
  const valor = itens.reduce((s, i) => s + Math.round(i.valor * 100), 0) / 100;
  const token = tokenAdm(); if (!token) return err('Sessão sem token. Entre novamente.');
  if (ed && negStatus(ed) !== 'PENDENTE' && !confirm('O gerente já decidiu este custo. Salvar a alteração envia de novo para a aprovação dele. Continuar?')) return;

  const b = document.getElementById('negGo'), rotulo = b.textContent; b.disabled = true; b.textContent = 'Salvando...'; err('');
  try {
    if (ed) {
      await vdRpc('painel_negociacao_editar', { p_token: token, p_id: ed.id, p_valor: valor, p_modo: null, p_parcelas: null, p_observacao: null, p_itens: itens });
    } else {
      const args = { p_token: token, p_tipo: al.tipo, p_equipe: null, p_lider_cpf: null, p_cpfs: null, p_cpf: null, p_nome: null, p_estado: null,
        p_valor: valor, p_modo: null, p_parcelas: null, p_observacao: null, p_itens: itens };
      if (al.tipo === 'EQUIPE') {
        const lid = al.eq.membros.find(m => m.lider), q = al.eq.local ? qLocal(al.eq.key) : null;
        args.p_equipe = eqTitulo(al.eq);
        args.p_lider_cpf = lid && digitos(lid.cpf).length === 11 ? digitos(lid.cpf) : null;
        args.p_cpfs = al.eq.membros.map(m => digitos(m.cpf)).filter(c => c.length === 11);
        args.p_estado = (q && q.uf) || null;
      } else { args.p_cpf = digitos(al.g.cpf); args.p_nome = al.g.nome || null; }
      await vdRpc('painel_negociacao_lancar', args);
    }
    await negCarregar();
    negRefrescar();
    const txt = fmtBRL(valor) + ' · ' + itens.length + ' item(ns)';
    if (ed) { NEG_EDIT = null; toastDl('Custo atualizado e enviado ao gerente: ' + txt + '.', true); negVoltar(); }
    else { hmFechar(); toastDl('Custo lançado e enviado ao gerente: ' + txt + '.', true); }
  } catch (e) { b.disabled = false; b.textContent = rotulo; err('Não foi possível salvar: ' + e.message); }
}

(function negCss() {
  const old = document.getElementById('negCss'); if (old) old.remove();
  const st = document.createElement('style'); st.id = 'negCss';
  st.textContent = `
  @keyframes negFade{from{opacity:0}to{opacity:1}}
  @keyframes negPop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
  #hmOv.hmOvNeg{background:rgba(15,23,42,.55)!important;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:negFade .18s ease}
  #hmOv .negModal{padding:0!important;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:16px;
    box-shadow:0 24px 60px rgba(15,23,42,.30);overflow:hidden;animation:negPop .2s ease}

  .negMHead{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;
    border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#fff,#f8fafc)}
  .negMTit{min-width:0}
  .negMHead h2{margin:0;font-size:18px;line-height:1.25;font-weight:700;letter-spacing:-.01em;color:#0f172a;white-space:nowrap}
  .negMSub{margin-top:2px;font-size:13px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .negClose{flex:none;width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#64748b;
    font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
  .negClose:hover{background:#f1f5f9;color:#0f172a}
  .negMBody{padding:20px 24px 24px;display:grid;gap:18px;max-height:calc(100vh - 170px);overflow:auto}

  .negTarget{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
  .negAv{flex:none;width:40px;height:40px;border-radius:50%;background:#eef2ff;border:1px solid #c7d2fe;
    display:flex;align-items:center;justify-content:center;font-size:18px}
  .negTInfo{min-width:0;flex:1}
  .negT1{font-size:15px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .negT2{font-size:13px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .negTag{flex:none;padding:3px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700;
    letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}

  .negForm{display:grid;gap:14px}
  .negSecRow{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .negSecT{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;white-space:nowrap}
  .negScroll{overflow-x:auto}
  .negInner{min-width:680px;display:grid;gap:8px}
  #negItens{display:grid;gap:10px}
  .negGrid{display:grid;grid-template-columns:190px 150px minmax(220px,1fr) 40px;gap:10px;align-items:center}
  .negRowHead span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;white-space:nowrap}

  #hmOv .negModal input[type=text],#hmOv .negModal select{width:100%;box-sizing:border-box;height:40px;margin:0;padding:0 12px;
    border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font:inherit;font-size:14px;outline:none;
    transition:border-color .12s,box-shadow .12s}
  #hmOv .negModal input[type=text]::placeholder{color:#94a3b8}
  #hmOv .negModal input[type=text]:focus,#hmOv .negModal select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}
  #hmOv .negModal .negVal{text-align:right;font-variant-numeric:tabular-nums}

  .negIconBtn{width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#94a3b8;cursor:pointer;
    font-size:13px;transition:background .12s,color .12s,border-color .12s}
  .negIconBtn:hover{background:#fef2f2;color:#dc2626;border-color:#fecaca}

  .negTotalBar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-radius:12px;
    background:#eef2ff;border:1px solid #c7d2fe}
  .negTotL{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4338ca;white-space:nowrap}
  .negTotN{font-size:13px;color:#6366f1;white-space:nowrap}
  .negTotV{font-size:28px;font-weight:800;letter-spacing:-.02em;color:#312e81;font-variant-numeric:tabular-nums;white-space:nowrap}

  .negHint{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .negHint a{color:#4f46e5;font-weight:600}
  .negErr{padding:10px 14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13px}
  .negErr:empty{display:none}
  .negAlert{padding:10px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .negEmpty{padding:28px;text-align:center;color:#94a3b8;font-size:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}
  .negActions{display:flex;justify-content:flex-end;gap:10px;padding-top:14px;border-top:1px solid #e2e8f0}

  .negBtnP,.negBtnG{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:10px;
    font:inherit;font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer;transition:transform .12s,box-shadow .12s,filter .12s,background .12s}
  .negBtnP{color:#fff;background:linear-gradient(180deg,#4f46e5,#4338ca);border:1px solid #4338ca;
    box-shadow:0 1px 2px rgba(15,23,42,.12),inset 0 1px 0 rgba(255,255,255,.15)}
  .negBtnP:hover{filter:brightness(1.07);box-shadow:0 4px 12px rgba(79,70,229,.30)}
  .negBtnP:active{transform:translateY(1px)}
  .negBtnP:disabled{opacity:.6;cursor:not-allowed;box-shadow:none}
  .negBtnG{color:#334155;background:#fff;border:1px solid #cbd5e1}
  .negBtnG:hover{background:#f8fafc;border-color:#94a3b8}
  .negSm{height:32px;padding:0 12px;font-size:12px}

  .negPill{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:999px;
    font-size:12px;font-weight:600;white-space:nowrap}
  .negPill.pend{background:#fffbeb;color:#b45309;border:1px solid #fde68a}
  .negPill.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
  .negPill.nok{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
  .negLn{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}

  .negToolbar{display:grid;grid-template-columns:1fr 210px 230px;gap:10px}
  .negKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
  .negKpi{padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .negKpi span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;white-space:nowrap}
  .negKpi b{display:block;margin-top:4px;font-size:20px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap}

  .negTblWrap{border:1px solid #e2e8f0;border-radius:12px;overflow:auto;background:#fff}
  .negTbl{border-collapse:separate;border-spacing:0;width:100%;font-size:13px;color:#0f172a}
  .negTbl th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.06em;
    text-transform:uppercase;text-align:left;padding:10px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap}
  .negTbl td{padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;white-space:nowrap}
  .negTbl tr:last-child td{border-bottom:0}
  .negTbl tr:hover td{background:#fafbff}
  .negTbl td .negLn{max-width:340px}
  .negTbl .negTot{font-weight:800;font-variant-numeric:tabular-nums}

  @media (max-width:720px){
    .negMHead{padding:14px 16px}.negMBody{padding:16px}
    .negToolbar{grid-template-columns:1fr}.negKpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  }`;
  document.head.appendChild(st);
})();

function negInjetar() {
  const app = document.getElementById('app'); if (!app) return;
  app.querySelectorAll('.ccard').forEach(c => {
    if (c.querySelector('.negBox')) return;
    const oc = c.getAttribute('onclick') || '';
    let tipo = null, key = null, m;
    if ((m = oc.match(/abrirEquipe\('([^']*)'\)/))) { tipo = 'equipe'; key = m[1]; }
    else if ((m = oc.match(/abrirColab\((\d+)/))) { const g = COLABS[+m[1]]; if (g && !g.sem) { tipo = 'colab'; key = g.key; } }
    if (!tipo) return;
    const al = negAlvo(tipo, key); if (!al) return;
    const box = document.createElement('div');
    box.className = 'negBox negX noprint'; box.style.cssText = 'margin-top:8px';
    box.onclick = e => e.stopPropagation();
    box.innerHTML = `<button type="button" class="ghost sm">💰 Lançar Custo Homologação</button>${negUltima(al)}`;
    box.querySelector('button').onclick = e => { e.stopPropagation(); negAbrir(tipo, key); };
    c.appendChild(box);
  });
  if (view === 'equipe' || view === 'colab') {
    const hd = app.querySelector('.chead .noprint');
    if (hd && !hd.querySelector('.negBtn')) {
      const tipo = view === 'equipe' ? 'equipe' : 'colab', key = view === 'equipe' ? curEq : cur;
      if (negAlvo(tipo, key)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'primary negBtn negX'; b.textContent = '💰 Lançar Custo Homologação';
        b.onclick = () => negAbrir(tipo, key);
        hd.prepend(b);
      }
    }
  }
  if (view === 'home') {
    const row = app.querySelector('.row.noprint');
    if (row && !row.querySelector('.negListBtn')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost negListBtn negX';
      const pend = NEGS.filter(n => negStatus(n) === 'PENDENTE').length;
      b.textContent = '💰 Custo Homologação' + (NEGS.length ? ' (' + NEGS.length + (pend ? ' · ' + pend + ' aguardando' : '') + ')' : '');
      b.onclick = abrirNegociacoes;
      row.appendChild(b);
    }
  }
}
['renderLista', 'renderEquipe', 'renderColab'].forEach(nome => {
  const orig = window[nome];
  window[nome] = function () { orig.apply(this, arguments); negInjetar(); };
});
negCarregar().then(negRefrescar);

const _agrupar = agrupar;
agrupar = function () {
  const r = _agrupar.apply(this, arguments);
  hmCorrigirColabs(r);
  return r;
};
HIST = lerHistLocal();
try { hmCorrigirNomesLocais(); } catch (_) {} 
if (HIST.length || EQUIPES.length) { COLABS = agrupar(); carga = 'ok'; } 
render();
carregarHist();