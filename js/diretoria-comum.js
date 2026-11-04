const VDSB = Object.assign({
  SUPABASE_URL: 'https://jedjrzxewklahainnyfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK'
}, window.APP_CONFIG || {});

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digitos = s => String(s || '').replace(/\D/g, '');
const fmtCpf = s => { const d = digitos(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (s || ''); };
const fmtCep = s => { const d = digitos(s); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (s || ''); };
const fmtTs = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
const tokenAdm = () => ((window.vdSessao && window.vdSessao()) || {}).token;

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

const linkTecnico = h => `${location.origin}/loginTecnico.html?cpf=${digitos(h.cpf)}&nome=${encodeURIComponent(h.nome || '')}`;
const msgWhats = h => `Olá ${String(h.nome || '').split(' ')[0]}! Para iniciar sua homologação, faça seu cadastro e envie seus documentos por aqui: ${linkTecnico(h)}`;

function blocoCaso(h) {
  const itens = [['Trabalhista', h.apto_trabalhista], ['Técnico', h.apto_tecnico], ['Patrimonial', h.apto_patrimonial]];
  return `<div class="sub">CPF ${esc(fmtCpf(h.cpf))} · CEP ${esc(fmtCep(h.cep))} · enviado em ${esc(fmtTs(h.disparada_em))}</div>
    <div class="pills" style="margin:10px 0">${itens.map(([t, ok]) =>
      `<span class="pill ${ok === false ? 'nok' : 'ok'}">${t}: ${ok === false ? 'Inapto' : 'Apto'}</span>`).join('')}</div>
    ${h.motivo_inapto ? `<div class="motivo"><b>Motivo informado:</b> ${esc(h.motivo_inapto)}</div>` : ''}
    ${/^https:\/\//.test(h.anexo_inapto || '') ? `<div style="margin-top:8px"><a href="${esc(h.anexo_inapto)}" target="_blank" rel="noopener">📎 Abrir anexo</a></div>` : ''}`;
}