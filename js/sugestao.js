const SBP = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});

const SUG_CFG = {
  aso:  { tipo: 'ASO',         campo: null,   rot: 'clínica de ASO' },
  nr35: { tipo: 'TREINAMENTO', campo: 'nr35', rot: 'centro de treinamento (NR 35)' },
  nr10: { tipo: 'TREINAMENTO', campo: 'nr10', rot: 'centro de treinamento (NR 10)' },
  nr06: { tipo: 'TREINAMENTO', campo: 'nr06', rot: 'centro de treinamento (NR 06)' }
};

const CEP_RPC = 'cep_do_tecnico';

(function () {
  const s = document.createElement('style');
  s.textContent = `
    .sugest { margin:6px 0 14px; padding:10px 12px; border:1px dashed var(--line); border-radius:10px; background:#f8fafc; }
    .sgcard { padding:8px 0; border-top:1px solid var(--line); }
    .sgcard:first-of-type { border-top:0; }
    .sgcard .mini { font-size:12px; color:var(--mut); margin-top:3px; word-break:break-word; }
    .sgcard .valor { font-weight:800; color:var(--brand); font-size:14px; margin-top:6px; }
    .sgbox { display:flex; gap:8px; max-width:280px; margin-top:6px; }
    .sgbox input { flex:1; }
    .sgdiag { font-size:12px; color:var(--mut); margin:6px 0 0; padding-left:18px; }
  `;
  document.head.appendChild(s);
})();

async function sbGet(caminho) {
  const r = await fetch(`${SBP.SUPABASE_URL}/rest/v1/${caminho}`, { headers: { apikey: SBP.SUPABASE_ANON_KEY } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.message || j.error)) || 'Falha no servidor (' + r.status + ')');
  return j;
}
async function sbRpc(fn, args) {
  const r = await fetch(`${SBP.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SBP.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.message || j.error)) || 'Falha no servidor (' + r.status + ')');
  return j;
}

let _parcP = null;
function parceirosCache() {
  if (!_parcP) _parcP = sbGet('parceiros?select=*&limit=2000').catch(e => { _parcP = null; throw e; });
  return _parcP;
}

async function cepDoColaborador(cpf) {
  const c = digitos(cpf), diag = [];
  if (c.length === 11) {
    try {
      const sess = (window.vdSessao && window.vdSessao()) || {};
      if (!sess.token) throw new Error('sessão não encontrada; entre novamente');
      const r = await sbRpc(CEP_RPC, { p_token: sess.token, p_cpf: c });
      if (digitos(r).length === 8) return { cep: digitos(r), origem: 'tecnicos', diag };
      diag.push('tecnicos: nenhum registro com este CPF, ou o CEP está vazio');
    } catch (e) { diag.push('tecnicos: ' + e.message); }
  } else {
    diag.push('CPF do documento não foi identificado');
  }
  const a = (typeof HIST !== 'undefined' ? HIST : []).find(x => digitos(x.cpf) === c && x.dados && digitos(x.dados.cep).length === 8);
  if (a) return { cep: digitos(a.dados.cep), origem: 'documento enviado', diag };
  return { cep: '', origem: '', diag };
}

const LS_GEO = 'vd_geo_v1';
let _geo = {};
try { _geo = JSON.parse(localStorage.getItem(LS_GEO) || '{}'); } catch (_) {}

async function infoCep(cep) {
  if (_geo[cep]) return _geo[cep];
  let o = { cidade: '', uf: '', lat: null, lon: null };
  let achou = false;
  try {
    const r = await fetch('https://brasilapi.com.br/api/cep/v2/' + cep);
    if (r.status === 404) throw Object.assign(new Error('CEP não encontrado.'), { final: true });
    if (r.ok) {
      const j = await r.json(), c = j.location && j.location.coordinates;
      o = {
        cidade: j.city || '', uf: j.state || '',
        lat: c && c.latitude ? parseFloat(c.latitude) : null,
        lon: c && c.longitude ? parseFloat(c.longitude) : null
      };
      achou = true;
    }
  } catch (e) { if (e.final) throw e; }
  if (!achou) {  
    try {
      const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
      if (r.ok) {
        const j = await r.json();
        if (j.erro) throw Object.assign(new Error('CEP não encontrado.'), { final: true });
        o = { cidade: j.localidade || '', uf: j.uf || '', lat: null, lon: null };
      }
    } catch (e) { if (e.final) throw e; }
  }
  if (o.cidade || o.uf) {
    _geo[cep] = o;
    try { localStorage.setItem(LS_GEO, JSON.stringify(_geo)); } catch (_) {}
  }
  return o;
}

function kmEntre(a, b) {
  if (!a || !b || a.lat == null || b.lat == null || isNaN(a.lat) || isNaN(b.lat)) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function emLotes(lista, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) { const x = lista[i++]; try { await fn(x); } catch (_) {} }
  }));
}

async function ranquear(cep, cfg) {
  const [parc, ref] = await Promise.all([parceirosCache(), infoCep(cep)]);
  let L = parc.filter(p => p.tipo === cfg.tipo);
  if (cfg.campo) {   // prefere quem tem valor cadastrado para aquela NR
    const com = L.filter(p => p.valores && p.valores[cfg.campo] != null);
    if (com.length) L = com;
  }
  const nref = parseInt(cep, 10);
  const nCep = p => parseInt(digitos(p.cep), 10);
  L.forEach(p => {
    p._tier = (norm(p.cidade) === norm(ref.cidade) && p.uf === ref.uf) ? 0 : (p.uf === ref.uf ? 1 : 2);
  });

  const candidatos = L.filter(p => p._tier < 2 && digitos(p.cep).length === 8)
    .sort((a, b) => a._tier - b._tier || Math.abs(nCep(a) - nref) - Math.abs(nCep(b) - nref))
    .slice(0, 30);
  await emLotes(candidatos, 6, async p => { p._geo = await infoCep(digitos(p.cep)); });

  L.forEach(p => {
    p._km = p._geo ? kmEntre(ref, p._geo) : null;
    const pc = nCep(p);
    p._ord = p._km != null ? p._km : 1e6 + (isNaN(pc) ? 1e8 : Math.abs(pc - nref));
  });
  L.sort((a, b) => a._tier - b._tier || a._ord - b._ord);
  return { ref, lista: L.slice(0, 3) };
}
const fmtCepSug = c => c.slice(0, 5) + '-' + c.slice(5);
const fmtCnpjSug = s => { const d = digitos(s); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (s || ''); };

function blocoSugestao(docId, cpf, uid) {
  if (!SUG_CFG[docId]) return '';
  return `<div class="sugest noprint" id="sg_${uid}" data-doc="${esc(docId)}" data-cpf="${esc(digitos(cpf))}">
    <button class="ghost sm" onclick="sugerirParceiro('sg_${uid}')">📍 Sugerir local para refazer</button></div>`;
}

function cardParceiro(p, cfg) {
  const val = cfg.campo && p.valores && p.valores[cfg.campo] != null ? p.valores[cfg.campo] : p.total;
  const dist = p._km != null ? '~' + Math.round(p._km) + ' km'
    : (p._tier === 0 ? 'mesma cidade' : p._tier === 1 ? 'mesma UF' : 'outra UF');
  const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mapa = 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent([p.endereco, p.cidade, p.uf].filter(Boolean).join(', '));
  return `<div class="sgcard">
    <div><b>${esc(p.nome)}</b> <span class="mini">· ${esc(p.cidade)}/${esc(p.uf)} · ${esc(dist)}</span></div>
    ${p.endereco ? `<div class="mini">${esc(p.endereco)} · <a href="${mapa}" target="_blank" rel="noopener">🗺 Ver no mapa</a></div>` : ''}
    ${p.contato || p.email ? `<div class="mini">${[p.contato, p.email].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    ${p.cnpj ? `<div class="mini">CNPJ ${esc(fmtCnpjSug(p.cnpj))}</div>` : ''}
    ${val != null ? `<div class="valor">${brl(val)}${p.pgto ? ` <span class="mini">· ${esc(p.pgto)}</span>` : ''}</div>`
                  : (p.pgto ? `<div class="mini">Pgto: ${esc(p.pgto)}</div>` : '')}
  </div>`;
}

async function sugerirParceiro(boxId, cepManual) {
  const box = el(boxId);
  if (!box) return;
  const cfg = SUG_CFG[box.dataset.doc];
  if (!cfg) return;
  box.innerHTML = '<span class="msg"><span class="spin"></span>Buscando o CEP do técnico e o local mais próximo...</span>';
  try {
    let cep = '', origem = '', diag = [];
    if (cepManual != null) { cep = cepManual; origem = 'informado manualmente'; }
    else { const r = await cepDoColaborador(box.dataset.cpf); cep = r.cep; origem = r.origem ? 'cadastro: ' + r.origem : ''; diag = r.diag; }

    if (!cep) {
      box.innerHTML = `<div class="msg">CEP do técnico não encontrado no banco. Informe o CEP para sugerir um local:</div>
        <div class="sgbox"><input type="text" inputmode="numeric" maxlength="9" placeholder="00000-000" id="${boxId}_cep"
          onkeydown="if(event.key==='Enter')sugerirParceiro('${boxId}', digitos(this.value))">
        <button class="ghost sm" onclick="sugerirParceiro('${boxId}', digitos(el('${boxId}_cep').value))">Buscar</button></div>` +
        (diag.length ? `<ul class="sgdiag">${diag.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '');
      return;
    }
    if (cep.length !== 8) throw new Error('CEP inválido: informe os 8 números.');
    const { ref, lista } = await ranquear(cep, cfg);
    if (!lista.length) {
      box.innerHTML = `<div class="msg">Nenhum(a) ${esc(cfg.rot)} cadastrado(a) em <a href="parceiros.html">Parceiros</a>.</div>`;
      return;
    }
    box.innerHTML = `<div class="sec" style="margin-top:0">Sugestão: ${esc(cfg.rot)} perto de ${esc(ref.cidade || '')}/${esc(ref.uf || '')} (CEP ${esc(fmtCepSug(cep))}${origem ? ' · ' + esc(origem) : ''})</div>` +
      lista.map(p => cardParceiro(p, cfg)).join('') +
      `<div class="mini" style="margin-top:6px">Cadastre mais locais em <a href="parceiros.html">Parceiros</a>.</div>`;
  } catch (e) {
    box.innerHTML = `<span class="msg" style="color:var(--nok)">⚠ ${esc(e.message)}</span>`;
  }
}