const REGIONAIS = [
  { id: 'BA_SE', nome: 'Regional BA/SE', ufs: ['BA', 'SE'] },
  { id: 'CO',    nome: 'Regional CO',    ufs: ['DF', 'GO', 'MT', 'MS'] },
  { id: 'NE1',   nome: 'Regional NE1',   ufs: ['AL', 'RN', 'PB', 'PE'] },
  { id: 'NE2',   nome: 'Regional NE2',   ufs: ['CE', 'PI'] },
  { id: 'SO',    nome: 'Regional SO',    ufs: ['PR', 'RS', 'SC'] },
  { id: 'NO',    nome: 'Regional NO',    ufs: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { id: 'SP',    nome: 'Regional SP',    ufs: ['SP'] }
];

const RPC = {
  homologacoes:    'painel_homologacoes_apt',
  custos:          'painel_negociacao_listar',
  gerentes:        'regional_gerentes_disponiveis',  
  atribuicoes:     'regional_gerentes_listar',        
  salvarAtribuicao:'regional_gerentes_salvar'        
};

const VDSB = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});
const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digitos = s => String(s || '').replace(/\D/g, '');
const fmtCpf = s => { const d = digitos(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (s || ''); };
const tokenAdm = () => ((window.vdSessao && window.vdSessao()) || {}).token;
const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function vdRpc(fn, args) {
  const r = await fetch(`${VDSB.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: VDSB.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.message || j.error)) || 'Falha no servidor (' + r.status + ')');
  return j;
}
const comoLista = L => (L && !Array.isArray(L)) ? (Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : [])) : (L || []);

const REGIONAL_DA_UF = {};
REGIONAIS.forEach(r => r.ufs.forEach(u => { REGIONAL_DA_UF[u] = r.id; }));
const ufDe = x => String((x && (x.estado || x.uf || x.estado_atuacao)) || '').trim().toUpperCase().slice(0, 2);
const regionalDe = x => REGIONAL_DA_UF[ufDe(x)] || null;

let GERENTES = [], ATRIB = [], SOLIC = [], CUSTOS = [], ERROS = [], CARGA = 'carregando';
const ABERTA = new Set();   

const gId = g => String(g.id ?? g.gerente_id ?? g.usuario_id ?? g.cpf ?? '');

const ehGerente = g => {
  const campos = [g.cargo, g.perfil, g.role, g.funcao, g.tipo].filter(v => v !== undefined && v !== null);
  return !campos.length || campos.some(v => /gerente/i.test(String(v)));
};

async function carregarRegional() {
  const token = tokenAdm();
  CARGA = 'carregando'; ERROS = []; desenhar();
  if (!token) { ERROS.push('Sessão sem token. Entre novamente.'); CARGA = 'ok'; desenhar(); return; }
  const buscar = async (rotulo, fn) => {
    try { return comoLista(await vdRpc(fn, { p_token: token })); }
    catch (e) { ERROS.push(rotulo + ': ' + e.message); return null; }
  };
  const [ger, atr, sol, cus] = await Promise.all([
    buscar('Gerentes', RPC.gerentes), buscar('Atribuições', RPC.atribuicoes),
    buscar('Solicitados', RPC.homologacoes), buscar('Custos', RPC.custos)
  ]);
  if (ger) GERENTES = ger.filter(ehGerente);
  if (atr) ATRIB = atr;
  if (sol) SOLIC = sol;
  if (cus) CUSTOS = cus;
  CARGA = 'ok'; desenhar();
}

const gerentesDa = rid => ATRIB.filter(a => a.regional === rid);
const solicDa = rid => SOLIC.filter(s => regionalDe(s) === rid);
const custosDe = rid => CUSTOS.filter(c => regionalDe(c) === rid);
const semRegional = x => !regionalDe(x);

function desenhar() {
  const app = el('app'); if (!app) return;
  if (CARGA === 'carregando') { app.innerHTML = '<div class="card"><p class="msg"><span class="spin"></span>Carregando...</p></div>'; return; }

  const semUf = SOLIC.filter(semRegional).length + CUSTOS.filter(semRegional).length;
  const semGer = REGIONAIS.filter(r => !gerentesDa(r.id).length).length;
  app.innerHTML = `
    ${ERROS.length ? `<div class="aviso">${ERROS.map(e => '⚠ ' + esc(e)).join('<br>')}</div>` : ''}
    <div class="counters">
      <div class="cnt"><b>${REGIONAIS.length}</b><span>Regionais</span></div>
      <div class="cnt ok"><b>${REGIONAIS.length - semGer}</b><span>Com gerente definido</span></div>
      <div class="cnt pend"><b>${semGer}</b><span>Sem gerente</span></div>
      <div class="cnt"><b>${GERENTES.length}</b><span>Gerentes cadastrados</span></div>
      <div class="cnt ${semUf ? 'nok' : ''}"><b>${semUf}</b><span>Registros sem estado</span></div>
    </div>
    <div class="cgrid">${REGIONAIS.map(cartao).join('')}</div>`;
}

function cartao(r) {
  const gs = gerentesDa(r.id), sol = solicDa(r.id), cus = custosDe(r.id);
  const aberta = ABERTA.has(r.id);
  return `<div class="card" style="margin:0">
    <div class="chead"><div><h2>${esc(r.nome)}</h2>
      <div class="msg" style="margin-top:2px">${r.ufs.map(esc).join(' · ')}</div></div>
      <span class="badge ${gs.length ? 'b-ok' : 'b-warn'}">${gs.length ? gs.length + ' gerente(s)' : 'SEM GERENTE'}</span></div>
    <div class="sec" style="margin-top:0">Gerentes responsáveis</div>
    <div class="pills">${gs.length ? gs.map(g => `<span class="pill ok">${esc(g.gerente_nome || g.nome || g.gerente_id)}</span>`).join('')
      : '<span class="msg">Nenhum gerente definido.</span>'}</div>
    <p class="msg" style="margin:10px 0 0">${sol.length} solicitado(s) · ${cus.length} custo(s)</p>
    <div class="row noprint" style="margin-top:10px;gap:8px;flex-wrap:wrap">
      <button class="primary sm" onclick="abrirDefinir('${esc(r.id)}')">Definir gerentes</button>
      <button class="ghost sm" onclick="alternar('${esc(r.id)}')">${aberta ? 'Ocultar' : 'Ver'} solicitados</button>
    </div>
    ${aberta ? detalhe(r, sol, cus) : ''}
  </div>`;
}

function detalhe(r, sol, cus) {
  const porUf = r.ufs.map(u => {
    const s = sol.filter(x => ufDe(x) === u).length, c = cus.filter(x => ufDe(x) === u).length;
    return `<span class="pill ${s || c ? 'at' : ''}">${u}: ${s}/${c}</span>`;
  }).join('');
  return `<div style="margin-top:12px">
    <div class="msg">Por estado (solicitados / custos)</div><div class="pills">${porUf}</div>
    <div class="sec">Solicitados</div>
    ${sol.length ? `<div style="overflow-x:auto"><table><tr><th>Nome</th><th>CPF</th><th>UF</th><th>Situação</th></tr>` +
      sol.map(s => `<tr><td>${esc(s.nome)}</td><td>${esc(fmtCpf(s.cpf))}</td><td>${esc(ufDe(s))}</td>
        <td>${esc(s.status_diretoria || (s.concluida_em ? 'CONCLUÍDA' : 'EM ANDAMENTO'))}</td></tr>`).join('') + `</table></div>`
      : '<p class="msg">Nenhum solicitado nesta regional.</p>'}
    <div class="sec">Custos</div>
    ${cus.length ? `<div style="overflow-x:auto"><table><tr><th>Equipe / Colaborador</th><th>UF</th><th>Total</th><th>Gerente</th></tr>` +
      cus.map(c => `<tr><td>${esc(c.tipo === 'EQUIPE' ? (c.equipe_nome || '') : (c.nome || ''))}</td><td>${esc(ufDe(c))}</td>
        <td>${esc(fmtBRL(c.valor))}</td><td>${esc(c.status_gerente || 'PENDENTE')}</td></tr>`).join('') + `</table></div>`
      : '<p class="msg">Nenhum custo nesta regional.</p>'}
  </div>`;
}
function alternar(rid) { ABERTA.has(rid) ? ABERTA.delete(rid) : ABERTA.add(rid); desenhar(); }

function overlay(titulo, corpo) {
  let o = el('rgOv');
  if (!o) {
    o = document.createElement('div'); o.id = 'rgOv';
    o.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto';
    o.onclick = e => { if (e.target === o) fechar(); };
    document.body.appendChild(o);
  }
  o.innerHTML = `<div class="card" style="max-width:560px;width:100%;margin:0">
    <div class="chead"><h2>${esc(titulo)}</h2><button class="ghost sm" onclick="fechar()">Fechar</button></div>${corpo}</div>`;
}
function fechar() { const o = el('rgOv'); if (o) o.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

function abrirDefinir(rid) {
  const r = REGIONAIS.find(x => x.id === rid); if (!r) return;
  const marcados = new Set(gerentesDa(rid).map(a => String(a.gerente_id)));
  const lista = GERENTES.length
    ? GERENTES.map(g => `<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e5e7eb;cursor:pointer">
        <input type="checkbox" class="rgChk" value="${esc(gId(g))}" ${marcados.has(gId(g)) ? 'checked' : ''} style="width:auto;margin:0">
        <span><b>${esc(gNome(g))}</b>${g.email && g.email !== gNome(g) ? `<span class="evid">${esc(g.email)}</span>` : ''}</span></label>`).join('')
    : '<p class="msg">Nenhum gerente encontrado no banco.</p>';
  overlay('Gerentes — ' + r.nome, `
    <p class="dica">Estados: <b>${r.ufs.join(', ')}</b>. Marque quem será responsável por esta regional.</p>
    <div style="margin-top:10px">${lista}</div>
    <div id="rgErr" class="msg" style="color:var(--nok);margin:8px 0 0"></div>
    <div class="row" style="margin-top:12px"><button class="primary" id="rgGo" onclick="salvarDefinir('${esc(rid)}')" ${GERENTES.length ? '' : 'disabled'}>Salvar responsabilidade</button></div>`);
}

async function salvarDefinir(rid) {
  const err = m => { el('rgErr').textContent = m; };
  const token = tokenAdm(); if (!token) return err('Sessão sem token. Entre novamente.');
  const ids = [...document.querySelectorAll('.rgChk:checked')].map(c => c.value);
  const b = el('rgGo'); b.disabled = true; b.textContent = 'Salvando...'; err('');
  try {
    await vdRpc(RPC.salvarAtribuicao, { p_token: token, p_regional: rid, p_gerentes: ids });
    ATRIB = ATRIB.filter(a => a.regional !== rid).concat(ids.map(id => {
      const g = GERENTES.find(x => gId(x) === id);
      return { regional: rid, gerente_id: id, gerente_nome: g ? gNome(g) : id };
    }));
    fechar(); desenhar();
  } catch (e) { b.disabled = false; b.textContent = 'Salvar responsabilidade'; err('Não foi possível salvar: ' + e.message); }
}

carregarRegional();