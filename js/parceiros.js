const SB = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});

const EXAMES = [  
  ['avaliacao_clinica', 'Avaliação clínica', 'Clínica'], ['acuidade_visual', 'Acuidade visual', 'Visual'],
  ['audiometria', 'Audiometria', 'Audio'], ['ecg', 'ECG', 'ECG'], ['eeg', 'EEG', 'EEG'],
  ['hemograma', 'Hemograma completo', 'Hemo'], ['glicemia', 'Glicemia', 'Glic.'],
  ['avaliacao_psicossocial', 'Avaliação psicossocial', 'Psico'], ['avaliacao_cardiologica', 'Avaliação cardiológica', 'Cardio']
];
const NRS = [['nr06', 'NR 06', 'NR06'], ['nr10', 'NR 10', 'NR10'], ['nr35', 'NR 35', 'NR35']];
const TIPOS = {
  ASO:         { rotulo: 'Clínica de ASO', plural: 'Clínicas de ASO', nome: 'Clínica', pgto: 'Cond. pgto', totalRot: 'Total', campos: EXAMES, secao: 'Exames (valor de cada um)', obs: 'Observações' },
  TREINAMENTO: { rotulo: 'Centro de treinamento', plural: 'Centros de treinamento', nome: 'Nome do centro de treinamento', pgto: 'Forma de pgto', totalRot: 'Valor R$', campos: NRS, secao: 'Treinamentos (valor de cada um)', obs: 'Observação' }
};
const SUG_PGTO = ['À vista', 'PIX', 'Boleto', 'Cartão', 'Faturado 7 dias', 'Faturado 15 dias', 'Faturado 30 dias'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const digitos = s => String(s || '').replace(/\D/g, '');
const fmtCnpj = s => { const d = digitos(s); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (s || ''); };
const fmtCep = s => { const d = digitos(s); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (s || ''); };
const fmtTel = s => {
  const d = digitos(s);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return s || '';
};
const fmtNum = n => n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = n => n == null ? '' : 'R$ ' + fmtNum(n);
function parseBRL(v) {
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function cnpjValido(c) {
  c = digitos(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0, pos = base.length - 7;
    for (let i = 0; i < base.length; i++) { soma += base[i] * pos--; if (pos < 2) pos = 9; }
    const r = soma % 11; return r < 2 ? 0 : 11 - r;
  };
  const n = c.split('').map(Number);
  return dv(n.slice(0, 12)) === n[12] && dv(n.slice(0, 13)) === n[13];
}
function toast(msg, fim) {
  let t = el('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;background:#0f172a;color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.remove('hidden');
  if (fim) setTimeout(() => t.classList.add('hidden'), 5000);
}

async function db(metodo, caminho, corpo) {
  const r = await fetch(`${SB.SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: SB.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((j && (j.message || j.error)) || 'Falha no servidor (' + r.status + ')'); e.code = j && j.code; throw e; }
  return j;
}


let PARC = [], carga = 'carregando', erroMsg = '';
let view = 'home';
let P = null;                   
const F = { q: '', tipo: '', uf: '' };
let _cnpjBusca = '';

async function carregarParceiros() {
  if (!PARC.length) { carga = 'carregando'; if (view === 'home') render(); }
  try {
    PARC = await db('GET', 'parceiros?select=*&order=nome.asc&limit=2000');
    carga = 'ok';
  } catch (e) {
    erroMsg = e.message;
    if (PARC.length) toast('Não foi possível atualizar: ' + e.message, true); else carga = 'erro';
  }
  if (view === 'home') render();
}

function render() { if (view === 'form') renderForm(); else renderHome(); window.scrollTo({ top: 0 }); }
function irHome() { view = 'home'; P = null; render(); }
function novoParceiro(tipo) { P = { id: null, tipo, valores: {} }; _cnpjBusca = ''; view = 'form'; render(); }
function editar(id) { const p = PARC.find(x => x.id === id); if (!p) return; P = { ...p, valores: { ...(p.valores || {}) }, razao: p.razao_social }; _cnpjBusca = digitos(p.cnpj); view = 'form'; render(); }

let _tb;
function buscaDebounce() { clearTimeout(_tb); _tb = setTimeout(renderLista, 150); }

function renderHome() {
  const ufs = [...new Set(PARC.map(p => p.uf).filter(Boolean))].sort();
  el('app').innerHTML = `<div id="cont"></div>
    <div class="card">
      <div class="hf3">
        <input type="text" placeholder="Buscar por nome, cidade, CNPJ, CEP, contato ou e-mail..." value="${esc(F.q)}" oninput="F.q=this.value;buscaDebounce()">
        <select onchange="F.tipo=this.value;renderLista()">
          <option value="">Todos os tipos</option>
          <option value="ASO" ${F.tipo === 'ASO' ? 'selected' : ''}>Clínicas de ASO</option>
          <option value="TREINAMENTO" ${F.tipo === 'TREINAMENTO' ? 'selected' : ''}>Centros de treinamento</option>
        </select>
        <select onchange="F.uf=this.value;renderLista()">
          <option value="">Todas as UFs</option>
          ${ufs.map(u => `<option ${F.uf === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
        </select>
      </div>
      <div id="lista"></div>
    </div>`;
  renderLista();
}

function renderLista() {
  const box = el('lista'), cont = el('cont');
  if (!box) return;
  if (carga === 'carregando' && !PARC.length) { cont.innerHTML = ''; box.innerHTML = '<p class="msg"><span class="spin"></span>Carregando parceiros...</p>'; return; }
  if (carga === 'erro' && !PARC.length) { cont.innerHTML = ''; box.innerHTML = `<p class="msg" style="color:var(--nok)">⚠ ${esc(erroMsg)}</p>`; return; }

  const cidades = new Set(PARC.map(p => norm(p.cidade) + '/' + p.uf));
  cont.innerHTML = `<div class="counters">
    <div class="cnt"><b>${PARC.length}</b><span>Parceiros</span></div>
    <div class="cnt ok"><b>${PARC.filter(p => p.tipo === 'ASO').length}</b><span>Clínicas de ASO</span></div>
    <div class="cnt pend"><b>${PARC.filter(p => p.tipo === 'TREINAMENTO').length}</b><span>Centros de treinamento</span></div>
    <div class="cnt"><b>${cidades.size}</b><span>Cidades atendidas</span></div></div>`;

  const q = norm(F.q);
  const L = PARC.filter(p => (!F.tipo || p.tipo === F.tipo) && (!F.uf || p.uf === F.uf) &&
    (!q || norm([p.nome, p.razao_social, p.cidade, p.cnpj, p.contato, p.email, p.cep].join(' ')).includes(q)));
  if (!L.length) { box.innerHTML = '<p class="msg">Nenhum parceiro encontrado.</p>'; return; }

  box.innerHTML = '<div class="cgrid">' + L.map(p => {
    const t = TIPOS[p.tipo], v = p.valores || {};
    const pills = t.campos.filter(([k]) => v[k] != null)
      .map(([k, , ab]) => `<span class="pill ok">${esc(ab)} ${fmtNum(v[k])}</span>`).join('');
    return `<div class="ccard ${p.tipo === 'ASO' ? 'ok' : 'pend'}" onclick="editar('${esc(p.id)}')">
      <div class="hd"><div><div class="nm">${esc(p.nome)}</div>
        <div class="sub">${esc(p.cidade)}/${esc(p.uf)}${p.cnpj ? ' · CNPJ ' + esc(fmtCnpj(p.cnpj)) : ''}</div></div>
        <span class="tipotag ${p.tipo === 'TREINAMENTO' ? 't' : ''}">${p.tipo === 'ASO' ? 'ASO' : 'TREINAMENTO'}</span></div>
      ${p.contato || p.email ? `<div class="contato">${[p.contato, p.email].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
      ${p.total != null ? `<div class="valor">${esc(t.totalRot)}: ${fmtMoeda(p.total)}${p.pgto ? ` <span class="mini">· ${esc(p.pgto)}</span>` : ''}</div>`
                        : (p.pgto ? `<div class="mini">${esc(t.pgto)}: ${esc(p.pgto)}</div>` : '')}
      <div class="pills">${pills || '<span class="pill">sem valores</span>'}</div>
      <div class="acoes"><button class="ghost sm" onclick="event.stopPropagation();editar('${esc(p.id)}')">✎ Editar</button>
        <button class="ghost sm" onclick="event.stopPropagation();excluir('${esc(p.id)}')">🗑 Excluir</button></div>
    </div>`;
  }).join('') + '</div>';
}

function campo(id, rot, valor, extra) {
  return `<div class="field ${extra?.cls || ''}"><label for="${id}">${esc(rot)}${extra?.req ? ' *' : ''}</label>
    <input type="text" id="${id}" value="${esc(valor)}" ${extra?.attr || ''} oninput="this.dataset.auto=''${extra?.on ? ';' + extra.on : ''}"></div>`;
}
function renderForm() {
  const t = TIPOS[P.tipo], dv = P.valores || {};
  const dinheiro = t.campos.map(([k, rot]) => `<div class="field"><label for="v_${k}">${esc(rot)}</label>
      <div class="money"><span>R$</span><input type="text" inputmode="decimal" id="v_${k}" placeholder="0,00" value="${dv[k] != null ? fmtNum(dv[k]) : ''}" oninput="somar()" onblur="fmtMoney(this)"></div></div>`).join('');

  el('app').innerHTML = `<div class="card">
    <div class="chead"><div><h2>${P.id ? 'Editar' : 'Novo'} — ${esc(t.rotulo)}</h2>
      <p class="dica">Digite o CNPJ: nome, cidade, UF, endereço, contato e e-mail são preenchidos automaticamente. Confira e complete o restante.</p></div>
      <button class="ghost" onclick="irHome()">← Voltar à lista</button></div>

    <div class="fgrid">
      <div class="field span2"><label for="f_cnpj">CNPJ</label>
        <div class="cnpjbox"><input type="text" id="f_cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18" value="${esc(fmtCnpj(P.cnpj))}" oninput="maskCnpj(this)">
          <button class="ghost" type="button" onclick="buscarCnpj(true)">🔍 Buscar</button></div>
        <div id="cmsg" class="cmsg"></div></div>
      ${campo('f_nome', t.nome, P.nome, { req: 1, cls: 'span2' })}
      ${campo('f_cidade', 'Cidade', P.cidade, { req: 1 })}
      <div class="field"><label for="f_uf">UF *</label>
        <select id="f_uf" onchange="this.dataset.auto=''"><option value=""></option>${UFS.map(u => `<option ${P.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      ${campo('f_contato', 'Contato', P.contato)}
      ${campo('f_email', 'E-mail', P.email, { attr: 'inputmode="email"' })}
      <div class="field"><label for="f_cep">CEP</label>
        <input type="text" id="f_cep" inputmode="numeric" placeholder="00000-000" maxlength="9" value="${esc(fmtCep(P.cep))}" oninput="this.dataset.auto='';maskCep(this)">
        <div id="cepmsg" class="cmsg"></div></div>
      ${campo('f_endereco', 'Endereço', P.endereco, { cls: 'span2' })}
    </div>

    <div class="sec">${esc(t.secao)}</div>
    <div class="fgrid">${dinheiro}</div>
    <div class="fgrid">
      <div class="field"><label for="f_total">${esc(t.totalRot)}</label>
        <div class="totalbox"><div class="money"><span>R$</span><input type="text" inputmode="decimal" id="f_total" placeholder="0,00" value="${P.total != null ? fmtNum(P.total) : ''}"
          oninput="this.dataset.manual=this.value.trim()?'1':'';" onblur="fmtMoney(this)"></div>
          <button class="ghost sm" type="button" title="Recalcular pela soma" onclick="el('f_total').dataset.manual='';somar()">↺ somar</button></div></div>
      <div class="field"><label for="f_pgto">${esc(t.pgto)}</label>
        <input type="text" id="f_pgto" list="sugPgto" value="${esc(P.pgto)}"><datalist id="sugPgto">${SUG_PGTO.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="field full"><label for="f_obs">${esc(t.obs)}</label><textarea id="f_obs">${esc(P.observacoes)}</textarea></div>
    </div>

    <div class="row"><button class="primary" id="btnSalvar" onclick="salvar()">💾 Salvar parceiro</button>
      <button class="ghost" onclick="irHome()">Cancelar</button>
      ${P.id ? '<button class="ghost" style="margin-left:auto" onclick="excluir(P.id)">🗑 Excluir</button>' : ''}</div>
  </div>`;

  const tot = el('f_total');
  if (P.total != null && Math.abs(P.total - somaAtual()) > 0.005) tot.dataset.manual = '1'; else if (P.total == null) somar();
}

function fmtMoney(i) { const n = parseBRL(i.value); i.value = n == null ? '' : fmtNum(n); }
function somaAtual() { return TIPOS[P.tipo].campos.reduce((s, [k]) => s + (parseBRL(el('v_' + k).value) || 0), 0); }
function somar() {
  const tot = el('f_total');
  if (!tot || tot.dataset.manual === '1') return;
  const algum = TIPOS[P.tipo].campos.some(([k]) => parseBRL(el('v_' + k).value) != null);
  tot.value = algum ? fmtNum(somaAtual()) : '';
}

function msgCnpj(html, tipo) { const m = el('cmsg'); if (m) { m.className = 'cmsg ' + (tipo || ''); m.innerHTML = html || ''; } }
function maskCnpj(i) {
  const d = digitos(i.value).slice(0, 14);
  i.value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  if (d.length === 14) buscarCnpj(); else { _cnpjBusca = ''; msgCnpj(''); }
}
async function consultarCnpj(d) {
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + d);
    if (r.status === 404 || r.status === 400) throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { final: true });
    if (!r.ok) throw new Error('BrasilAPI ' + r.status);
    const j = await r.json();
    return { razao: j.razao_social, nome: j.nome_fantasia || j.razao_social,
      logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), numero: j.numero, complemento: j.complemento,
      bairro: j.bairro, cep: j.cep, cidade: j.municipio, uf: j.uf, email: j.email, tel: j.ddd_telefone_1, situacao: j.descricao_situacao_cadastral };
  } catch (e) { if (e.final) throw e; }
  // reserva
  const r = await fetch('https://publica.cnpj.ws/cnpj/' + d);
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita Federal.');
  if (!r.ok) throw new Error('serviço de consulta indisponível (' + r.status + ')');
  const j = await r.json(), s = j.estabelecimento || {};
  return { razao: j.razao_social, nome: s.nome_fantasia || j.razao_social,
    logradouro: [s.tipo_logradouro, s.logradouro].filter(Boolean).join(' '), numero: s.numero, complemento: s.complemento,
    bairro: s.bairro, cep: s.cep, cidade: s.cidade && s.cidade.nome, uf: s.estado && s.estado.sigla,
    email: s.email, tel: (s.ddd1 || '') + (s.telefone1 || ''), situacao: s.situacao_cadastral };
}
function setAuto(id, valor) {
  const e = el(id);
  if (!e || !valor) return;
  if (!e.value.trim() || e.dataset.auto === '1') { e.value = valor; e.dataset.auto = '1'; e.classList.add('auto'); }
}
async function buscarCnpj(manual) {
  const d = digitos(el('f_cnpj').value);
  if (d.length !== 14) { if (manual) msgCnpj('Digite os 14 números do CNPJ.', 'erro'); return; }
  if (!cnpjValido(d)) { msgCnpj('CNPJ inválido. Confira os números.', 'erro'); return; }
  if (d === _cnpjBusca && !manual) return;
  _cnpjBusca = d;
  msgCnpj('<span class="spin"></span>Buscando dados do CNPJ...');
  try {
    const r = await consultarCnpj(d);
    if (digitos(el('f_cnpj').value) !== d) return;  
    P.razao = r.razao;
    const end = [r.logradouro && (r.logradouro + (r.numero ? ', ' + r.numero : '')), r.complemento, r.bairro, r.cep && 'CEP ' + fmtCep(r.cep)].filter(Boolean).join(' - ');
    setAuto('f_nome', r.nome); setAuto('f_cidade', r.cidade); setAuto('f_uf', r.uf);
    setAuto('f_cep', fmtCep(r.cep)); setAuto('f_endereco', end); setAuto('f_email', String(r.email || '').toLowerCase()); setAuto('f_contato', fmtTel(r.tel));
    const ativa = !r.situacao || /ativa/i.test(r.situacao);
    const dup = PARC.find(x => x.tipo === P.tipo && digitos(x.cnpj) === d && x.id !== P.id);
    if (dup) msgCnpj(`⚠ Este CNPJ já está cadastrado como “${esc(dup.nome)}”. <a onclick="editar('${esc(dup.id)}')">Abrir cadastro</a>`, 'warn');
    else if (!ativa) msgCnpj(`⚠ ${esc(r.razao)} — situação cadastral: ${esc(r.situacao)}.`, 'warn');
    else msgCnpj(`✓ ${esc(r.razao)}${r.situacao ? ' — ' + esc(r.situacao) : ''}. Campos preenchidos (em azul): confira antes de salvar.`, 'ok');
  } catch (e) {
    _cnpjBusca = '';
    msgCnpj('Não foi possível buscar o CNPJ (' + esc(e.message) + '). Preencha manualmente.', 'erro');
  }
}

let _cepBusca = '';
function msgCep(html, tipo) { const m = el('cepmsg'); if (m) { m.className = 'cmsg ' + (tipo || ''); m.innerHTML = html || ''; } }
function maskCep(i) {
  const d = digitos(i.value).slice(0, 8);
  i.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  if (d.length === 8) buscarCep(d); else { _cepBusca = ''; msgCep(''); }
}
async function consultarCep(d) {
  try {
    const r = await fetch('https://brasilapi.com.br/api/cep/v1/' + d);
    if (r.status === 404) throw Object.assign(new Error('CEP não encontrado.'), { final: true });
    if (!r.ok) throw new Error('BrasilAPI ' + r.status);
    const j = await r.json();
    return { rua: j.street, bairro: j.neighborhood, cidade: j.city, uf: j.state };
  } catch (e) { if (e.final) throw e; }
  const r = await fetch('https://viacep.com.br/ws/' + d + '/json/');
  if (!r.ok) throw new Error('serviço de CEP indisponível (' + r.status + ')');
  const j = await r.json();
  if (j.erro) throw new Error('CEP não encontrado.');
  return { rua: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
}
async function buscarCep(d) {
  if (d === _cepBusca) return;
  _cepBusca = d;
  msgCep('<span class="spin"></span>Buscando CEP...');
  try {
    const r = await consultarCep(d);
    if (digitos(el('f_cep').value) !== d) return;
    setAuto('f_cidade', r.cidade); setAuto('f_uf', r.uf);
    const e = el('f_endereco');
    if (e && !e.value.trim()) setAuto('f_endereco', [r.rua, r.bairro].filter(Boolean).join(' - '));
    msgCep('✓ ' + esc([r.cidade, r.uf].filter(Boolean).join('/')), 'ok');
  } catch (e) {
    _cepBusca = '';
    msgCep(esc(e.message), 'erro');
  }
}

async function salvar() {
  const v = {};
  TIPOS[P.tipo].campos.forEach(([k]) => { const n = parseBRL(el('v_' + k).value); if (n != null) v[k] = n; });
  const cnpj = digitos(el('f_cnpj').value);
  const corpo = {
    tipo: P.tipo, cnpj: cnpj || null, razao_social: P.razao || null,
    nome: el('f_nome').value.trim(), cidade: el('f_cidade').value.trim(), uf: el('f_uf').value,
    contato: el('f_contato').value.trim() || null, email: el('f_email').value.trim().toLowerCase() || null,
    cep: digitos(el('f_cep').value) || null, endereco: el('f_endereco').value.trim() || null, pgto: el('f_pgto').value.trim() || null,
    total: parseBRL(el('f_total').value), valores: v, observacoes: el('f_obs').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };
  if (!corpo.nome || !corpo.cidade || !corpo.uf) { alert('Preencha ' + TIPOS[P.tipo].nome + ', cidade e UF.'); return; }
  if (cnpj && !cnpjValido(cnpj)) { alert('CNPJ inválido.'); return; }
  if (corpo.cep && corpo.cep.length !== 8) { alert('CEP inválido: informe os 8 números.'); return; }
  if (corpo.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(corpo.email)) { alert('E-mail inválido.'); return; }

  const btn = el('btnSalvar'); btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const r = P.id ? await db('PATCH', 'parceiros?id=eq.' + encodeURIComponent(P.id), corpo) : await db('POST', 'parceiros', corpo);
    const novo = r && r[0];
    if (novo) PARC = [novo, ...PARC.filter(x => x.id !== novo.id)].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    toast('Parceiro salvo.', true);
    irHome();
  } catch (e) {
    btn.disabled = false; btn.textContent = '💾 Salvar parceiro';
    alert(e.code === '23505' ? 'Já existe um parceiro deste tipo com este CNPJ.' : 'Não foi possível salvar: ' + e.message);
  }
}
async function excluir(id) {
  const p = PARC.find(x => x.id === id);
  if (!p || !confirm(`Excluir “${p.nome}”? Esta ação não pode ser desfeita.`)) return;
  try {
    await db('DELETE', 'parceiros?id=eq.' + encodeURIComponent(id));
    PARC = PARC.filter(x => x.id !== id);
    toast('Parceiro excluído.', true);
    irHome();
  } catch (e) { alert('Não foi possível excluir: ' + e.message); }
}

render();
carregarParceiros();