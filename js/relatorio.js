const REGIONAIS = [
  { id: 'BA_SE', nome: 'Regional BA/SE', ufs: ['BA', 'SE'] },
  { id: 'CO',    nome: 'Regional CO',    ufs: ['DF', 'GO', 'MT', 'MS'] },
  { id: 'NE1',   nome: 'Regional NE1',   ufs: ['AL', 'RN', 'PB', 'PE'] },
  { id: 'NE2',   nome: 'Regional NE2',   ufs: ['CE', 'PI'] },
  { id: 'SO',    nome: 'Regional SO',    ufs: ['PR', 'RS', 'SC'] },
  { id: 'NO',    nome: 'Regional NO',    ufs: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { id: 'SP',    nome: 'Regional SP',    ufs: ['SP'] }
];
const TABELA = 'negociacoes';
const RPC_FALLBACK = 'painel_negociacao_listar';
const SEM_REGIONAL = 'Sem regional';
const SEM_GERENTE = 'Sem gerente';
const LINHAS_POR_PAGINA = 100;
const COR = { azul: '#2563eb', indigo: '#6366f1', teal: '#0d9488', ok: '#16a34a', pend: '#f59e0b', nok: '#dc2626' };

const COLUNAS = [
  ['regional', 'Regional'], ['uf', 'Estado'], ['gerente', 'Gerente'], ['equipe', 'Equipe'],
  ['tipo', 'Tipo de documento'], ['status', 'Status do gerente'], ['valor', 'Valor']
];

const VDSB = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tokenAdm = () => ((window.vdSessao && window.vdSessao()) || {}).token;
const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLcurto = n => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (Math.abs(v) >= 1e4) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return fmtBRL(v);
};
const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const comoLista = L => (L && !Array.isArray(L)) ? (Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : [])) : (L || []);
const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
const ordenarPt = (a, b) => String(a).localeCompare(String(b), 'pt-BR');

function numero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const REGIONAL_DA_UF = {};
const REGIONAL_POR_CHAVE = {};
REGIONAIS.forEach(r => {
  r.ufs.forEach(u => { REGIONAL_DA_UF[u] = r.nome; });
  [r.id, r.nome, r.nome.replace('Regional ', ''), r.id.replace('_', '')].forEach(k => { REGIONAL_POR_CHAVE[norm(k)] = r.nome; });
});
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

async function lerTabela() {
  const passo = 1000, todos = [];
  for (let ini = 0; ; ini += passo) {
    const r = await fetch(`${VDSB.SUPABASE_URL}/rest/v1/${TABELA}?select=*`, {
      headers: {
        apikey: VDSB.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + VDSB.SUPABASE_ANON_KEY,
        'Range-Unit': 'items',
        Range: `${ini}-${ini + passo - 1}`
      }
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.error)) || 'Falha ao ler ' + TABELA + ' (' + r.status + ')');
    const lote = Array.isArray(j) ? j : [];
    todos.push(...lote);
    if (lote.length < passo) break;
  }
  return todos;
}

function tipoDocumento(itens) {
  let v = itens;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[') || t.startsWith('{')) { try { v = JSON.parse(t); } catch (e) { /* mantém texto */ } }
  }
  if (Array.isArray(v)) {
    v = v.map(i => (i && typeof i === 'object') ? (i.nome || i.item || i.tipo || i.descricao || '') : i)
         .map(i => String(i).trim()).filter(Boolean).join(', ');
  } else if (v && typeof v === 'object') {
    v = v.nome || v.item || v.tipo || v.descricao || JSON.stringify(v);
  }
  return String(v ?? '').trim() || 'Não informado';
}

function listaGerentes(v) {
  let L = v;
  if (typeof L === 'string') {
    const t = L.trim();
    if (t.startsWith('[')) { try { L = JSON.parse(t); } catch (e) { L = t.split(/[;,|\n]+/); } }
    else L = t.split(/[;,|\n]+/);
  }
  if (!Array.isArray(L)) L = L ? [L] : [];
  const nomes = L.map(n => String((n && typeof n === 'object') ? (n.nome || n.name || '') : n).trim()).filter(Boolean);
  return nomes.length ? [...new Set(nomes)] : [SEM_GERENTE];
}

function statusClasse(s) {
  const t = norm(s);
  if (/APROV|CONCLU|PAGO|OK/.test(t)) return 'ok';
  if (/REPROV|RECUS|NEGAD|CANCEL/.test(t)) return 'nok';
  return 'pend';
}

function normalizar(x) {
  const uf = String(x.estado_atuacao || x.estado || x.uf || '').trim().toUpperCase().slice(0, 2);
  const regional = REGIONAL_POR_CHAVE[norm(x.regional)] || REGIONAL_DA_UF[uf] || (x.regional ? String(x.regional) : SEM_REGIONAL);
  const status = String(x.status_gerente || '').trim().toUpperCase() || 'PENDENTE';
  const gerentes = listaGerentes(x.resp_gerentes_nomes ?? x.gerente_nome);
  return {
    equipe: String(x.equipe_nome || x.nome || '').trim() || '—',
    tipo: tipoDocumento(x.itens),
    uf: uf || '—',
    regional,
    gerentes,
    gerente: gerentes.join(', '),
    status,
    classe: statusClasse(status),
    valor: numero(x.valor)
  };
}
let DADOS = [], ERRO = '', DIAG = '', CARGA = 'carregando';
let ORDEM = { campo: 'valor', dir: -1 }, LIMITE = LINHAS_POR_PAGINA;
const FILTRO = { regional: '', uf: '', gerente: '', status: '', tipo: '', busca: '' };
const ROTULO_FILTRO = { regional: 'Regional', uf: 'Estado', gerente: 'Gerente', status: 'Status', tipo: 'Tipo', busca: 'Busca' };

async function carregarRelatorio() {
  CARGA = 'carregando'; ERRO = ''; DIAG = ''; desenhar();
  const token = tokenAdm(), falhas = [];
  let bruto = null, fonte = '';

  try {
    const t = await lerTabela();
    if (t.length) { bruto = t; fonte = 'tabela ' + TABELA; }
    else falhas.push('a tabela voltou com 0 linhas (provável bloqueio de RLS)');
  } catch (e) { falhas.push('tabela: ' + e.message); }

  if (!bruto) {
    if (!token) falhas.push('sessão sem token para usar o RPC');
    else {
      try { bruto = comoLista(await vdRpc(RPC_FALLBACK, { p_token: token })); fonte = 'RPC ' + RPC_FALLBACK; }
      catch (e) { falhas.push('RPC: ' + e.message); }
    }
  }

  if (!bruto || !bruto.length) {
    console.warn('Nenhum dado carregado — ' + falhas.join(' | '));
  } else {
    const cols = Object.keys(bruto[0]);
    DIAG = 'Fonte: ' + fonte + ' · ' + bruto.length + ' linha(s)';
    if (!cols.includes('valor')) ERRO = 'A coluna "valor" não veio nos dados. Colunas recebidas: ' + cols.join(', ');
    else if (!cols.includes('resp_gerentes_nomes')) ERRO = 'A coluna "resp_gerentes_nomes" não veio nos dados. Colunas recebidas: ' + cols.join(', ');
  }
  DADOS = (bruto || []).map(normalizar);
  LIMITE = LINHAS_POR_PAGINA;
  CARGA = 'ok'; desenhar();
}

function filtrados() {
  const busca = semAcento(FILTRO.busca).toLowerCase();
  return DADOS.filter(d =>
    (!FILTRO.regional || d.regional === FILTRO.regional) &&
    (!FILTRO.uf || d.uf === FILTRO.uf) &&
    (!FILTRO.gerente || d.gerentes.includes(FILTRO.gerente)) &&
    (!FILTRO.status || d.status === FILTRO.status) &&
    (!FILTRO.tipo || d.tipo === FILTRO.tipo) &&
    (!busca || semAcento(d.equipe + ' ' + d.gerente + ' ' + d.tipo).toLowerCase().includes(busca))
  );
}

function agrupar(lista, chave) {
  const m = new Map();
  lista.forEach(d => {
    [].concat(chave(d)).forEach(k => {
      const g = m.get(k) || { chave: k, qtd: 0, valor: 0 };
      g.qtd++; g.valor += d.valor; m.set(k, g);
    });
  });
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

const unicos = campo => [...new Set(DADOS.flatMap(d => campo === 'gerente' ? d.gerentes : [d[campo]]))].sort(ordenarPt);

function ordenar(L) {
  const { campo, dir } = ORDEM;
  return [...L].sort((a, b) => campo === 'valor' ? (a.valor - b.valor) * dir : ordenarPt(a[campo], b[campo]) * dir);
}

const kpi = (rotulo, valor, sub, cor) =>
  `<div class="rr-kpi" style="--cor:${cor}"><small>${esc(rotulo)}</small><b>${valor}</b><em>${esc(sub)}</em></div>`;

function opcoes(campo) {
  return '<option value="">Todos</option>' +
    unicos(campo).map(v => `<option value="${esc(v)}" ${v === FILTRO[campo] ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function painelFiltros() {
  const ativos = Object.keys(FILTRO).filter(k => FILTRO[k]);
  return `<section class="rr-card noprint">
    <div class="rr-filtros">
      <label>Regional<select data-f="regional">${opcoes('regional')}</select></label>
      <label>Estado<select data-f="uf">${opcoes('uf')}</select></label>
      <label>Gerente<select data-f="gerente">${opcoes('gerente')}</select></label>
      <label>Status do gerente<select data-f="status">${opcoes('status')}</select></label>
      <label>Tipo de documento<select data-f="tipo">${opcoes('tipo')}</select></label>
      <label>Buscar<input data-f="busca" type="search" placeholder="Equipe, gerente ou tipo" value="${esc(FILTRO.busca)}"></label>
    </div>
    ${ativos.length ? `<div class="rr-chips">${ativos.map(k =>
      `<button type="button" class="rr-chip" data-limpar="${k}">${ROTULO_FILTRO[k]}: ${esc(FILTRO[k])} ✕</button>`).join('')}
      <button type="button" class="rr-chip" data-limpar="*" style="background:#f1f5f9;color:#334155">Limpar tudo</button></div>` : ''}
  </section>`;
}

function barras(grupos, cor) {
  if (!grupos.length) return '<p class="rr-msg">Sem dados.</p>';
  const max = Math.max(...grupos.map(g => g.valor), 1);
  return grupos.map(g => `<div class="rr-barra" title="${esc(g.chave)} · ${g.qtd} registro(s)">
    <span class="rot">${esc(g.chave)}</span>
    <span class="trilho"><i style="width:${Math.max(g.valor / max * 100, 1.5).toFixed(1)}%;--cor:${cor}"></i></span>
    <span class="val">${esc(fmtBRLcurto(g.valor))}</span></div>`).join('');
}

const painelBarras = (titulo, sub, grupos, cor) =>
  `<section class="rr-card"><div class="rr-titulo"><h2>${esc(titulo)}</h2><span>${esc(sub)}</span></div>${barras(grupos, cor)}</section>`;

function painelStatus(L, total) {
  const grupos = agrupar(L, d => d.status);
  const cores = { ok: COR.ok, pend: COR.pend, nok: COR.nok };
  const classeDe = s => statusClasse(s);
  let acc = 0;
  const fatias = grupos.map(g => {
    const ini = acc; acc += total ? g.valor / total * 100 : 0;
    return `${cores[classeDe(g.chave)]} ${ini.toFixed(2)}% ${acc.toFixed(2)}%`;
  });
  const fundo = fatias.length ? `conic-gradient(${fatias.join(',')})` : '#e2e8f0';
  return `<section class="rr-card"><div class="rr-titulo"><h2>Status do gerente</h2><span>por valor</span></div>
    <div class="rr-donut">
      <div class="anel" style="background:${fundo}" data-centro="${esc(fmtBRLcurto(total))}"></div>
      <div class="rr-legenda">${grupos.length ? grupos.map(g => `<div>
        <i style="background:${cores[classeDe(g.chave)]}"></i><span>${esc(g.chave)}</span>
        <b>${g.qtd} · ${esc(fmtBRLcurto(g.valor))}</b></div>`).join('') : '<span class="rr-msg">Sem dados.</span>'}</div>
    </div></section>`;
}

function painelRegionais(L, total) {
  const nomes = REGIONAIS.map(r => r.nome).concat(DADOS.some(d => d.regional === SEM_REGIONAL) ? [SEM_REGIONAL] : []);
  const cartoes = nomes.map(nome => {
    const itens = L.filter(d => d.regional === nome);
    const val = soma(itens, d => d.valor);
    const pend = itens.filter(d => d.classe === 'pend').length;
    const ger = agrupar(itens, d => d.gerentes).map(g => g.chave).filter(g => g !== SEM_GERENTE);
    const ufs = (REGIONAIS.find(r => r.nome === nome) || { ufs: [] }).ufs.join(' · ') || '—';
    const pct = total ? val / total * 100 : 0;
    return `<button type="button" class="rr-reg ${FILTRO.regional === nome ? 'ativa' : ''}" data-regional="${esc(nome)}">
      <h3><span>${esc(nome)}</span><span style="font-size:12px;color:var(--sub)">${pct.toFixed(1)}%</span></h3>
      <div class="ufs">${esc(ufs)}</div>
      <div class="valor">${esc(fmtBRLcurto(val))}</div>
      <div class="trilho"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="meta"><span>${itens.length} registro(s)</span><span>${pend} pendente(s)</span></div>
      <div class="rr-pills">${ger.length
        ? ger.slice(0, 3).map(g => `<span class="rr-pill">${esc(g)}</span>`).join('') + (ger.length > 3 ? `<span class="rr-pill">+${ger.length - 3}</span>` : '')
        : `<span class="rr-pill" style="color:var(--sub)">${SEM_GERENTE}</span>`}</div>
    </button>`;
  }).join('');
  return `<section class="rr-card"><div class="rr-titulo"><h2>Regionais</h2><span>clique para filtrar</span></div>
    <div class="rr-regionais">${cartoes}</div></section>`;
}

function painelDetalhe(L, total) {
  if (!L.length) return `<section class="rr-card"><div class="rr-titulo"><h2>Detalhamento</h2></div><p class="rr-msg">Nenhum registro para os filtros selecionados.</p></section>`;
  const seta = c => ORDEM.campo === c ? (ORDEM.dir > 0 ? ' ▲' : ' ▼') : '';
  const cab = COLUNAS.map(([c, t]) => `<th data-o="${c}" class="${c === 'valor' ? 'num' : ''}">${t}${seta(c)}</th>`).join('');
  const lista = ordenar(L), visiveis = lista.slice(0, LIMITE);
  const corpo = visiveis.map(d => `<tr>
    <td>${esc(d.regional)}</td><td>${esc(d.uf)}</td><td>${esc(d.gerente)}</td><td>${esc(d.equipe)}</td>
    <td>${esc(d.tipo)}</td><td><span class="rr-st ${d.classe}">${esc(d.status)}</span></td>
    <td class="num">${esc(fmtBRL(d.valor))}</td></tr>`).join('');
  return `<section class="rr-card"><div class="rr-titulo"><h2>Detalhamento</h2>
      <span>${visiveis.length} de ${lista.length} registro(s)</span></div>
    <div class="rr-tabela"><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody>
      <tfoot><tr><td colspan="6">Total (${lista.length} registros)</td><td class="num">${esc(fmtBRL(total))}</td></tr></tfoot></table></div>
    ${lista.length > LIMITE ? `<div class="rr-mais noprint"><button type="button" class="rr-btn" onclick="maisLinhas()">Mostrar mais ${Math.min(LINHAS_POR_PAGINA, lista.length - LIMITE)}</button></div>` : ''}
  </section>`;
}

function desenhar() {
  const app = el('app'); if (!app) return;
  if (CARGA === 'carregando') { app.innerHTML = '<div class="rr"><div class="rr-card"><p class="rr-msg">Carregando...</p></div></div>'; return; }

  const L = filtrados();
  const total = soma(L, d => d.valor);
  const pend = L.filter(d => d.classe === 'pend');
  const gerentes = new Set(L.flatMap(d => d.gerentes).filter(g => g !== SEM_GERENTE));
  const semGer = L.filter(d => d.gerentes.includes(SEM_GERENTE)).length;
  const semReg = L.filter(d => d.regional === SEM_REGIONAL).length;

  app.innerHTML = `<div class="rr">
    ${ERRO ? `<div class="rr-aviso">⚠ ${esc(ERRO)}</div>` : ''}
    ${painelFiltros()}

    <div class="rr-kpis">
      ${kpi('Valor total', esc(fmtBRL(total)), L.length + ' registro(s)', COR.azul)}
      ${kpi('Equipes', new Set(L.map(d => d.equipe)).size, 'com negociação', COR.indigo)}
      ${kpi('Gerentes', gerentes.size, semGer ? semGer + ' registro(s) sem gerente' : 'todos com gerente', COR.teal)}
      ${kpi('Pendentes', pend.length, fmtBRL(soma(pend, d => d.valor)), COR.pend)}
      ${kpi('Sem regional', semReg, semReg ? 'estado fora do mapa' : 'tudo mapeado', semReg ? COR.nok : COR.ok)}
    </div>

    ${painelRegionais(L, total)}

    <div class="rr-graficos">
      ${painelStatus(L, total)}
      ${painelBarras('Valor por estado', 'top 10', agrupar(L, d => d.uf).slice(0, 10), COR.azul)}
      ${painelBarras('Valor por gerente', 'top 10 · registro com 2 gerentes conta nos dois', agrupar(L, d => d.gerentes).slice(0, 10), COR.teal)}
      ${painelBarras('Valor por tipo de documento', 'top 10', agrupar(L, d => d.tipo).slice(0, 10), COR.indigo)}
      ${painelBarras('Valor por equipe', 'top 10', agrupar(L, d => d.equipe).slice(0, 10), COR.pend)}
    </div>

    ${painelDetalhe(L, total)}
  </div>`;

  ligarEventos(app);
}

function ligarEventos(app) {
  app.querySelectorAll('[data-f]').forEach(c => {
    c.addEventListener(c.tagName === 'INPUT' ? 'input' : 'change', () => {
      FILTRO[c.dataset.f] = c.value; LIMITE = LINHAS_POR_PAGINA;
      const ehBusca = c.tagName === 'INPUT';
      desenhar();
      if (ehBusca) { const n = app.querySelector('[data-f="busca"]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });
  });
  app.querySelectorAll('[data-limpar]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.limpar;
    if (k === '*') Object.keys(FILTRO).forEach(f => { FILTRO[f] = ''; }); else FILTRO[k] = '';
    LIMITE = LINHAS_POR_PAGINA; desenhar();
  }));
  app.querySelectorAll('[data-regional]').forEach(b => b.addEventListener('click', () => {
    FILTRO.regional = FILTRO.regional === b.dataset.regional ? '' : b.dataset.regional;
    LIMITE = LINHAS_POR_PAGINA; desenhar();
  }));
  app.querySelectorAll('th[data-o]').forEach(th => th.addEventListener('click', () => {
    const c = th.dataset.o;
    ORDEM = { campo: c, dir: ORDEM.campo === c ? -ORDEM.dir : (c === 'valor' ? -1 : 1) };
    desenhar();
  }));
}

function maisLinhas() { LIMITE += LINHAS_POR_PAGINA; desenhar(); }

carregarRelatorio();