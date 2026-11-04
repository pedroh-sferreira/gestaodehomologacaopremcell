console.info('homologacao-regional.js carregado');

const REG_NOMES = {
  BA_SE: 'Regional BA/SE', CO: 'Regional CO', NE1: 'Regional NE1', NE2: 'Regional NE2',
  SO: 'Regional SO', NO: 'Regional NO', SP: 'Regional SP'
};
let NEG_DEST = null; 

const negDestinoTxt = n => {
  if (!n.regional) return n.estado_atuacao ? 'Estado ' + n.estado_atuacao + ' sem regional' : 'Estado de atuação não identificado';
  const nomes = Array.isArray(n.resp_gerentes_nomes) ? n.resp_gerentes_nomes : [];
  return (REG_NOMES[n.regional] || n.regional) + ' · ' + (nomes.length ? nomes.join(', ') : 'sem gerente definido');
};
const negDestinoOk = n => Array.isArray(n.resp_gerentes_nomes) && n.resp_gerentes_nomes.length > 0;

negTabela = function (L, comAlvo) {
  const itensTd = n => negItens(n).length
    ? negItens(n).map(i => `<div>${esc(i.item)} · ${esc(fmtBRL(negNum(i.valor)))}${i.obs ? `<div class="evid">Obs.: ${esc(i.obs)}</div>` : ''}</div>`).join('')
    : `${esc(negModoTxt(n))}${n.observacao ? `<div class="evid" style="white-space:pre-wrap;max-width:260px">📝 ${esc(n.observacao)}</div>` : ''}`;
  return `<div style="overflow-x:auto"><table><tr><th>Lançado em</th>${comAlvo ? '<th>Equipe / Colaborador</th>' : ''}<th>Itens</th><th>Total</th><th>Estado</th><th>Encaminhado para</th><th>Gerente</th><th></th></tr>` +
    L.map(n => `<tr><td>${esc(negData(n.criado_em))}${n.atualizado_em ? `<div class="evid">editado em ${esc(negData(n.atualizado_em))}</div>` : ''}</td>
      ${comAlvo ? `<td>${n.tipo === 'EQUIPE' ? '👥 ' + esc(n.equipe_nome || '') + `<div class="evid">${(n.cpfs || []).length} integrante(s)</div>`
        : '👤 ' + esc(n.nome || '') + `<div class="evid">CPF ${esc(fmtCpf(n.cpf))}</div>`}</td>` : ''}
      <td>${itensTd(n)}</td><td><b>${esc(fmtBRL(negTotal(n)))}</b></td><td>${esc(n.estado_atuacao || '—')}</td>
      <td><span class="badge ${negDestinoOk(n) ? 'b-ok' : 'b-warn'}">${esc(negDestinoTxt(n))}</span></td>
      <td>${negGerBadge(n)}${negGerInfo(n)}</td>
      <td style="white-space:nowrap"><button class="ghost sm" onclick="negEditar('${esc(n.id)}')">✎ Editar</button></td></tr>`).join('') + `</table></div>`;
};

const _negUltima = negUltima;
negUltima = function (al) {
  const h = _negUltima(al); if (!h) return h;
  const u = negDoAlvo(al)[0]; if (!u) return h;
  return h + `<div class="evid">Encaminhado para: ${esc(negDestinoTxt(u))}</div>`;
};


function negCpfsDoAlvo(al) {
  if (al.tipo === 'COLABORADOR') return [digitos(al.g.cpf)];
  const lid = al.eq.membros.find(m => m.lider);
  const L = al.eq.membros.map(m => digitos(m.cpf));
  return (lid ? [digitos(lid.cpf)] : []).concat(L).filter(c => c.length === 11);
}
function negDestinoDesenhar(d) {
  const box = document.getElementById('negDest'); if (!box) return;
  const gs = (d && d.gerentes) || [];
  if (!d || !d.estado) {
    box.className = 'aviso';
    box.innerHTML = 'Não encontrei o estado de atuação deste colaborador/equipe. Sem ele não dá para escolher o gerente.';
  } else if (!d.regional) {
    box.className = 'aviso';
    box.innerHTML = `O estado <b>${esc(d.estado)}</b> não pertence a nenhuma regional.`;
  } else if (!gs.length) {
    box.className = 'aviso';
    box.innerHTML = `Estado <b>${esc(d.estado)}</b> · <b>${esc(REG_NOMES[d.regional] || d.regional)}</b>. Ainda não há gerente definido para esta regional (página Controle de Regional).`;
  } else {
    box.className = 'decbox ok';
    box.innerHTML = `Estado ${esc(d.estado)} · ${esc(REG_NOMES[d.regional] || d.regional)}\nSerá enviado para: ${esc(gs.map(g => g.nome).join(', '))}`;
  }
}
const _negAbrir = negAbrir;
negAbrir = function (tipo, key) {
  const antes = NEG_ALVO;
  NEG_DEST = null;
  _negAbrir(tipo, key);
  const al = NEG_ALVO;
  if (!al || al === antes) return;                    
  const dica = document.querySelector('#hmOv .dica'); if (!dica) return;
  dica.insertAdjacentHTML('afterend', '<div id="negDest" class="msg" style="margin:8px 0 0;white-space:pre-line"><span class="spin"></span>Identificando a regional...</div>');
  const q = al.tipo === 'EQUIPE' && al.eq.local ? qLocal(al.eq.key) : null;
  vdRpc('negociacao_destino', { p_token: tokenAdm(), p_cpfs: negCpfsDoAlvo(al), p_estado: (q && q.uf) || null })
    .then(d => { if (NEG_ALVO !== al) return; NEG_DEST = d || {}; negDestinoDesenhar(NEG_DEST); })
    .catch(e => {
      const box = document.getElementById('negDest');
      if (box && NEG_ALVO === al) { box.className = 'aviso'; box.textContent = 'Não foi possível identificar o gerente: ' + e.message; }
    });
};

const _negSalvar = negSalvar;
negSalvar = async function () {
  if (NEG_ALVO && !NEG_EDIT && NEG_DEST && !(NEG_DEST.gerentes || []).length) {
    const motivo = !NEG_DEST.estado ? 'Não foi possível identificar o estado de atuação'
      : !NEG_DEST.regional ? 'O estado ' + NEG_DEST.estado + ' não pertence a nenhuma regional'
      : 'Não há gerente definido para a ' + (REG_NOMES[NEG_DEST.regional] || NEG_DEST.regional);
    if (!confirm(motivo + '. O custo ficará sem gerente responsável até isso ser resolvido. Lançar mesmo assim?')) return;
  }
  return _negSalvar();
};