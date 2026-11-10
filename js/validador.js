const DOCS = [
  { id:'aso',       ab:'ASO',      nome:'ASO',                                dica:'Exames obrigatórios, endereço da instituição e datas.' },
  { id:'os_nr01',   ab:'OS',       nome:'Ordem de Serviço (NR01)',            dica:'Nome/CNPJ/CPF, função, apto (eletricidade e altura) e riscos.' },
  { id:'nr35',      ab:'NR35',     nome:'NR 35 (Trabalho em altura)',         dica:'16 h, validade de 2 anos, 3 assinaturas (gov.br ou tudo manual).' },
  { id:'nr10',      ab:'NR10',     nome:'NR 10 (Trabalho em Eletricidade)',   dica:'40 h, validade de 2 anos, 4 assinaturas (gov.br ou tudo manual).' },
  { id:'nr06',      ab:'NR06',     nome:'NR 06 (Uso de EPI\'s)',              dica:'4 h, validade de 2 anos, 2 assinaturas (gov.br ou tudo manual).' },
  { id:'ficha_epi', ab:'EPI',      nome:'Ficha de EPI',                       dica:'Função igual ao ASO, CNPJ, razão social e campos de assinatura.' },
  { id:'contrato',  ab:'Contrato', nome:'Contrato + Anexo / Cartão CNPJ',     dica:'Datas, razão social, CPF/CNPJ e assinaturas.' },
  { id:'rg',        ab:'RG',       nome:'RG',  pessoal:true, dica:'Enviado pelo técnico (sem análise por IA).' },
  { id:'cnh',       ab:'CNH',      nome:'CNH', pessoal:true, dica:'Enviado pelo técnico (sem análise por IA).' }
];
const CAMPOS = [
  ['nome','Nome'], ['cpf','CPF'], ['cnpj','CNPJ'], ['razao_social','Razão social'],
  ['funcao','Função'], ['projeto','Projeto'],
  ['data_emissao','Data de emissão','data'], ['data_inicio','Início do treinamento','data'],
  ['data_fim','Fim do treinamento / conclusão','data'], ['carga_horaria_horas','Carga horária','horas'],
  ['endereco_instituicao','Endereço da instituição'], ['portaria_citada','Portaria citada'],
  ['dias_treinamento','Dias do treinamento'], ['aptidoes','Aptidões (apto para...)'], ['riscos','Riscos descritos']
];

let HIST = [], COLABS = [], EQUIPES = [], DIRET_HOM = [], carga = 'carregando', erroMsg = '';
let view = 'home', cur = null, curEq = null;
const F = { q:'', st:'', modo:'colab' };  
let ENV = novoENV();

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bdg = s => s === 'OK' || s === 'CONCLUÍDO' ? 'b-ok' : s === 'NOK' ? 'b-nok' : s === 'RELEVADO' ? 'b-rel' : 'b-warn';
const rot = s => s === 'ATENCAO' ? 'ATENÇÃO' : s;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const digitos = s => String(s || '').replace(/\D/g, '');
const fmtCpf = s => { const d = digitos(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (s || ''); };
const fmtDH = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : esc(s); };
const statusDoc = s => {
  s = String(s || '').toUpperCase();
  if (s === 'RELEVADO') return 'RELEVADO';
  return s === 'NOK' ? 'NOK' : (s === 'CONCLUÍDO' || s === 'CONCLUIDO' || s === 'OK') ? 'OK' : 'ATENCAO';
};
const tipoDe = r => {
  const L = DOCS.filter(d => !d.pessoal);
  return L.find(d => d.id === r.doc_id)
    || L.find(d => norm(d.nome) === norm(r.nome))
    || L.find(d => norm(r.tipo_identificado || '').includes(norm(d.ab))) || null;
};
const LS_EQ = 'vd_eq_local_v1';
function lerEqLocais() {
  try { const a = JSON.parse(localStorage.getItem(LS_EQ) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
let EQ_LOCAIS = lerEqLocais();
/* Equipes de homologação: a fonte da verdade é o Supabase (tabela hm_equipes).
   O localStorage é só cache offline. */
let _eqSnap = {};                       // key -> JSON já gravado no servidor
let _eqTimer = null, _eqPushando = false;
const _eqExcluidas = new Set();
function salvarEqLocais() {
  try { localStorage.setItem(LS_EQ, JSON.stringify(EQ_LOCAIS)); } catch (_) {}
  clearTimeout(_eqTimer);
  _eqTimer = setTimeout(enviarEqServidor, 400);
}
async function enviarEqServidor() {
  const token = tokenAdm();
  if (!token || _eqPushando) { if (token) _eqTimer = setTimeout(enviarEqServidor, 800); return; }
  _eqPushando = true;
  try {
    for (const q of EQ_LOCAIS.slice()) {
      const js = JSON.stringify(q);
      if (_eqSnap[q.key] === js) continue;
      await vdRpc('hm_equipe_salvar', { p_token: token, p_key: q.key, p_dados: q });
      _eqSnap[q.key] = js;
    }
  } catch (e) {
    toastDl('⚠ Não foi possível salvar a equipe no servidor: ' + e.message, true);
    _eqTimer = setTimeout(enviarEqServidor, 5000);
  }
  _eqPushando = false;
}
async function carregarEqServidor() {
  const token = tokenAdm();
  if (!token) throw new Error('sessão sem token');
  let L = await vdRpc('hm_equipes_listar', { p_token: token });
  if (L && !Array.isArray(L)) L = Array.isArray(L.data) ? L.data : [];
  const doServidor = (L || []).map(r => r.dados).filter(q => q && q.key);
  const chaves = new Set(doServidor.map(q => q.key));
  doServidor.forEach(sq => {
    const loc = EQ_LOCAIS.find(x => x.key === sq.key);
    const js = JSON.stringify(sq);
    if (!loc) { EQ_LOCAIS.push(sq); _eqSnap[sq.key] = js; return; }
    const sujo = _eqSnap[sq.key] !== undefined && JSON.stringify(loc) !== _eqSnap[sq.key];  
    if (!sujo) {                         
      Object.keys(loc).forEach(k => delete loc[k]);
      Object.assign(loc, sq);
      _eqSnap[sq.key] = js;
    }
  });
  EQ_LOCAIS = EQ_LOCAIS.filter(q => chaves.has(q.key) || _eqSnap[q.key] === undefined);
  EQ_LOCAIS = EQ_LOCAIS.filter(q => !_eqExcluidas.has(q.key));
  try { localStorage.setItem(LS_EQ, JSON.stringify(EQ_LOCAIS)); } catch (_) {}
  if (EQ_LOCAIS.some(q => _eqSnap[q.key] === undefined)) enviarEqServidor();
}

const eqNome = e => (e && (e.nome || e.lider)) || '';
const eqTitulo = e => { const n = eqNome(e); return /^equipe\b/i.test(n) ? n : 'Equipe ' + n; };

function eqLocalParaEquipe(q) {
  const membros = (q.membros || []).map(m => ({ cpf: digitos(m.cpf), nome: m.nome || '', lider: !!q.liderCpf && digitos(m.cpf) === q.liderCpf }));
  membros.sort((a, b) => (b.lider - a.lider) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const lid = membros.find(m => m.lider);
  return { key: q.key, nome: q.nome, lider: lid ? lid.nome : '', membros, local: true, criada_em: q.criada_em };
}

function mesclarEquipes(base) {
  return (base || []).filter(e => !e.local).concat(EQ_LOCAIS.map(eqLocalParaEquipe));
}
function recarregarEquipes() {
  EQUIPES = mesclarEquipes(EQUIPES);
  COLABS = agrupar();
  guardarHistLocal();
}
function criarEquipeLocal(nome) {
  const q = { key: 'hm:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nome: String(nome || '').trim(),
    liderCpf: '', membros: [], criada_em: new Date().toISOString(), concluida_em: null };
  EQ_LOCAIS.push(q); salvarEqLocais(); recarregarEquipes();
  return q;
}
mesclarEquipes = function (base) {
  const dbs = (base || []).filter(e => !e.local);
  const sobram = [];
  const novos = [];                                

  dbs.forEach(e => {
    const cpfs = e.membros.map(m => digitos(m.cpf)).filter(c => c.length === 11);
    const q = EQ_LOCAIS.find(x => (x.membros || []).some(m => cpfs.includes(digitos(m.cpf))));
    if (!q) { sobram.push(e); return; }              
    e.membros.forEach(m => {                
      const c = digitos(m.cpf);
      if (c.length !== 11 || q.membros.some(x => digitos(x.cpf) === c)) return;
      q.membros.push({ cpf: c, nome: m.nome || '' });
      novos.push({ q, m: { nome: m.nome || '', cpf: c } });
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
function addMembroLocal(key, nome, cpf) {
  const q = EQ_LOCAIS.find(x => x.key === key); cpf = digitos(cpf);
  if (!q || cpf.length !== 11) return false;
  const ex = q.membros.find(m => digitos(m.cpf) === cpf);
  if (ex) { if (!ex.nome && nome) ex.nome = nome; }
  else {
    q.membros.push({ cpf, nome: nome || '' });
    if (!q.liderCpf) q.liderCpf = cpf; 
  }
  salvarEqLocais(); recarregarEquipes();
  return true;
}
function definirLider(key, cpf) {
  const q = EQ_LOCAIS.find(x => x.key === key); if (!q) return;
  q.liderCpf = digitos(cpf); salvarEqLocais(); recarregarEquipes();
}
function removerMembroLocal(key, cpf) {
  const q = EQ_LOCAIS.find(x => x.key === key); if (!q) return;
  cpf = digitos(cpf);
  q.membros = q.membros.filter(m => digitos(m.cpf) !== cpf);
  if (q.liderCpf === cpf) q.liderCpf = q.membros[0] ? digitos(q.membros[0].cpf) : '';
  salvarEqLocais(); recarregarEquipes();
}
function renomearEquipeLocal(key, nome) {
  const q = EQ_LOCAIS.find(x => x.key === key); if (!q) return;
  q.nome = String(nome || '').trim() || q.nome; salvarEqLocais(); recarregarEquipes();
}
function excluirEquipeLocal(key) {
  _eqExcluidas.add(key);
  EQ_LOCAIS = EQ_LOCAIS.filter(x => x.key !== key); delete _eqSnap[key];
  try { localStorage.setItem(LS_EQ, JSON.stringify(EQ_LOCAIS)); } catch (_) {}
  recarregarEquipes();
  const token = tokenAdm();
  if (token) vdRpc('hm_equipe_excluir', { p_token: token, p_key: key })
    .catch(e => toastDl('⚠ Não foi possível excluir no servidor: ' + e.message, true));
}

function lerBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function lerAssinaturasPdf(file) {
  const nenhuma = { quantidade:0, signatarios:[] };
  if (!file || !(/pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name))) return nenhuma;
  try {
    const buf = await file.arrayBuffer();
    const txt = new TextDecoder('latin1').decode(buf);
    const quantidade = (txt.match(/\/ByteRange\s*\[/g) || []).length;
    const signatarios = [], vistos = new Set();
    const re = /\/Contents\s*<([0-9A-Fa-f\s]+)>/g;
    let m;
    while ((m = re.exec(txt))) {
      const hex = m[1].replace(/\s+/g, '').replace(/(00)+$/, '');
      if (hex.length < 200) continue;
      const bytes = new Uint8Array(hex.length >> 1);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      const s = new TextDecoder('utf-8').decode(bytes);
      const r2 = /([A-ZÀ-Ý][A-ZÀ-Ý' ]{4,}?):(\d{11})/g;  
      let n;
      while ((n = r2.exec(s))) {
        if (!vistos.has(n[2])) { vistos.add(n[2]); signatarios.push({ nome:n[1].trim(), cpf:n[2] }); }
      }
    }
    return { quantidade, signatarios };
  } catch (_) { return nenhuma; }
}

const resultadoNok = (d, grupo, item, obs) => ({ doc_id:(d && d.id) || 'desconhecido', nome:(d && d.nome) || 'Não identificado', status:'NOK', dados:{}, observacoes:'',
  itens:[{ grupo, item, status:'NOK', obs }] });

const VDSB = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});
const BUCKET_DOCS = 'documentos';

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
function docPessoalDe(docId) {
  const id = String(docId || '').trim().toLowerCase();
  const L = DOCS.filter(d => d.pessoal);
  return L.find(d => d.id === id)
    || L.find(d => id.startsWith(d.id))
    || L.find(d => norm(id).split(' ').includes(d.id))
    || null;
}

async function buscarDocsPessoais() {
  const sess = (window.vdSessao && window.vdSessao()) || {};
  if (!sess.token) throw new Error('sessão sem token (window.vdSessao não devolveu token)');
  let L = await vdRpc('painel_docs_tecnicos', { p_token: sess.token });
  if (L && !Array.isArray(L)) L = Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : []);
  return (L || []).map(e => {
    const d = docPessoalDe(e.doc_id);
    if (!d) console.warn('RG/CNH: doc_id não reconhecido, registro ignorado no painel:', e.doc_id, e);
    return {
      id: 'tec_' + e.id, origem: 'tecnico', doc_id: d ? d.id : String(e.doc_id || '').toLowerCase(),
      documento: d ? d.nome : e.doc_id,
      cpf: digitos(e.cpf), nome: e.nome || '', arquivo: e.arquivo, arquivo_path: e.arquivo_path,
      status: String(e.status || 'ENVIADO').toUpperCase(),
      data_hora: String(e.criado_em || '').slice(0, 16).replace('T', ' '),
      motivos_nok: '', validade: ''
    };
  });
}

async function buscarEquipes() {
  const sess = (window.vdSessao && window.vdSessao()) || {};
  if (!sess.token) throw new Error('sessão sem token');
  let L = await vdRpc('painel_equipes', { p_token: sess.token });
  if (L && !Array.isArray(L)) L = Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : []);
  return (L || []).map(e => {
    const lc = digitos(e.lider_cpf);
    const membros = (e.membros || []).map(m => ({ cpf: digitos(m.cpf), nome: m.nome || '', lider: !!m.lider || digitos(m.cpf) === lc }));
    if (lc && !membros.some(m => m.cpf === lc)) membros.unshift({ cpf: lc, nome: e.lider_nome || '', lider: true });
    membros.sort((a, b) => (b.lider - a.lider) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return { key: lc || 'eq:' + norm(e.lider_nome), lider: e.lider_nome || (membros[0] && membros[0].nome) || '', membros };
  }).filter(e => e.membros.length);
}

async function buscarHomologados() {
  const token = tokenAdm();
  if (!token) throw new Error('sessão sem token');
  let L = await vdRpc('diretoria_listar', { p_token: token, p_status: 'DECIDIDAS' });
  if (L && !Array.isArray(L)) L = Array.isArray(L.data) ? L.data : (Array.isArray(L.rows) ? L.rows : []);
  return (L || [])
    .filter(h => !h.decisao || String(h.decisao).toUpperCase().startsWith('HOMOLOG'))   
    .map(h => ({ cpf: digitos(h.cpf), nome: h.nome || '', decidido_em: h.decidido_em || '' }))
    .filter(h => h.cpf.length === 11);
}

const temArquivo = a => a.origem === 'tecnico' ? !!a.arquivo_path : !!a.arquivo_id;

async function blobDoc(a, cb) {
  if (a.origem !== 'tecnico') return obterBlobArquivo(a, cb);
  const r = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${a.arquivo_path}`,
    { headers: { apikey: VDSB.SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error('Arquivo não encontrado no Storage (' + r.status + ')');
  return r.blob();
}
const LS_HIST = 'vd_hist_v1';
function guardarHistLocal() {
  try { localStorage.setItem(LS_HIST, JSON.stringify({ hist: HIST, equipes: EQUIPES, homol: DIRET_HOM })); } catch (_) {}
}
function lerHistLocal() {
  let hist = [];
  try {
    const o = JSON.parse(localStorage.getItem(LS_HIST) || 'null');
    if (o && Array.isArray(o.equipes)) EQUIPES = o.equipes;
    if (o && Array.isArray(o.homol)) DIRET_HOM = o.homol;
    hist = o && Array.isArray(o.hist) ? o.hist : [];
  } catch (_) {}
  EQUIPES = mesclarEquipes(EQUIPES);  
  return hist;
}
let _carregandoHist = false;
async function carregarHist() {
  if (_carregandoHist) return;
  _carregandoHist = true;
  const tinha = COLABS.length > 0;  
  if (!tinha) { carga = 'carregando'; if (view !== 'envio') render(); }
  let avisoPessoais = '';
  try {
    await carregarEqServidor().catch(e => console.warn('Equipes de homologação:', e.message));
    const [j, pess, eqs, hom] = await Promise.all([
      chamarApi({ acao:'listar', limite:1000 }),
      buscarDocsPessoais().catch(e => {
        console.warn('RG/CNH:', e.message);
        avisoPessoais = 'RG/CNH não carregados: ' + e.message;
        return HIST.filter(x => x.origem === 'tecnico');
      }),
      buscarEquipes().catch(e => { console.warn('Equipes:', e.message); return EQUIPES; }),
      buscarHomologados().catch(e => { console.warn('Homologados:', e.message); return DIRET_HOM; })
    ]);
    EQUIPES = mesclarEquipes(eqs); DIRET_HOM = hom;
    HIST = (j.analises || []).concat(pess); carga = 'ok'; guardarHistLocal();
    COLABS = agrupar();
    if (view !== 'envio') render();
    if (avisoPessoais) toastDl('⚠ ' + avisoPessoais, true);
  } catch (e) {
    erroMsg = e.message;
    if (tinha) toastDl('Não foi possível atualizar: ' + e.message, true);
    else { carga = 'erro'; if (view !== 'envio') render(); }
  }
  _carregandoHist = false;
}
let _tb;
function buscaDebounce() { clearTimeout(_tb); _tb = setTimeout(renderLista, 150); }
function agrupar() {
  const ord = [...HIST].sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
  const grupos = [], porCpf = {}, porNome = {};
  let sem = null;
  ord.forEach(a => {
    const cpf = digitos(a.cpf), nm = norm(a.nome), cpfOk = cpf.length === 11;
    let g = null;
    if (!cpfOk && !nm) {
      if (!sem) { sem = { sem:true, key:'sem', nome:'', cpf:'', razao:'', envios:[], docs:{} }; }
      g = sem;
    } else {
      if (cpfOk) g = porCpf[cpf] || null;
      if (!g && nm) { const c = porNome[nm]; if (c && !(cpfOk && c.cpf && c.cpf !== cpf)) g = c; }
      if (!g) { g = { sem:false, nome:'', cpf:'', razao:'', envios:[], docs:{} }; grupos.push(g); }
      if (cpfOk && !g.cpf) g.cpf = cpf;
      if (g.cpf) porCpf[g.cpf] = g;
      if (nm) porNome[nm] = g;
      if (!g.nome && a.nome) g.nome = a.nome;
      if (!g.razao && a.razao_social) g.razao = a.razao_social;
    }
    g.envios.push(a);
    if (!g.docs[a.documento]) g.docs[a.documento] = a;
  });
  EQUIPES.forEach(eq => eq.membros.forEach(m => {
    if (m.cpf.length === 11 && !porCpf[m.cpf]) {
      const g = { sem:false, nome:m.nome || '', cpf:m.cpf, razao:'', envios:[], docs:{} };
      grupos.push(g); porCpf[m.cpf] = g;
    } else if (m.cpf.length === 11 && !porCpf[m.cpf].nome && m.nome) {
      porCpf[m.cpf].nome = m.nome;
    }
  }));
  DIRET_HOM.forEach(h => {
    let g = porCpf[h.cpf];
    if (!g) {
      g = { sem:false, nome:h.nome, cpf:h.cpf, razao:'', envios:[], docs:{} };
      grupos.push(g); porCpf[h.cpf] = g;
    } else if (!g.nome && h.nome) g.nome = h.nome;
    g.homol = h;
  });
  grupos.forEach(g => {
    g.key = g.cpf || 'n:' + norm(g.nome);
    const st = DOCS.map(d => g.docs[d.nome] ? statusDoc(g.docs[d.nome].status) : 'PENDENTE');
    g.st = st;
    g.nOk = st.filter(s => s === 'OK' || s === 'ATENCAO' || s === 'RELEVADO').length;
    g.nNok = st.filter(s => s === 'NOK').length;
    g.nPend = st.filter(s => s === 'PENDENTE').length;
    g.est = g.nNok ? 'nok' : (g.nOk === DOCS.length ? 'ok' : 'pend');
  });
  grupos.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  if (sem) grupos.push(sem);
  return grupos;
}

function render() {
  if (view === 'colab') renderColab();
  else if (view === 'equipe') renderEquipe();
  else if (view === 'envio') renderEnvio();
  else renderHome();
  window.scrollTo({ top:0 });
  painelFila();
}
function irHome() { view = 'home'; cur = null; curEq = null; render(); }
function voltarColab() { if (curEq && EQUIPES.some(e => e.key === curEq)) { view = 'equipe'; cur = null; render(); } else irHome(); }
function abrirColab(i, daEquipe) { cur = COLABS[i].key; if (!daEquipe) curEq = null; view = 'colab'; render(); }
function abrirEquipe(k) { curEq = k; cur = null; F.modo = 'equipe'; view = 'equipe'; render(); }

function renderHome() {
  el('app').innerHTML = `<div id="cont"></div>
    <div class="card">
      <div class="row noprint" style="margin:0 0 14px;gap:8px;flex-wrap:wrap">
        <button class="${F.modo === 'colab' ? 'primary' : 'ghost'}" onclick="F.modo='colab';renderHome()">👤 Colaboradores</button>
        <button class="${F.modo === 'equipe' ? 'primary' : 'ghost'}" onclick="F.modo='equipe';renderHome()">👥 Equipes (${EQUIPES.length})</button>
        <button class="primary" onclick="baixarOk()">⬇ Baixar todos os OK (.zip)</button>
      </div>
      <div class="hf2">
        <input type="text" id="fQ" placeholder="${F.modo === 'equipe' ? 'Buscar por equipe, líder, integrante ou CPF...' : 'Buscar por nome, CPF ou razão social...'}" value="${esc(F.q)}" oninput="F.q=this.value;buscaDebounce()">
        <select id="fSt" onchange="F.st=this.value;renderLista()">
          ${[['', 'Todos os status'], ['ok', F.modo === 'equipe' ? 'Equipe completa' : 'Documentação completa'], ['nok', F.modo === 'equipe' ? 'Com integrante NOK' : 'Com documento NOK'], ['pend', F.modo === 'equipe' ? 'Com pendência' : 'Com documento pendente']]
            .map(([v, t]) => `<option value="${v}" ${F.st === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div id="lista"></div>
    </div>`;
  renderLista();
}
function cardColab(g, daEquipe) {
  const i = COLABS.indexOf(g);
  const oc = `abrirColab(${i}${daEquipe ? ',true' : ''})`;
  if (g.sem) {
    return `<div class="ccard" onclick="${oc}"><div class="nm"><i>Sem colaborador identificado</i></div>
      <div class="sub">${g.envios.length} envio(s) sem nome/CPF legível. Clique para ver.</div></div>`;
  }
  const pOk = Math.round(g.nOk / DOCS.length * 100), pNok = Math.round(g.nNok / DOCS.length * 100);
  const rotEst = g.est === 'ok' ? ['b-ok', 'COMPLETO'] : g.est === 'nok' ? ['b-nok', 'COM NOK'] : ['b-warn', 'PENDENTE'];
  const nRel = g.st.filter(s => s === 'RELEVADO').length;
  return `<div class="ccard ${g.est}" onclick="${oc}">
    <div class="hd"><div><div class="nm">${esc(g.nome) || vazio('Nome não legível')}</div>
      <div class="sub">${g.cpf ? 'CPF ' + esc(fmtCpf(g.cpf)) : 'CPF não identificado'}${g.razao ? ' · ' + esc(g.razao) : ''}${g.homol ? ' Autorizado Homologaçao pela diretoria' + (g.envios.length ? '' : ' (aguardando documentos)') : ''}</div></div>
      <span class="badge ${rotEst[0]}">${rotEst[1]}</span></div>
    <div class="bar"><i class="g" style="width:${pOk}%"></i><i class="r" style="width:${pNok}%"></i></div>
    <div class="prog">${g.nOk} de ${DOCS.length} OK${nRel ? ' (' + nRel + ' relevado' + (nRel > 1 ? 's' : '') + ')' : ''}${g.nNok ? ' · ' + g.nNok + ' NOK' : ''}${g.nPend ? ' · ' + g.nPend + ' pendente(s)' : ''}</div>
    <div class="pills">${DOCS.map((d, k) => `<span class="pill ${g.st[k] === 'OK' ? 'ok' : g.st[k] === 'NOK' ? 'nok' : g.st[k] === 'ATENCAO' ? 'at' : g.st[k] === 'RELEVADO' ? 'rel' : ''}">${esc(d.ab)}</span>`).join('')}</div>
  </div>`;
}

function renderLista() {
  const box = el('lista'), cont = el('cont');
  if (!box) return;
  if (carga === 'carregando' && !COLABS.length) { cont.innerHTML = ''; box.innerHTML = '<p class="msg"><span class="spin"></span>Carregando do banco de dados...</p>'; return; }
  if (carga === 'erro' && !COLABS.length) { cont.innerHTML = ''; box.innerHTML = `<p class="msg" style="color:var(--nok)">⚠ ${esc(erroMsg)}</p>`; return; }

  if (F.modo === 'equipe') { renderEquipes(cont, box); return; }

  const pessoas = COLABS.filter(g => !g.sem);
  cont.innerHTML = `<div class="counters">
    <div class="cnt"><b>${pessoas.length}</b><span>Colaboradores</span></div>
    <div class="cnt ok"><b>${pessoas.filter(g => g.est === 'ok').length}</b><span>Documentação completa</span></div>
    <div class="cnt nok"><b>${pessoas.filter(g => g.est === 'nok').length}</b><span>Com documento NOK</span></div>
    <div class="cnt pend"><b>${pessoas.filter(g => g.est === 'pend').length}</b><span>Com pendência</span></div></div>`;

  const q = norm(F.q);
  const L = COLABS.filter(g => (!F.st || (!g.sem && g.est === F.st)) &&
    (!q || norm([g.nome, g.cpf, g.razao].join(' ')).includes(q) || (g.sem && 'sem colaborador identificado'.includes(q))));
  if (!L.length) { box.innerHTML = '<p class="msg">Nenhum colaborador encontrado.</p>'; return; }

  box.innerHTML = `<div class="cgrid">` + L.map(g => cardColab(g, false)).join('') + `</div>`;
}
const vazio = txt => `<span class="vazio">${txt}</span>`;

const grupoDoMembro = m => COLABS.find(c => !c.sem && m.cpf.length === 11 && c.cpf === m.cpf)
  || COLABS.find(c => !c.sem && m.nome && norm(c.nome) === norm(m.nome));

function resumoEquipe(eq) {
  const gs = eq.membros.map(grupoDoMembro).filter(Boolean);
  const nOk = gs.filter(g => g.est === 'ok').length, nNok = gs.filter(g => g.est === 'nok').length;
  const nPend = eq.membros.length - nOk - nNok;
  return { gs, nOk, nNok, nPend, est: !eq.membros.length ? 'pend' : (nNok ? 'nok' : (nPend ? 'pend' : 'ok')) };
}

function renderEquipes(cont, box) {
  const todas = EQUIPES.map(e => ({ e, r: resumoEquipe(e) }));
  cont.innerHTML = `<div class="counters">
    <div class="cnt"><b>${todas.length}</b><span>Equipes</span></div>
    <div class="cnt ok"><b>${todas.filter(x => x.r.est === 'ok').length}</b><span>Equipe completa</span></div>
    <div class="cnt nok"><b>${todas.filter(x => x.r.est === 'nok').length}</b><span>Com integrante NOK</span></div>
    <div class="cnt pend"><b>${todas.filter(x => x.r.est === 'pend').length}</b><span>Com pendência</span></div></div>`;
  if (!EQUIPES.length) {
    box.innerHTML = '<p class="msg">Nenhuma equipe ainda. Clique em <b>Disparar Homologação</b> para criar a primeira equipe.</p>';
    return;
  }
  const q = norm(F.q);
  const L = todas.filter(({ e, r }) => (!F.st || r.est === F.st) &&
    (!q || norm([eqNome(e), e.lider, ...e.membros.map(m => m.nome + ' ' + m.cpf)].join(' ')).includes(q)));
  if (!L.length) { box.innerHTML = '<p class="msg">Nenhuma equipe encontrada.</p>'; return; }
  box.innerHTML = `<div class="cgrid">` + L.map(({ e, r }) => {
    const n = e.membros.length || 1;
    const pOk = Math.round(r.nOk / n * 100), pNok = Math.round(r.nNok / n * 100);
    const rotEst = r.est === 'ok' ? ['b-ok', 'COMPLETA'] : r.est === 'nok' ? ['b-nok', 'COM NOK'] : ['b-warn', 'PENDENTE'];
    return `<div class="ccard ${r.est}" onclick="abrirEquipe('${esc(e.key)}')">
      <div class="hd"><div><div class="nm">${esc(eqTitulo(e)) || vazio('sem nome')}</div>
        <div class="sub">${e.membros.length} pessoa(s)${e.lider ? ' · líder ' + esc(e.lider) : ''}</div></div>
        <span class="badge ${rotEst[0]}">${rotEst[1]}</span></div>
      <div class="bar"><i class="g" style="width:${pOk}%"></i><i class="r" style="width:${pNok}%"></i></div>
      <div class="prog">${e.membros.length ? r.nOk + ' completo(s)' + (r.nNok ? ' · ' + r.nNok + ' com NOK' : '') + (r.nPend ? ' · ' + r.nPend + ' com pendência' : '') : 'Sem integrantes: envie documentos para formar a equipe'}</div>
      <div class="pills">${e.membros.map(m => {
        const g = grupoDoMembro(m);
        return `<span class="pill ${g ? (g.est === 'ok' ? 'ok' : g.est === 'nok' ? 'nok' : '') : ''}">${esc((m.nome || 'Sem nome').split(' ')[0])}${m.lider ? ' ★' : ''}</span>`;
      }).join('')}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderEquipe() {
  const eq = EQUIPES.find(e => e.key === curEq);
  if (!eq) { irHome(); return; }
  const r = resumoEquipe(eq), loc = !!eq.local, k = esc(eq.key);
  const rotEst = r.est === 'ok' ? ['b-ok', 'EQUIPE COMPLETA'] : r.est === 'nok' ? ['b-nok', 'COM INTEGRANTE NOK'] : ['b-warn', 'COM PENDÊNCIA'];
  el('app').innerHTML = `<div class="card">
    <div class="chead"><div><h2>${esc(eqTitulo(eq))}</h2>
      <div class="msg" style="margin-top:2px">${eq.membros.length} pessoa(s)${eq.lider ? ' · Líder: ' + esc(eq.lider) : ''}. Clique em uma pessoa para tratar só os documentos dela.</div>
      <div style="margin-top:10px"><span class="badge ${rotEst[0]}">${rotEst[1]}</span>
        <span class="msg"> &nbsp;${r.nOk} completo(s)${r.nNok ? ' · ' + r.nNok + ' com NOK' : ''}${r.nPend ? ' · ' + r.nPend + ' com pendência' : ''}</span></div></div>
      <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap">
        ${loc ? `<button class="primary" onclick="novoEnvioEquipe('${k}')">📤 Enviar documento</button>
          <button class="ghost" onclick="abrirAddMembro('${k}')">＋ Integrante</button>
          <button class="ghost" onclick="eqRenomear('${k}')">✎ Renomear</button>
          <button class="ghost" onclick="eqExcluir('${k}')">🗑 Excluir</button>` : ''}
        <button class="ghost" onclick="irHome()">← Voltar às equipes</button></div></div>
    ${typeof fluxoEquipe === 'function' ? fluxoEquipe(eq) : ''}
    ${!eq.membros.length ? '<p class="msg">Equipe ainda sem integrantes. Clique em <b>📤 Enviar documento</b>: a pessoa identificada no documento entra na equipe automaticamente (ou use <b>＋ Integrante</b>).</p>' : ''}
    <div class="cgrid">${eq.membros.map(m => {
      const g = grupoDoMembro(m);
      const ctl = loc ? `<div class="noprint" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        ${m.lider ? '<span class="badge b-ok">★ Líder</span>' : `<button class="ghost sm" onclick="eqSetLider('${k}','${esc(m.cpf)}')">★ Tornar líder</button>`}
        <button class="ghost sm" onclick="eqRemover('${k}','${esc(m.cpf)}')">Remover da equipe</button></div>` : '';
      return g ? `<div>${m.lider ? '<div class="evid">★ Líder da equipe</div>' : '<div class="evid">Integrante</div>'}${cardColab(g, true)}${ctl}</div>`
               : `<div><div class="ccard"><div class="nm">${esc(m.nome) || vazio('Sem nome')}</div><div class="sub">CPF ${esc(fmtCpf(m.cpf)) || 'não informado'} · sem dados no painel</div></div>${ctl}</div>`;
    }).join('')}</div></div>`;
}

function linhaDoc(g, k) {
  const d = DOCS[k], a = g.docs[d.nome], st = g.st[k], tec = !!(a && a.origem === 'tecnico');
  const cls = st === 'RELEVADO' ? 'rel' : st === 'OK' || st === 'ATENCAO' ? 'ok' : st === 'NOK' ? 'nok' : 'pend';
  const badge = st === 'PENDENTE' ? 'b-warn' : bdg(st);
  const txt = st === 'PENDENTE' ? 'PENDENTE' : (tec && st === 'ATENCAO') ? 'RECEBIDO' : rot(st);
  return `<div class="drow ${cls}">
    <div style="flex:1;min-width:200px"><b>${esc(d.nome)}</b>
      <div class="evid">${a ? esc(a.arquivo) + ' · ' + fmtDH(a.data_hora) : (d.pessoal ? 'Técnico ainda não enviou' : 'Nenhum arquivo enviado')}</div>
      ${a && st === 'NOK' && a.motivos_nok ? `<div class="motivo">${esc(a.motivos_nok)}</div>` : ''}
      ${a && st === 'RELEVADO' ? `<div class="relinfo">⚖ NOK relevado${a.relevado_em ? ' em ' + fmtDH(a.relevado_em) : ''}${a.justificativa_relevado ? ': ' + esc(a.justificativa_relevado) : ''}${a.motivos_nok ? '<br>NOK original: ' + esc(a.motivos_nok) : ''}</div>` : ''}</div>
    <span class="badge ${badge}">${txt}</span>
    <div class="btns">
      ${a ? `<button class="ghost sm" onclick="verArquivoHist('${esc(a.id)}')">🔍 Ver arquivo</button>` : ''}
      ${a && !tec ? `<button class="ghost sm" onclick="detalheHist('${esc(a.id)}','dd_')">Detalhes</button>` : ''}
      ${a && !tec && st === 'NOK' ? `<button class="ghost sm" onclick="relevarNok('${esc(a.id)}')">⚖ Relevar NOK</button>` : ''}
      ${a && st === 'RELEVADO' ? `<button class="ghost sm" onclick="desfazerRelevo('${esc(a.id)}')">↩ Desfazer</button>` : ''}
      ${a ? `<button class="ghost sm" onclick="baixarDoc('${esc(a.id)}')">⬇ Baixar Doc</button>` : ''}
      ${d.pessoal ? '' : `<button class="${a ? 'ghost' : 'primary'} sm" onclick="novoEnvio('${esc(g.key)}')">${a ? 'Reenviar' : 'Enviar'}</button>`}
    </div></div>
    ${a && !tec ? `<div class="dbox hidden" id="dd_${esc(a.id)}"></div>` : ''}
    ${a && st === 'NOK' ? blocoSugestao(d.id, g.cpf, esc(a.id)) : ''}`; 
}

function tabelaEnvios(lista) {
  return `<div style="overflow-x:auto"><table><tr><th>Data</th><th>Documento</th><th>Colaborador</th><th>Status</th><th>Motivos NOK</th><th></th></tr>` +
    lista.map(a => `<tr><td>${fmtDH(a.data_hora)}</td><td>${esc(a.documento)}<div class="evid">${esc(a.arquivo)}</div></td>
      <td>${esc(a.nome) || vazio('—')}</td><td><span class="badge ${bdg(a.status)}">${esc(a.status)}</span></td>
      <td>${esc(a.motivos_nok) || '-'}${a.status === 'RELEVADO' && a.justificativa_relevado ? `<div class="relinfo">Justificativa: ${esc(a.justificativa_relevado)}</div>` : ''}</td>
      <td style="white-space:nowrap"><button class="ghost sm" onclick="verArquivoHist('${esc(a.id)}')">🔍 Ver arquivo</button>
      <button class="ghost sm" onclick="baixarDoc('${esc(a.id)}')">⬇ Baixar Doc</button>
      ${a.origem === 'tecnico' ? '' : `<button class="ghost sm" onclick="detalheHist('${esc(a.id)}','hd_')">Detalhes</button>`}</td></tr>
      <tr class="trd hidden" id="hd_${esc(a.id)}"><td colspan="6"></td></tr>`).join('') + `</table></div>`;
}

const RESP_DOCS = [
  { t: 'Responsabilidade da Empresa', cls: 'ok',  ids: ['aso', 'os_nr01', 'ficha_epi'] },
  { t: 'Responsabilidade do Técnico', cls: 'nok', ids: ['nr35', 'nr10', 'nr06', 'contrato', 'rg', 'cnh'] }
];

function renderColab() {
  const g = COLABS.find(c => c.key === cur);
  if (!g) { irHome(); return; }
  const eqAtual = curEq ? EQUIPES.find(e => e.key === curEq) : null;
  const rotVoltar = eqAtual ? '← Voltar: ' + esc(eqTitulo(eqAtual)) : '← Voltar à lista';
  if (g.sem) {
    el('app').innerHTML = `<div class="card"><div class="chead"><div><h2>Sem colaborador identificado</h2>
      <p class="dica">Envios em que não foi possível ler nome nem CPF. Abra o arquivo para conferir.</p></div>
      <button class="ghost" onclick="voltarColab()">${rotVoltar}</button></div>${tabelaEnvios(g.envios)}</div>`;
    return;
  }
  const secoes = RESP_DOCS.map(r => {
    const idx = r.ids.map(id => DOCS.findIndex(d => d.id === id)).filter(k => k >= 0);
    const feitos = idx.filter(k => ['OK', 'ATENCAO', 'RELEVADO'].includes(g.st[k])).length;
    return { ...r, idx, feitos };
  });
  const rotEst = g.est === 'ok' ? ['b-ok', 'DOCUMENTAÇÃO COMPLETA'] : g.est === 'nok' ? ['b-nok', 'COM DOCUMENTO NOK'] : ['b-warn', 'COM PENDÊNCIA'];
  el('app').innerHTML = `<div class="card">
    <div class="chead"><div><h2>${esc(g.nome) || vazio('Nome não legível')}</h2>
      <div class="msg" style="margin-top:2px">${g.cpf ? 'CPF ' + esc(fmtCpf(g.cpf)) : 'CPF não identificado'}${g.razao ? ' · ' + esc(g.razao) : ''}${eqAtual ? ' · ' + esc(eqTitulo(eqAtual)) : ''}${g.homol ? ' · ⚖ Homologado pela diretoria em ' + esc(fmtDH(String(g.homol.decidido_em).replace('T',' '))) : ''}</div>
      <div style="margin-top:10px"><span class="badge ${rotEst[0]}">${rotEst[1]}</span>
        <span class="msg"> &nbsp;${g.nOk} de ${DOCS.length} OK${g.nNok ? ' · ' + g.nNok + ' NOK' : ''}${g.nPend ? ' · ' + g.nPend + ' pendente(s)' : ''}</span></div></div>
      <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" onclick="baixarOk('${esc(g.key)}')">⬇ Baixar OK</button><button class="ghost" onclick="voltarColab()">${rotVoltar}</button></div></div>

    ${secoes.map(s => `<div class="secT ${s.cls}">${esc(s.t)} (${s.feitos} de ${s.idx.length} OK)</div>
      ${s.idx.map(k => linhaDoc(g, k)).join('')}`).join('')}

    <details class="noprint"><summary>Histórico de todos os envios deste colaborador (${g.envios.length})</summary>${tabelaEnvios(g.envios)}</details>
  </div>`;
}

let _mUrl = null, _vm = null, _vmZ = 70;

function vmEnsure() {
  if (_vm) return _vm;
  const d = document.createElement('div');
  d.id = 'vmodal'; d.className = 'vm';
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="vm-box">
    <div class="vm-head">
      <div class="vm-txt"><div class="vm-tit"></div><div class="vm-sub"></div></div>
      <div class="vm-tools">
        <span id="vmZoomBox" style="display:none;align-items:center;gap:4px">
          <button class="vm-btn" onclick="vmZoom(-15)" title="Diminuir">−</button>
          <span class="vm-zoomlbl" id="vmZ">70%</span>
          <button class="vm-btn" onclick="vmZoom(15)" title="Aumentar">+</button>
          <button class="vm-btn" onclick="vmZoom(0)" title="Ajustar">Ajustar</button>
        </span>
        <a class="vm-btn" id="vmDl" title="Baixar">⬇ <span class="t">Baixar</span></a>
        <a class="vm-btn" id="vmNew" target="_blank" rel="noopener" title="Abrir em nova aba">↗ <span class="t">Nova aba</span></a>
        <button class="vm-btn x" onclick="fecharModal()" title="Fechar (Esc)">✕</button>
      </div>
    </div>
    <div class="vm-body"></div></div>`;
  d.addEventListener('mousedown', e => { if (e.target === d) fecharModal(); });
  document.body.appendChild(d);
  return (_vm = d);
}

function abrirModalUrl(tit, url, img, revogar) {
  fecharModal();
  _mUrl = revogar ? url : null;
  const m = vmEnsure(), partes = String(tit || '').split(' — ');
  const nomeArq = (partes[1] || partes[0] || 'documento').trim();
  m.querySelector('.vm-tit').textContent = partes[0];
  m.querySelector('.vm-sub').textContent = partes.slice(1).join(' — ');
  const dl = m.querySelector('#vmDl'), nv = m.querySelector('#vmNew');
  dl.href = url; dl.download = nomeArq; nv.href = url;
  m.querySelector('.vm-body').innerHTML = img
    ? `<div class="vm-img"><img id="vmImg" src="${url}" alt="documento"></div>`
    : `<iframe src="${url}" title="documento"></iframe>`;
  m.querySelector('#vmZoomBox').style.display = img ? 'inline-flex' : 'none';
  _vmZ = 70; vmZoom(0);
  m.classList.add('on');
  document.body.style.overflow = 'hidden';
}
function vmZoom(d) {
  _vmZ = d === 0 ? 70 : Math.max(20, Math.min(300, _vmZ + d));
  const i = el('vmImg'); if (i) i.parentNode.style.setProperty('--z', _vmZ + '%');
  const l = el('vmZ'); if (l) l.textContent = _vmZ + '%';
}
function fecharModal() {
  if (_vm) { _vm.classList.remove('on'); _vm.querySelector('.vm-body').innerHTML = ''; }
  document.body.style.overflow = '';
  if (_mUrl) { URL.revokeObjectURL(_mUrl); _mUrl = null; }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

function vmDialog(html, onMount) {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'vm on';
    o.innerHTML = `<div class="vm-box vm-sm">${html}</div>`;
    const fim = v => { document.removeEventListener('keydown', escH, true); o.remove(); res(v); };
    const escH = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); fim(null); } };
    document.addEventListener('keydown', escH, true);
    o.addEventListener('mousedown', e => { if (e.target === o) fim(null); });
    document.body.appendChild(o);
    onMount(o, fim);
  });
}

function pedirJustificativa(titulo, motivos) {
  return vmDialog(`
    <div class="vm-head"><div class="vm-ico warn">⚖</div>
      <div class="vm-txt"><div class="vm-tit">Relevar NOK</div>
      <div class="vm-sub">${esc(titulo || '')} · a justificativa fica registrada</div></div></div>
    <div class="vm-content">
      ${motivos ? `<div class="vm-motivos">${esc(motivos)}</div>` : ''}
      <label>Justificativa <span>(obrigatória, mínimo 5 caracteres)</span></label>
      <textarea maxlength="500" placeholder="Explique por que este NOK pode ser relevado..."></textarea>
      <div class="vm-count"><span>0</span>/500</div>
    </div>
    <div class="vm-foot"><button class="ghost" data-x>Cancelar</button>
      <button class="primary" data-ok disabled>⚖ Relevar e concluir</button></div>`,
  (o, fim) => {
    const ta = o.querySelector('textarea'), ok = o.querySelector('[data-ok]'), c = o.querySelector('.vm-count span');
    ta.oninput = () => { c.textContent = ta.value.length; ok.disabled = ta.value.trim().length < 5; };
    o.querySelector('[data-x]').onclick = () => fim(null);
    ok.onclick = () => fim(ta.value.trim());
    ta.focus();
  });
}

function confirmarAcao(titulo, texto, rotuloOk) {
  return vmDialog(`
    <div class="vm-head"><div class="vm-ico nok">!</div><div class="vm-txt"><div class="vm-tit">${esc(titulo)}</div></div></div>
    <div class="vm-content" style="font-size:14px;color:#334155">${esc(texto)}</div>
    <div class="vm-foot"><button class="ghost" data-x>Cancelar</button>
      <button class="primary" data-ok>${esc(rotuloOk || 'Confirmar')}</button></div>`,
  (o, fim) => {
    o.querySelector('[data-x]').onclick = () => fim(null);
    o.querySelector('[data-ok]').onclick = () => fim(true);
    o.querySelector('[data-ok]').focus();
  }).then(v => !!v);
}

async function verArquivoHist(id) {
  const a = HIST.find(x => x.id === id); if (!a) return;
  if (!temArquivo(a)) { alert('Este arquivo não foi guardado (upload feito antes da atualização do histórico).'); return; }
  try {
    toastDl('Abrindo ' + a.documento + '...');
    const blob = await blobDoc(a, (f, n) => toastDl('Abrindo ' + a.documento + (n > 1 ? ' (' + f + '/' + n + ')' : '') + '...'));
    const t = el('dlToast'); if (t) t.classList.add('hidden');
    abrirModalUrl(a.documento + ' — ' + a.arquivo, URL.createObjectURL(blob), (blob.type || '').startsWith('image/'), true);
  } catch (e) { const t = el('dlToast'); if (t) t.classList.add('hidden'); alert('Não foi possível abrir o arquivo: ' + e.message); }
}
async function detalheHist(id, pref) {
  const box = el(pref + id); if (!box) return;
  const td = box.tagName === 'TR' ? box.firstElementChild : box;
  if (td.dataset.ok) { box.classList.toggle('hidden'); return; }
  box.classList.remove('hidden'); td.innerHTML = '<span class="spin"></span>Carregando...';
  try {
    const j = await chamarApi({ acao:'detalhe', id });
    td.dataset.ok = 1;
    td.innerHTML = tabelaItens({ itens:(j.itens || []).map(i => ({ ...i, obs:i.detalhe })), observacoes:'' }) +
      (j.texto ? `<details><summary>Texto lido do documento</summary><pre class="raw">${esc(j.texto)}</pre></details>` : '');
  } catch (e) { td.innerHTML = `<span class="msg" style="color:var(--nok)">⚠ ${esc(e.message)}</span>`; }
}
async function aplicarRelevo(id, relevar, justificativa) {
  const y = window.scrollY;
  await chamarApi({ acao:'relevar', id, relevar, justificativa });
  const a = HIST.find(x => x.id === id);
  if (a) {
    if (relevar) {
      if (a.status !== 'RELEVADO') a.status_original = a.status;
      a.status = 'RELEVADO';
      a.justificativa_relevado = justificativa;
      a.relevado_em = new Date().toISOString().slice(0, 16).replace('T', ' ');
    } else {
      a.status = a.status_original || 'NOK';
      a.justificativa_relevado = ''; a.relevado_em = '';
    }
  }
  if (a) {
    const stRol = statusDoc(a.status) === 'ATENCAO' ? 'OK' : statusDoc(a.status);
    atualizarStatusRollout(a.cpf, (DOCS.find(d => d.nome === a.documento) || {}).id, stRol);
  }
  COLABS = agrupar(); guardarHistLocal(); render(); window.scrollTo({ top:y });
}
async function relevarNok(id) {
  const a = HIST.find(x => x.id === id); if (!a) return;
  const just = await pedirJustificativa(a.documento, a.motivos_nok);
  if (just === null) return;
  try { await aplicarRelevo(id, true, just); }
  catch (e) { toastDl('Não foi possível relevar: ' + e.message, true); }
}
async function desfazerRelevo(id) {
  if (!await confirmarAcao('Desfazer relevo', 'O documento volta para o status NOK.', 'Desfazer relevo')) return;
  try { await aplicarRelevo(id, false, ''); }
  catch (e) { toastDl('Não foi possível desfazer: ' + e.message, true); }
}

function fmtValor(tipo, v) {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.length ? v.join('; ') : null;
  if (typeof v === 'object') return JSON.stringify(v);
  if (tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  if (tipo === 'horas') return `${v} h`;
  return String(v);
}
const TIPO_ASS = { govbr:'gov.br', manual:'Manual', incerto:'Incerto', ausente:'Ausente' };
const evidTxt = t => t ? `<div class="evid">${esc(t)}</div>` : '';

function blocoDados(r) {
  const temDados = r.dados && Object.keys(r.dados).length;
  const tr = r.trechos || {};
  let h = `<div class="sec">Dados extraídos <span class="msg">(confira com o documento original)</span></div>
    ${r.tipo_identificado ? `<p class="msg">Tipo identificado pelo GPT: ${esc(r.tipo_identificado)}</p>` : ''}`;
  if (temDados) {
    const conhecidos = CAMPOS.map(c => c[0]);
    const campos = CAMPOS.concat(Object.keys(r.dados).filter(k => !conhecidos.includes(k)).map(k => [k, k]));
    h += `<div class="dados">` + campos.map(([k, rotulo, tipo]) => {
      const v = fmtValor(tipo, r.dados[k]);
      const t = typeof tr[k] === 'string' ? tr[k] : '';
      return `<div class="dado"><small>${esc(rotulo)}</small>${v ? `<span>${esc(v)}</span>` : vazio('não encontrado')}${evidTxt(t)}</div>`;
    }).join('') + `</div>`;
  } else {
    h += `<p class="msg">O GPT não devolveu os campos de dados para este documento.</p>`;
  }
  if (r.assinaturas?.length) {
    h += `<div class="sec">Assinaturas encontradas</div>
      <table><tr><th>Papel</th><th>Encontrada</th><th>Tipo</th><th>Nome do assinante</th><th>Evidência no documento</th></tr>` +
      r.assinaturas.map(a => `<tr><td>${esc(a.papel)}</td><td>${a.presente ? 'Sim' : 'Não'}</td><td>${esc(TIPO_ASS[a.tipo] || a.tipo || '-')}</td>
        <td>${a.nome_assinante ? esc(a.nome_assinante) : vazio('não legível')}</td>
        <td>${evidTxt((a.pagina ? 'p. ' + a.pagina + ': ' : '') + (a.evidencia || '')) || '-'}</td></tr>`).join('') + `</table>`;
  }
  if (r.exames?.length) {
    h += `<div class="sec">Exames encontrados</div>
      <table><tr><th>Exame pedido</th><th>Encontrado</th><th>Nome no documento</th><th>Data</th><th>Evidência no documento</th></tr>` +
      r.exames.map(e => `<tr><td>${esc(e.exame)}</td><td>${e.presente ? 'Sim' : 'Não'}</td>
        <td>${e.nome_no_documento ? esc(e.nome_no_documento) : vazio('—')}</td>
        <td>${esc(fmtValor('data', e.data) || '-')}</td>
        <td>${evidTxt((e.pagina ? 'p. ' + e.pagina + ': ' : '') + (e.evidencia || '')) || '-'}</td></tr>`).join('') + `</table>`;
  }
  h += `<details class="noprint"><summary>Texto lido do documento (transcrição do GPT)</summary>` +
    (r.texto_extraido ? `<pre class="raw">${esc(r.texto_extraido)}</pre>` : `<p class="msg">O GPT não devolveu a transcrição.</p>`) + `</details>`;
  if (r.bruto) h += `<details class="noprint"><summary>Ver resposta completa do GPT (JSON)</summary><pre class="raw">${esc(JSON.stringify(r.bruto, null, 2))}</pre></details>`;
  return h;
}
function tabelaItens(r) {
  return `<div class="sec">Verificações</div>
    <table><tr><th>Grupo</th><th>Verificação</th><th>Status</th><th>Detalhe</th><th>Evidência no documento</th></tr>` +
    r.itens.map(i => `<tr><td>${esc(i.grupo)}</td><td>${esc(i.item)}</td><td><span class="badge ${bdg(i.status)}">${rot(i.status)}</span></td><td>${esc(i.obs)}</td><td>${evidTxt(i.evidencia) || '-'}</td></tr>`).join('') +
    `</table>${r.observacoes ? `<p class="msg">${esc(r.observacoes)}</p>` : ''}`;
}

const ROLLOUT_DOCS = ['aso','os_nr01','nr06','nr10','nr35','ficha_epi'];
const dataIso = v => /^\d{4}-\d{2}-\d{2}/.test(v || '') ? String(v).slice(0, 10) : null;
const linkStorage = c => `${VDSB.SUPABASE_URL}/storage/v1/object/public/${BUCKET_DOCS}/${c}`;
const tokenAdm = () => ((window.vdSessao && window.vdSessao()) || {}).token;

async function enviarParaRollout(f, r) {
  const dd = r.dados || {}, reg = r.registro || {};
  const tipo = tipoDe(r);
  if (!tipo || !ROLLOUT_DOCS.includes(tipo.id)) return;       
  const cpf = digitos(dd.cpf);
  if (cpf.length !== 11) { toastDl('⚠ Rollout: CPF não identificado no documento, não enviado.', true); return; }
  const token = tokenAdm();
  if (!token) { toastDl('⚠ Rollout: sessão sem token.', true); return; }

  const caminho = `${cpf}/${tipo.id}_${Date.now()}.${extDe(f.name, f.type)}`;
  const hdr = { apikey: VDSB.SUPABASE_ANON_KEY };
  let subiu = false;
  try {
    const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`,
      { method: 'POST', body: f, headers: { ...hdr, 'Content-Type': f.type || 'application/pdf' } });
    if (!up.ok) { const j = await up.json().catch(() => null); throw new Error((j && (j.message || j.error)) || 'upload ' + up.status); }
    subiu = true;
    const st = String(r.status || '').toUpperCase();
    await vdRpc('rollout_registrar_doc_adm', {
      p_token: token, p_cpf: cpf, p_doc_id: tipo.id,
      p_nome: dd.nome || null, p_funcao: dd.funcao || null, p_cnpj: dd.cnpj || null,
      p_carga: dd.carga_horaria_horas ? parseInt(dd.carga_horaria_horas, 10) || null : null,
      p_emissao: dataIso(dd.data_emissao),
      p_validade: dataIso(reg.validade || r.validade || dd.data_validade),
      p_status: r.relevado ? 'RELEVADO' : (st === 'NOK' ? 'NOK' : 'OK'),
      p_link: linkStorage(caminho)
    });
    toastDl('Enviado para o rollout.', true);
  } catch (e) {
    if (subiu) { try { await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`, { method: 'DELETE', headers: hdr }); } catch (_) {} }
    toastDl('⚠ Rollout: ' + e.message, true);
  }
}

async function atualizarStatusRollout(cpf, docId, status) {
  const token = tokenAdm();
  if (!token || !docId || digitos(cpf).length !== 11) return;
  try { await vdRpc('rollout_atualizar_status', { p_token: token, p_cpf: digitos(cpf), p_doc_id: docId, p_status: status }); }
  catch (e) { console.warn('Rollout (status):', e.message); }
}
const IDB_NOME = 'vd_fila_v1', IDB_STORE = 'itens', MAX_PAR = 4;
const FN_URL = VDSB.SUPABASE_URL + '/functions/v1/processar-fila';
const EM_ANDAMENTO = ['fila', 'analisando', 'servidor', 'finalizando'];
let FILA = [], _seq = 0, _workers = 0, _precisaHist = false, _selEstado = '', _poll = null;

function novoENV(back, eq) { return { back: back || null, eq: eq || null, sel: null }; }

function idb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(IDB_NOME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(IDB_STORE, { keyPath: 'uid' });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
const slim = r => { if (!r) return null; const { bruto, texto_extraido, ...resto } = r; return resto; };
async function idbPut(it) {
  try {
    const db = await idb();
    const rec = { uid: it.uid, file: it.file, eq: it.eq, back: it.back, estado: it.estado,
                  jobId: it.jobId || null, erro: it.erro || '', aviso: it.aviso || '',
                  res: slim(it.res), criado: it.criado };
    await new Promise((ok, no) => { const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(rec); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
  } catch (_) {}
}
async function idbDel(uid) {
  try {
    const db = await idb();
    await new Promise(ok => { const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(uid); tx.oncomplete = ok; tx.onerror = ok; });
  } catch (_) {}
}
async function idbTodos() {
  const db = await idb();
  return new Promise((ok, no) => { const rq = db.transaction(IDB_STORE).objectStore(IDB_STORE).getAll();
    rq.onsuccess = () => ok(rq.result || []); rq.onerror = () => no(rq.error); });
}

function criarItem(file, extra) {
  return Object.assign({
    uid: 'f' + Date.now().toString(36) + (++_seq), file, url: URL.createObjectURL(file),
    image: (file.type || '').startsWith('image/'), eq: ENV.eq, back: ENV.back,
    estado: 'fila', res: null, sigs: null, aviso: '', erro: '', jobId: null, criado: Date.now()
  }, extra || {});
}

function addArquivos(files) {
  const ok = (files || []).filter(f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name) || (f.type || '').startsWith('image/'));
  if (!ok.length) { toastDl('Nenhum PDF/imagem válido selecionado.', true); return; }
  ok.forEach(f => {
    const it = criarItem(f);
    if (f.size > 15 * 1048576) {
      it.estado = 'erro';
      it.res = resultadoNok(null, 'Documento', 'Tamanho do arquivo', 'Arquivo acima de 15 MB. Reduza/comprima o PDF.');
    }
    FILA.push(it); idbPut(it);
    if (!ENV.sel) ENV.sel = it.uid;
  });
  if (view === 'envio') renderEnvio();
  painelFila(); bombear();
}

function bombear() {
  while (_workers < MAX_PAR) {
    const it = FILA.find(x => x.estado === 'fila');
    if (!it) break;
    _workers++;
    processar(it).finally(() => { _workers--; bombear(); });
  }
  if (!_workers && !FILA.some(x => x.estado === 'fila') && _precisaHist) { _precisaHist = false; carregarHist(); }
}

async function processar(it) {
  it.estado = 'analisando'; it.erro = ''; atualizarUI();
  try {
    const f = it.file;
    if (!it.jobId) {
      const caminho = `fila/${it.uid}.${extDe(f.name, f.type)}`;
      const up = await fetch(`${VDSB.SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${caminho}`, {
        method: 'POST', body: f,
        headers: { apikey: VDSB.SUPABASE_ANON_KEY, 'Content-Type': f.type || 'application/pdf', 'x-upsert': 'true' } });
      if (!up.ok) throw new Error('Upload falhou (' + up.status + ')');
      it.sigs = await lerAssinaturasPdf(f);
      it.jobId = await vdRpc('fila_enfileirar', { p_token: tokenAdm(), p_path: caminho,
        p_nome: f.name, p_mime: f.type || 'application/pdf', p_contexto: { assinaturas_digitais: it.sigs } });
    }
    it.estado = 'servidor'; idbPut(it);
    fetch(FN_URL, { method: 'POST' }).catch(() => {});  
    pollFila();
  } catch (e) {
    it.estado = 'erro'; it.erro = e.message;
    it.res = resultadoNok(null, 'Sistema', 'Falha no envio', e.message); idbPut(it);
  }
  atualizarUI();
}


function pollFila() {
  if (_poll) return;
  _poll = setInterval(async () => {
    const ativos = FILA.filter(x => x.estado === 'servidor' && x.jobId);
    if (!ativos.length) { clearInterval(_poll); _poll = null; return; }
    try {
      const L = await vdRpc('fila_listar', { p_token: tokenAdm(), p_ids: ativos.map(x => x.jobId) });
      for (const j of (L || [])) {
        const it = FILA.find(x => x.jobId === j.id);
        if (!it || it.estado !== 'servidor') continue;
        if (j.estado === 'concluido') await concluirItem(it, j.resultado);
        else if (j.estado === 'erro') {
          it.estado = 'erro'; it.erro = j.erro || 'Falha no servidor';
          it.res = resultadoNok(null, 'Sistema', 'Falha na análise', it.erro); idbPut(it); atualizarUI();
        }
      }
    } catch (_) {}
  }, 5000);
}

async function concluirItem(it, resultado) {
  it.estado = 'finalizando';
  it.res = resultado;
  if (it.res && it.res.registro) {
    HIST = HIST.filter(x => x.id !== it.res.registro.id);
    HIST.unshift(it.res.registro); COLABS = agrupar(); guardarHistLocal();
  }
  if (it.eq && it.res && it.res.dados && Object.keys(it.res.dados).length) {
    const dd = it.res.dados, cpf = digitos(dd.cpf);
    if (cpf.length === 11) { addMembroLocal(it.eq, dd.nome || '', cpf); it.aviso = '✓ ' + (dd.nome || fmtCpf(cpf)) + ' está na equipe.'; }
    else it.aviso = '⚠ CPF não identificado no documento: ninguém foi adicionado à equipe.';
  }
  await enviarParaRollout(it.file, it.res);
  it.estado = 'pronto'; idbPut(it); _precisaHist = true; atualizarUI(); bombear();
}

async function retomarFila() {
  try {
    const recs = await idbTodos(), limite = Date.now() - 864e5;
    for (const r of recs) {
      if (r.criado < limite) { idbDel(r.uid); continue; }
      if (FILA.some(x => x.uid === r.uid)) continue;
      FILA.push(criarItem(r.file, { uid: r.uid, eq: r.eq, back: r.back, aviso: r.aviso, erro: r.erro, res: r.res,
        jobId: r.jobId, criado: r.criado,
        estado: (r.estado === 'pronto' || r.estado === 'erro') ? r.estado : (r.jobId ? 'servidor' : 'fila') }));
    }
    if (FILA.some(x => x.estado === 'fila' || x.estado === 'servidor')) toastDl('Retomando análise de documentos pendentes...', true);
    painelFila(); bombear(); pollFila();
  } catch (_) {}
}

function selFila(uid) { ENV.sel = uid; renderEnvio(); }
const itemSel = () => FILA.find(x => x.uid === ENV.sel) || null;
function removerFila(uid) {
  const it = FILA.find(x => x.uid === uid); if (!it || EM_ANDAMENTO.includes(it.estado)) return;
  URL.revokeObjectURL(it.url); FILA = FILA.filter(x => x !== it); idbDel(uid);
  if (ENV.sel === uid) ENV.sel = null;
  renderEnvio(); painelFila();
}
function tentarDeNovo(uid) {
  const it = FILA.find(x => x.uid === uid); if (!it || it.file.size > 15 * 1048576) return;
  it.estado = 'fila'; it.res = null; it.jobId = null; it.erro = '';
  renderEnvio(); painelFila(); bombear();
}
function limparConcluidos() {
  FILA.filter(x => x.estado === 'pronto').forEach(it => { URL.revokeObjectURL(it.url); idbDel(it.uid); });
  FILA = FILA.filter(x => x.estado !== 'pronto');
  if (!itemSel()) ENV.sel = null;
  renderEnvio();
}

function abrirFila() { view = 'envio'; render(); }
function painelFila() {
  let p = el('filaBox');
  const pend = FILA.filter(x => EM_ANDAMENTO.includes(x.estado));
  if (!pend.length || view === 'envio') { if (p) p.classList.add('hidden'); return; }
  if (!p) {
    p = document.createElement('div'); p.id = 'filaBox'; p.onclick = abrirFila;
    p.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:60;background:#0f172a;color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;max-width:340px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(p);
  }
  p.innerHTML = `<span class="spin"></span>Analisando documentos: ${FILA.length - pend.length} de ${FILA.length} concluídos<br><small>Continua em segundo plano. Clique para ver.</small>`;
  p.classList.remove('hidden');
}
function atualizarUI() {
  painelFila();
  if (view !== 'envio' || !el('filaLista')) return;
  renderFilaLista();
  const it = itemSel();
  if ((it ? it.estado : '') !== _selEstado) renderEnvio();
}
function stItem(it) {
  if (it.estado === 'fila') return ['b-warn', 'NA FILA'];
  if (it.estado === 'analisando') return ['b-warn', 'ENVIANDO...'];
  if (it.estado === 'servidor' || it.estado === 'finalizando') return ['b-warn', 'ANALISANDO NO SERVIDOR'];
  if (it.estado === 'erro') return ['b-nok', 'ERRO'];
  const r = it.res || {};
  if (r.relevado) return ['b-rel', 'RELEVADO'];
  const s = statusDoc(r.status);
  return s === 'NOK' ? ['b-nok', 'NOK'] : s === 'ATENCAO' ? ['b-warn', 'ATENÇÃO'] : ['b-ok', 'OK'];
}
function renderFilaLista() {
  const box = el('filaLista'); if (!box) return;
  if (!FILA.length) { box.innerHTML = ''; return; }
  const feitos = FILA.filter(x => x.estado === 'pronto' || x.estado === 'erro').length;
  box.innerHTML = `<div class="sec">Fila de envio (${feitos} de ${FILA.length} analisados)
      ${FILA.some(x => x.estado === 'pronto') ? '<button class="ghost sm" onclick="limparConcluidos()" style="margin-left:8px">Limpar concluídos</button>' : ''}</div>` +
    FILA.map(it => {
      const [bc, bt] = stItem(it), r = it.res, tipo = r ? tipoDe(r) : null, dd = (r && r.dados) || {};
      const andando = EM_ANDAMENTO.includes(it.estado);
      const cls = it.uid === ENV.sel ? 'drow ' + (bc === 'b-ok' ? 'ok' : bc === 'b-nok' ? 'nok' : 'pend') : 'drow';
      return `<div class="${cls}" style="cursor:pointer" onclick="selFila('${it.uid}')">
        <div style="flex:1;min-width:200px"><b>${esc(it.file.name)}</b>
          <div class="evid">${tipo ? esc(tipo.nome) : (it.estado === 'pronto' ? 'tipo não reconhecido' : '')}${dd.nome ? ' · ' + esc(dd.nome) : ''}${it.erro ? ' · ' + esc(it.erro) : ''}</div></div>
        <span class="badge ${bc}">${andando && it.estado !== 'fila' ? '<span class="spin"></span>' : ''}${bt}</span>
        <div class="btns" onclick="event.stopPropagation()">
          ${it.estado === 'erro' && it.file.size <= 15 * 1048576 ? `<button class="ghost sm" onclick="tentarDeNovo('${it.uid}')">↻ Tentar de novo</button>` : ''}
          ${!andando ? `<button class="ghost sm" onclick="removerFila('${it.uid}')">✕</button>` : ''}
        </div></div>`;
    }).join('');
}

function verIdentificado(uid) {
  const it = FILA.find(x => x.uid === uid); if (!it) return;
  const dd = (it.res && it.res.dados) || {}, cpf = digitos(dd.cpf), nm = norm(dd.nome);
  const g = COLABS.find(c => !c.sem && ((cpf.length === 11 && c.cpf === cpf) || (nm && norm(c.nome) === nm)));
  if (g) {
    const eq = curEq ? EQUIPES.find(e => e.key === curEq) : null;
    if (!eq || !eq.membros.some(m => m.cpf === g.cpf)) curEq = null;
    cur = g.key; view = 'colab'; render();
  } else irHome();
}
function baixarEnvio(uid) {
  const it = FILA.find(x => x.uid === uid); if (!it) return;
  const f = it.file, r = it.res || {}, reg = r.registro || {}, dd = r.dados || {};
  const tipo = it.res ? tipoDe(r) : null;
  const docNome = (tipo && tipo.nome) || reg.documento || 'DOCUMENTO';
  const nome = (reg.nome || dd.nome || 'SEM NOME').toUpperCase();
  const validade = reg.validade || r.validade || dd.data_validade || '';
  salvarBlob(f, `${limparNome(docNome)}_${limparNome(nome)}_${fmtValidadeArq(validade)}.${extDe(f.name, f.type)}`);
  toastDl('Arquivo baixado.', true);
}
async function relevarEnvio(uid) {
  const it = FILA.find(x => x.uid === uid), r = it && it.res; if (!r || !r.id) return;
  const motivos = r.itens.filter(i => i.status === 'NOK').map(i => '• ' + i.item).join('\n');
  const just = await pedirJustificativa((tipoDe(r) || {}).nome, motivos);
  if (just === null) return;
  try {
    await chamarApi({ acao: 'relevar', id: r.id, relevar: true, justificativa: just });
    r.relevado = true; r.justificativa_relevado = just; idbPut(it);
    atualizarStatusRollout(r.dados?.cpf, (tipoDe(r) || {}).id, 'RELEVADO');
    render(); carregarHist();
  } catch (e) { toastDl('Não foi possível relevar: ' + e.message, true); }
}
function soltar(ev) {
  ev.preventDefault(); ev.currentTarget.classList.remove('over');
  addArquivos(Array.from(ev.dataTransfer.files || []));
}

function blocoResultado(it) {
  const r = it.res; if (!r) return '';
  const tipo = tipoDe(r), dd = r.dados || {};
  const motivos = r.itens.filter(i => i.status === 'NOK'), avisos = r.itens.filter(i => i.status === 'ATENCAO');
  const relevado = !!r.relevado, valido = r.status !== 'NOK' || relevado, ab = tipo ? tipo.ab : 'DOCUMENTO';
  const back = ENV.back ? COLABS.find(c => c.key === ENV.back) : null;
  const eqEnv = ENV.eq ? EQUIPES.find(e => e.key === ENV.eq) : null;

  let h = `<div class="tipo">Tipo identificado: <span class="badge">${tipo ? esc(tipo.nome) : 'não reconhecido'}</span></div>
    <div class="veredito ${relevado ? 'rel' : valido ? 'ok' : 'nok'}">${relevado ? '⚖ ' + esc(ab) + ' — NOK RELEVADO, CONCLUÍDO' : valido ? '✓ ' + esc(ab) + ' OK' : '✗ ' + esc(ab) + ' NOK'}</div>
    ${it.aviso ? `<p class="msg">${esc(it.aviso)}</p>` : ''}`;
  if (!valido && tipo) h += blocoSugestao(tipo.id, dd.cpf, 'env');

  let det = '';
  if (motivos.length) det += `<div class="sec">Motivos do NOK</div><ul style="margin:6px 0 0;padding-left:20px;font-size:14px">${motivos.map(m => `<li><b>${esc(m.item)}</b>${m.obs ? ': ' + esc(m.obs) : ''}</li>`).join('')}</ul>`;
  if (relevado && r.justificativa_relevado) det += `<p class="msg">Justificativa do relevo: ${esc(r.justificativa_relevado)}</p>`;
  if (valido && !relevado && avisos.length) det += `<div class="sec">Atenções</div><ul style="margin:6px 0 0;padding-left:20px;font-size:14px">${avisos.map(m => `<li><b>${esc(m.item)}</b>${m.obs ? ': ' + esc(m.obs) : ''}</li>`).join('')}</ul>`;
  if (dd.nome || dd.cpf) det += `<p class="msg">Documento identificado como de: <b>${esc(dd.nome || 'nome não legível')}</b>${dd.cpf ? ' · CPF ' + esc(fmtCpf(dd.cpf)) : ''}</p>`;
  if (back && dd.nome && back.nome && norm(dd.nome) !== norm(back.nome))
    det += `<div class="aviso">⚠ O nome no documento (${esc(dd.nome)}) não confere com o colaborador selecionado (${esc(back.nome)}). O arquivo será listado no colaborador identificado no documento.</div>`;
  const sg = it.sigs;
  if (sg && sg.quantidade > 0) {
    det += `<div class="sec">Assinaturas digitais embutidas no arquivo</div>
      <p class="msg">O PDF contém <b>${sg.quantidade}</b> assinatura(s) digital(is) (certificado), mesmo que não apareçam desenhadas na página.
      ${sg.signatarios.length ? '' : 'Os nomes dos signatários não puderam ser lidos do certificado.'}</p>` +
      (sg.signatarios.length ? `<table><tr><th>Signatário (certificado)</th><th>CPF</th></tr>` +
        sg.signatarios.map(s => `<tr><td>${esc(s.nome)}</td><td>${esc(fmtCpf(s.cpf))}</td></tr>`).join('') + `</table>` : '');
    const semAss = (r.assinaturas || []).some(a => !a.presente) || r.itens.some(i => i.status === 'NOK' && /assinatura/i.test(i.grupo + ' ' + i.item));
    if (semAss) det += `<div class="aviso">⚠ O arquivo tem assinatura digital, mas a análise marcou assinatura como ausente. Confira abrindo o arquivo no leitor de PDF (o aviso "não foi possível verificar algumas assinaturas" costuma ser só da cadeia de certificados do gov.br).</div>`;
  }
  det += blocoDados(r) + tabelaItens(r);
  h += `<details class="retorno noprint"><summary>Ver retorno da IA</summary>${det}</details>`;
  if (!r.salvo && r.erro_salvar) h += `<p class="msg" style="color:var(--warn)">⚠ A análise não foi salva no histórico: ${esc(r.erro_salvar)}</p>`;

  h += `<div class="row"><button class="primary" onclick="verIdentificado('${it.uid}')">👤 Ver colaborador</button>
    ${eqEnv ? '<button class="ghost" onclick="sairEnvio()">👥 Voltar à equipe</button>' : ''}
    <button class="ghost" onclick="baixarEnvio('${it.uid}')">⬇ Baixar documento</button>
    ${!valido && r.id ? `<button class="primary" style="background:#4f46e5" onclick="relevarEnvio('${it.uid}')">⚖ Relevar NOK e concluir</button>` : ''}</div>`;
  return h;
}
function renderEnvio() {
  const back = ENV.back ? COLABS.find(c => c.key === ENV.back) : null;
  const eqEnv = ENV.eq ? EQUIPES.find(e => e.key === ENV.eq) : null;
  const it = itemSel();
  _selEstado = it ? it.estado : '';
  let h = `<div class="card">
    <div class="chead"><div><h2>Enviar documentos${eqEnv ? ' — ' + esc(eqTitulo(eqEnv)) : back ? ' — ' + esc(back.nome || 'colaborador') : ''}</h2>
      <p class="dica">Selecione ou arraste <b>vários arquivos de uma vez</b>. A IA identifica o tipo de cada documento e a pessoa, diz se está OK ou NOK${eqEnv ? ', e a pessoa entra na equipe automaticamente' : ''}. A análise roda no servidor: você pode mudar de tela ou fechar a página e voltar depois.</p></div>
      <button class="ghost" onclick="sairEnvio()">${eqEnv ? '← Voltar à equipe' : '← Voltar'}</button></div>
    <label class="drop" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="soltar(event)">
      <input type="file" multiple accept=".pdf,image/*" onchange="addArquivos(Array.from(this.files));this.value=''">
      <div class="big">📤</div><div><b>Clique para escolher</b> ou arraste os arquivos aqui</div>
      <div class="msg">PDF ou imagem, até ~15 MB cada. Aceitos: ${DOCS.filter(x => !x.pessoal).map(x => esc(x.ab)).join(', ')}.</div>
    </label>
    <div id="filaLista"></div>`;

  if (it) {
    h += `<div class="filechip"><div class="th">${it.image ? `<img src="${it.url}" alt="">` : '📄'}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:600;word-break:break-all">${esc(it.file.name)}</div>
      <div class="msg" style="margin:0">${(it.file.size / 1048576).toFixed(1)} MB</div></div></div>`;
    if (it.estado === 'fila') h += '<div class="row"><span class="msg">Na fila, aguardando envio...</span></div>';
    else if (it.estado === 'analisando') h += '<div class="row"><span class="msg"><span class="spin"></span>Enviando o arquivo ao servidor...</span></div>';
    else if (it.estado === 'servidor' || it.estado === 'finalizando') h += '<div class="row"><span class="msg"><span class="spin"></span>Analisando no servidor... pode levar até alguns minutos. Você pode sair desta tela.</span></div>';
    else h += blocoResultado(it);
  }
  h += `</div>`;
  const preview = it ? `<div class="card preview"><div class="ph"><span>Documento selecionado</span>
      <span class="phb">
        <button class="ghost sm" onclick="baixarEnvio('${it.uid}')">⬇ Baixar</button>
        <button class="ghost sm" onclick="const i=itemSel();abrirModalUrl(i.file.name.replace(/'/g,''), i.url, i.image, false)">⛶ Tela cheia</button>
      </span></div>
      ${it.image ? `<img src="${it.url}" alt="documento">` : `<iframe src="${it.url}" title="documento"></iframe>`}</div>` : '';
  el('app').innerHTML = it ? `<div class="split"><div>${h}</div>${preview}</div>` : h;
  renderFilaLista();
  if (el('sg_env')) sugerirParceiro('sg_env');
}
function novoEnvio(back, eq) {
  ENV = novoENV(typeof back === 'string' ? back : null, typeof eq === 'string' ? eq : null);
  if (ENV.eq) curEq = ENV.eq;
  view = 'envio'; render();
}
function validarEnvio() { return Promise.resolve(); }  

function novoEnvioEquipe(key) { curEq = key; novoEnvio(null, key); }
function sairEnvio() {
  if (ENV.eq && EQUIPES.find(e => e.key === ENV.eq)) { view = 'equipe'; curEq = ENV.eq; cur = null; }
  else if (ENV.back && COLABS.find(c => c.key === ENV.back)) { view = 'colab'; cur = ENV.back; }
  else { view = 'home'; cur = null; curEq = null; }
  render();
}
const limparNome = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
const extDe = (nome, mime) => {
  const m = String(nome || '').match(/\.([A-Za-z0-9]{2,5})$/);
  if (m) return m[1].toLowerCase();
  return String(mime || '').startsWith('image/') ? String(mime).split('/')[1].replace('jpeg', 'jpg') : 'pdf';
};
const fmtValidadeArq = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : 'SEM VALIDADE'; };
function toastDl(msg, fim) {
  let t = el('dlToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'dlToast';
    t.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:200;background:#0f172a;color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.remove('hidden');
  if (fim) setTimeout(() => t.classList.add('hidden'), 6000);
}
function salvarBlob(blob, nome) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
function b64ParaU8(b64) {
  if (typeof b64 !== 'string') throw new Error('resposta sem dados do arquivo');
  let s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); 
  if (s.length % 4 === 1) throw new Error('base64 inválido (' + s.length + ' caracteres)');
  while (s.length % 4) s += '=';
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function baixarDoc(id) {
  const a = HIST.find(x => x.id === id);
  if (!a) return;
  if (!temArquivo(a)) {
    alert('Este arquivo não foi guardado (upload feito antes da atualização do histórico).');
    return;
  }
  try {
    toastDl('Baixando ' + a.documento + '...');
    const blob = await blobDoc(a, (f, n) => toastDl('Baixando ' + a.documento + (n > 1 ? ' (' + f + '/' + n + ')' : '') + '...'));

    const nomeColab = (a.nome || 'SEM NOME').toUpperCase();
    const base = `${limparNome(a.documento)}_${limparNome(nomeColab)}_${fmtValidadeArq(a.validade)}`;
    salvarBlob(blob, `${base}.${extDe(a.arquivo, blob.type)}`);
    toastDl('Arquivo baixado.', true);
  } catch (e) {
    toastDl('Erro ao baixar: ' + e.message, true);
  }
}

let baixando = false;
async function baixarOk(key) {
  if (baixando) return;
  const itens = [];
  COLABS.filter(g => !g.sem && (!key || g.key === key)).forEach(g =>
    DOCS.forEach((d, k) => {
      const a = g.docs[d.nome];
      if (a && (g.st[k] === 'OK' || g.st[k] === 'RELEVADO' || a.origem === 'tecnico')) itens.push({ g, d, a });
    }));
  if (!itens.length) { alert('Nenhum documento com status OK para baixar.'); return; }
  const semArq = itens.filter(i => !temArquivo(i.a)).length;
  const lista = itens.filter(i => temArquivo(i.a));
  if (!lista.length) { alert('Os documentos OK não têm arquivo guardado.'); return; }

  baixando = true;
  const usados = new Set(), prontos = [], falhas = [];
  let feitos = 0, prox = 0;
  const trabalhador = async () => {
    while (prox < lista.length) {
      const it = lista[prox++];
      try {
        const blob = await blobDoc(it.a);
        const base = `${limparNome(it.d.nome)}_${limparNome((it.g.nome || 'SEM NOME').toUpperCase())}_${fmtValidadeArq(it.a.validade)}`;
        const ext = extDe(it.a.arquivo, blob.type);
        let nome = `${base}.${ext}`, n = 2;
        while (usados.has(nome)) nome = `${base} (${n++}).${ext}`;
        usados.add(nome);
        prontos.push({ nome, blob });
      } catch (e) { falhas.push(`${it.d.nome} - ${it.g.nome}`); }
      toastDl(`Baixando ${++feitos} de ${lista.length}...`);
    }
  };
  try {
    await Promise.all([trabalhador(), trabalhador()]);
    if (!prontos.length) throw new Error('Nenhum arquivo pôde ser baixado.');
    if (prontos.length === 1) {
      salvarBlob(prontos[0].blob, prontos[0].nome);
    } else {
      if (typeof JSZip === 'undefined') throw new Error('Biblioteca de zip não carregou. Recarregue a página.');
      const zip = new JSZip();
      prontos.forEach(p => zip.file(p.nome, p.blob));
      toastDl('Compactando...');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });  
      salvarBlob(blob, g1 ? `${limparNome(g1.nome || 'colaborador')}_documentos_OK.zip`
                         : `DOCUMENTOS_OK_${new Date().toISOString().slice(0, 10)}.zip`);
    }
    toastDl(`${prontos.length} arquivo(s) baixado(s)` + (falhas.length ? ` · ${falhas.length} falharam` : '') + (semArq ? ` · ${semArq} sem arquivo guardado` : '') + '.', true);
    if (falhas.length) alert('Não foi possível baixar:\n' + falhas.join('\n'));
  } catch (e) { toastDl('Erro: ' + e.message, true); }
  baixando = false;
}

window.addEventListener('load', () => retomarFila());

document.addEventListener('visibilitychange', () => { if (!document.hidden && view !== 'envio') carregarHist(); });
setInterval(() => { if (!document.hidden && view !== 'envio') carregarHist(); }, 60000);