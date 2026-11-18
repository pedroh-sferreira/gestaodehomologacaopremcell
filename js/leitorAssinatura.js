(function (global) {
  'use strict';

  const LARGURA = 900; 
  const MAX_PAGINAS = 6;
  const MIN_CONF_MANUAL = 0.7; 

  const PADROES_TEXTO = [
    /assinado\s+(de\s+forma\s+)?digital(mente)?\s+por/i,
    /assinado\s+eletronicamente/i,
    /assinatura\s+(digital|eletr[ôo]nica)/i,
    /documento\s+assinado/i,
    /gov\.br/i, /icp-?\s?brasil/i, /certificado\s+digital/i,
    /docusign|clicksign|d4sign|autentique|zapsign|adobe\s+sign/i
  ];

  const MIN_CAND = 0.6;
  const NOME_CPF = /^(.{3,}):(\d{11})$/;
  const normTxt = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const PAPEIS_REGEX = [
    ['eletricista', /eletricista|eletrotecnic|engenheir[oa] eletric/],
    ['saude',       /\bmedic[oa]?\b|enfermeir|bombeir|socorrist|paramedic|fisioterap|profissional (da )?saude|\bcrm\b|\bcoren\b/],
    ['seguranca',   /seguranca do trabalho|tecnic[oa] (em|de) seguranca|engenheir[oa] (de )?seguranca|\btst\b|\bcrea\b|\bmte\b|\bmtb\b/],
    ['aluno',       /\balun[oa]\b|participante|treinando|cursista|trabalhador|colaborador|recebedor/]
  ];
  function papeisDoTexto(t) {
    const n = normTxt(t);
    return PAPEIS_REGEX.filter(p => p[1].test(n)).map(p => p[0]);
  }

  function lerCNs(b) {
    const out = [];
    for (let i = 0; i < b.length - 8; i++) {
      if (b[i] === 0x06 && b[i + 1] === 3 && b[i + 2] === 0x55 && b[i + 3] === 4 && b[i + 4] === 3) {
        const t = b[i + 5], len = b[i + 6];
        if ((t === 0x0c || t === 0x13 || t === 0x16 || t === 0x14) && len < 128 && i + 7 + len <= b.length)
          out.push({ txt: new TextDecoder(t === 0x0c ? 'utf-8' : 'latin1').decode(b.subarray(i + 7, i + 7 + len)) });
      }
    }
    return out;
  }

  function textoLatin1(buf) { return new TextDecoder('latin1').decode(new Uint8Array(buf)); }

  function lerAssinaturasDigitais(buf) {
    const txt = textoLatin1(buf), lista = [];
    const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    let m, vazios = 0;
    while ((m = re.exec(txt))) {
      const ini = Math.max(0, txt.lastIndexOf(' obj', m.index)), fim = txt.indexOf('endobj', m.index);
      const obj = txt.slice(ini, fim < 0 ? m.index + 400 : fim); 
      const c = obj.match(/\/Contents\s*<([0-9A-Fa-f\s]*)>/);
      const hex = c ? c[1].replace(/\s+/g, '') : '';
      if (Number(m[4]) <= 0 || (c && !/[1-9A-Fa-f]/.test(hex))) { vazios++; continue; }
      const sig = { formato: (obj.match(/\/SubFilter\s*\/([A-Za-z0-9.]+)/) || [])[1] || '',
        nome: '', cpf: '', emissor: '', tipo_cert: '', data: '' };
      const dm = obj.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})/);
      if (dm) sig.data = dm[1] + '-' + dm[2] + '-' + dm[3];
      const bytes = new Uint8Array(hex.length >> 1);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      const cns = lerCNs(bytes), k = cns.findIndex(x => NOME_CPF.test(x.txt));
      if (k >= 0) {
        const n = NOME_CPF.exec(cns[k].txt);
        sig.nome = n[1].trim(); sig.cpf = n[2]; sig.emissor = k > 0 ? cns[k - 1].txt : '';
      } else {
        const nm = obj.match(/\/Name\s*\(([^)]{3,80})\)/); if (nm) sig.nome = nm[1];
      }
      sig.tipo_cert = /gov\.?br|governo|serpro/i.test(sig.emissor) ? 'govbr' : (sig.cpf ? 'icp' : 'outro');
      lista.push(sig);
    }
    return { lista, vazios };
  }

  function detectarDigitalPdf(buf) {
    const { lista, vazios } = lerAssinaturasDigitais(buf), ev = [];
    if (lista.length) {
      ev.push(lista.length + ' assinatura(s) digital(is) criptográfica(s) no PDF');
      lista.forEach(s => ev.push('Signatário: ' + (s.nome || '?') + (s.cpf ? ' (CPF ' + s.cpf + ')' : '') +
        (s.emissor ? ' · emissor: ' + s.emissor : '')));
    } else if (vazios || /\/FT\s*\/Sig\b/.test(textoLatin1(buf))) ev.push('Campo de assinatura presente, porém sem assinatura aplicada');
    return { assinada: lista.length > 0, qtd: lista.length, signatarios: lista, evidencias: ev };
  }

  function ocorrencias(tn, nome) {
    const n = normTxt(nome), out = [];
    if (n.length < 5) return out;
    let i = -1;
    while (out.length < 6 && (i = tn.indexOf(n, i + 1)) >= 0) out.push({ ini: i, fim: i + n.length });
    if (out.length) return out;
    const t = n.split(' ').filter(x => x.length > 2);
    if (t.length < 2) return out;
    const prim = t[0], ult = t[t.length - 1];
    i = -1;
    while (out.length < 6 && (i = tn.indexOf(prim, i + 1)) >= 0) {
      const j = tn.indexOf(ult, i + prim.length);
      if (j >= 0 && j - i < 80) out.push({ ini: i, fim: j + ult.length });
    }
    return out;
  }

  function enriquecerSignatarios(sigs, tn) {
    const ocs = sigs.map(s => ocorrencias(tn, s.nome));
    sigs.forEach((s, i) => {
      const papeis = new Set(), ctxs = [];
      ocs[i].forEach(o => {
        let a = Math.max(0, o.ini - 120), b = Math.min(tn.length, o.fim + 160);
        ocs.forEach((lst, j) => {
          if (j === i) return;
          lst.forEach(p => { if (p.fim <= o.ini) a = Math.max(a, p.fim); else if (p.ini >= o.fim) b = Math.min(b, p.ini); });
        });
        const w = tn.slice(a, b); ctxs.push(w); papeisDoTexto(w).forEach(k => papeis.add(k));
      });
      s.papeis = Array.from(papeis); s.contexto = ctxs.join(' | ').slice(0, 160);
    });
  }

  function pdfjs(opts) { return (opts && opts.pdfjs) || global.pdfjsLib || null; }

  const PDFJS_VERSAO = '3.11.174';
  const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSAO + '/';
  let _pdfjsPromessa = null;
  function carregarPdfjs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (typeof document === 'undefined') return Promise.resolve(null);
    if (!_pdfjsPromessa) {
      _pdfjsPromessa = new Promise(res => {
        const s = document.createElement('script');
        s.src = PDFJS_BASE + 'pdf.min.js';
        s.onload = () => {
          try { global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; res(global.pdfjsLib); }
          catch (_) { res(null); }
        };
        s.onerror = () => { _pdfjsPromessa = null; res(null); };
        document.head.appendChild(s);
      });
    }
    return _pdfjsPromessa;
  }

  async function abrirPdf(buf, lib) {
    return lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  }

  async function lerPaginaPdf(doc, i) {
    const p = await doc.getPage(i);
    const v1 = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: LARGURA / v1.width });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    const tc = await p.getTextContent();
    const itens = tc.items.filter(x => x.str && x.str.trim()).map(x => {
      const pt = vp.convertToViewportPoint(x.transform[4], x.transform[5]);
      return { s: x.str, x: pt[0], y: pt[1] };
    });
    let widgets = [];
    try {
      const anns = await p.getAnnotations();
      widgets = anns.filter(a => a.subtype === 'Widget' && a.fieldType === 'Sig' && a.rect);
    } catch (_) { }
    return { cv, itens, texto: tc.items.map(x => x.str).join(' '), vp, widgets };
  }

  async function imagemParaCanvas(file) {
    const bmp = await createImageBitmap(file);
    const esc = LARGURA / bmp.width;
    const cv = document.createElement('canvas');
    cv.width = LARGURA; cv.height = Math.max(1, Math.round(bmp.height * esc));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv;
  }
  function otsu(hist, total) {
    let soma = 0; for (let i = 0; i < 256; i++) soma += i * hist[i];
    let sB = 0, wB = 0, max = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (soma - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > max) { max = v; t = i; }
    }
    return Math.min(200, Math.max(120, t));
  }

  function candidatosManuais(cv) {
    const W = cv.width, H = cv.height;
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const g = new Uint8Array(W * H), hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = d[i + 3] < 128 ? 255 : (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
      g[p] = v; hist[v]++;
    }
    const t = otsu(hist, W * H);
    const ink = new Uint8Array(W * H), azul = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (g[p] < t) {
        ink[p] = 1;
        if (d[i + 2] > d[i] + 25 && d[i + 2] >= d[i + 1]) azul[p] = 1;
      }
    }

    const linhas = [];
    for (let y = 0; y < H; y++) {
      let run = 0, ini = 0;
      for (let x = 0; x <= W; x++) {
        if (x < W && ink[y * W + x]) { if (!run) ini = x; run++; }
        else { if (run >= W * 0.12) linhas.push({ y, x0: ini, x1: x }); run = 0; }
      }
    }

    const RX = 4, RY = 2, dil = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      for (let yy = Math.max(0, y - RY); yy <= Math.min(H - 1, y + RY); yy++)
        for (let xx = Math.max(0, x - RX); xx <= Math.min(W - 1, x + RX); xx++) dil[yy * W + xx] = 1;
    }
    const vis = new Uint8Array(W * H), pilha = new Int32Array(W * H), out = [];
    for (let s = 0; s < W * H; s++) {
      if (!dil[s] || vis[s]) continue;
      let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, nb = 0;
      pilha[sp++] = s; vis[s] = 1;
      while (sp) {
        const p = pilha[--sp], x = p % W, y = (p / W) | 0;
        if (ink[p]) { n++; if (azul[p]) nb++; }
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && dil[p - 1] && !vis[p - 1]) { vis[p - 1] = 1; pilha[sp++] = p - 1; }
        if (x < W - 1 && dil[p + 1] && !vis[p + 1]) { vis[p + 1] = 1; pilha[sp++] = p + 1; }
        if (y > 0 && dil[p - W] && !vis[p - W]) { vis[p - W] = 1; pilha[sp++] = p - W; }
        if (y < H - 1 && dil[p + W] && !vis[p + W]) { vis[p + W] = 1; pilha[sp++] = p + W; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, fill = n / (w * h);
      if (w < W * 0.05 || w > W * 0.5 || h < H * 0.025 || h > H * 0.14) continue;
      if (fill < 0.04 || fill > 0.38) continue;

      let score = 0.5, motivos = ['traçado com formato de rubrica'];
      const sobreLinha = linhas.some(l => l.y >= y0 && l.y <= y1 + H * 0.05 &&
        Math.min(l.x1, x1) - Math.max(l.x0, x0) >= w * 0.5);
      if (sobreLinha) { score += 0.2; motivos.push('sobre/acima de linha de assinatura'); }
      if (nb / Math.max(1, n) > 0.4) { score += 0.15; motivos.push('tinta azul'); }
      if (fill >= 0.06 && fill <= 0.25) score += 0.1;
      out.push({ score: Math.min(1, score), motivos, x: x0 / W, y: y0 / H, w: w / W, h: h / H });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  function textoAbaixo(itens, cv, c) {
    const W = cv.width, H = cv.height;
    const x0 = c.x * W - c.w * W * 0.6, x1 = (c.x + c.w) * W + c.w * W * 0.6;
    const y0 = (c.y + c.h * 0.5) * H, y1 = (c.y + c.h) * H + H * 0.1;
    return itens.filter(t => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1)
      .sort((a, b) => a.y - b.y || a.x - b.x).map(t => t.s.trim()).join(' ');
  }

  function recortar(cv, c) {
    try {
      const W = cv.width, H = cv.height;
      const x0 = Math.max(0, (c.x - c.w * 0.3) * W), x1 = Math.min(W, (c.x + c.w * 1.3) * W);
      const y0 = Math.max(0, (c.y - c.h * 0.4) * H), y1 = Math.min(H, (c.y + c.h + 0.09) * H);
      const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
      if (w < 20 || h < 20) return '';
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
      const b64 = out.toDataURL('image/jpeg', 0.8).split(',')[1] || '';
      out.width = out.height = 0;
      return b64;
    } catch (_) { return ''; }
  }

  function camposDigitaisDaPagina(pg, n) {
    const W = pg.cv.width, H = pg.cv.height;
    return (pg.widgets || []).map(a => {
      const r = pg.vp.convertToViewportRectangle(a.rect);
      const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]);
      const y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
      const c = { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H };
      const invisivel = (x1 - x0) < 5 || (y1 - y0) < 5;   // assinatura sem aparência na página
      const texto = invisivel ? '' : pg.itens
        .filter(t => t.x >= x0 - 20 && t.x <= x1 + 20 && t.y >= y0 - 20 && t.y <= y1 + 40)
        .sort((p, q) => p.y - q.y || p.x - q.x).map(t => t.s.trim()).join(' ');
      return {
        tipo: 'digital', pagina: n,
        x: +c.x.toFixed(3), y: +c.y.toFixed(3), w: +c.w.toFixed(3), h: +c.h.toFixed(3),
        confianca: 0.95, texto: texto.slice(0, 120), papeis: papeisDoTexto(texto), invisivel: invisivel,
        campo_pdf: String(a.fieldName || '').slice(0, 60), signatario: '',
        recorte_b64: invisivel ? '' : recortar(pg.cv, c)
      };
    });
  }

  function candidatosDaPagina(pg, n) {
    return candidatosManuais(pg.cv).filter(c => c.score >= MIN_CAND).slice(0, 8).map(c => {
      const t = textoAbaixo(pg.itens, pg.cv, c);
      return { tipo: 'manual', pagina: n, x: +c.x.toFixed(3), y: +c.y.toFixed(3), w: +c.w.toFixed(3), h: +c.h.toFixed(3),
               confianca: +c.score.toFixed(2), texto: t.slice(0, 120), papeis: papeisDoTexto(t), motivos: c.motivos,
               recorte_b64: recortar(pg.cv, c) };
    });
  }

  function numerarCampos(res, digitais, manuais) {
    let d = 0, m = 0;
    digitais.forEach(c => { c.id = 'D' + (++d); });
    manuais.forEach(c => { c.id = 'M' + (++m); });
    res.campos = digitais.concat(manuais);
  }

  function fechar(res, assinada, selo, cands) {
    const forte = cands.filter(c => c.confianca >= MIN_CONF_MANUAL);
    res.manuais = cands; res.varreu_manual = true;
    if (assinada) Object.assign(res, { encontrada: true, tipo: 'digital', confianca: 0.97, decisao: 'SKIP_IA' });
    else if (selo) {
      res.evidencias.push('Selo/texto de assinatura eletrônica: "' + selo.trim() + '"');
      Object.assign(res, { encontrada: true, tipo: 'digital_visual', confianca: 0.8, decisao: 'SKIP_IA' });
    } else if (forte.length) {
      Object.assign(res, { encontrada: true, tipo: 'manual', confianca: forte[0].confianca, decisao: 'SKIP_IA' });
      res.evidencias.push('Assinatura manual provável: ' + forte.length + ' traçado(s)');
    } else res.evidencias.push(cands.length ? 'Possível traçado (confiança baixa; a I.A. deve confirmar)' : 'Nenhum traçado de assinatura localizado');
    if ((assinada || selo) && forte.length) {
      res.mistura = true;
      res.evidencias.push('Atenção: assinatura digital e traçado(s) manual(is) no mesmo arquivo');
    }
    return res;
  }

  function resultadoVazio() {
    return { encontrada: false, tipo: null, confianca: 0, evidencias: [], paginas: null, decisao: 'IA_VERIFICAR',
      signatarios: [], manuais: [], campos: [], varreu_manual: false, mistura: false };
  }

  async function analisar(file, opts) {
    opts = opts || {};
    const res = resultadoVazio();
    let doc = null;
    try {
      const buf = await file.arrayBuffer();
      const ehPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '') ||
        new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 5)) === '%PDF-';

      if (ehPdf) {
        const dig = detectarDigitalPdf(buf);
        res.qtd_digital = dig.qtd; res.signatarios = dig.signatarios; res.evidencias.push(...dig.evidencias);
        const lib = pdfjs(opts) || await carregarPdfjs();
        if (!lib) {
          res.evidencias.push('pdf.js indisponível: sem leitura de texto/imagem');
          if (dig.assinada) Object.assign(res, { encontrada: true, tipo: 'digital', confianca: 0.97, decisao: 'SKIP_IA' });
          return res;
        }
        doc = await abrirPdf(buf, lib); res.paginas = doc.numPages;
        const textos = [], cands = [], digCampos = [];
        for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGINAS); i++) {
          const pg = await lerPaginaPdf(doc, i);
          textos.push(pg.texto);
          cands.push(...candidatosDaPagina(pg, i));
          digCampos.push(...camposDigitaisDaPagina(pg, i));
          pg.cv.width = pg.cv.height = 0; 
        }
        const todo = textos.join(' ');
        enriquecerSignatarios(res.signatarios, normTxt(todo));

        digCampos.forEach(c => {
          const tn = normTxt(c.texto);
          const s = res.signatarios.find(x => x.nome && ocorrencias(tn, x.nome).length);
          if (s) { c.signatario = s.nome; if (!c.papeis.length) c.papeis = s.papeis || []; }
        });
        numerarCampos(res, digCampos, cands);

        const hit = PADROES_TEXTO.find(r => r.test(todo));
        return fechar(res, dig.assinada, hit ? todo.match(hit)[0] : null, cands);
      }

      if (/^image\//i.test(file.type)) {
        res.paginas = 1;
        const cv = await imagemParaCanvas(file);
        const cands = candidatosDaPagina({ cv, itens: [] }, 1);
        cv.width = cv.height = 0;
        numerarCampos(res, [], cands);
        return fechar(res, false, null, cands);
      }
      res.evidencias.push('Formato não suportado pelo leitor: ' + (file.type || 'desconhecido'));
    } catch (e) {
      res.evidencias.push('Erro no leitor: ' + e.message);
    } finally {
      if (doc && doc.destroy) { try { doc.destroy(); } catch (_) {} }
    }
    return res;
  }

  async function analisarVarios(files, opts) {
    opts = opts || {};
    const lista = Array.from(files || []);
    const itens = new Array(lista.length);
    const conc = Math.max(1, Math.min(opts.concorrencia || 3, 6));
    let prox = 0, feitos = 0;

    async function worker() {
      while (prox < lista.length) {
        const i = prox++;
        const f = lista[i];
        let r;
        try { r = await analisar(f, opts); }
        catch (e) { r = resultadoVazio(); r.evidencias.push('Erro no leitor: ' + e.message); }
        itens[i] = { indice: i, nome: (f && f.name) || ('arquivo ' + (i + 1)), arquivo: f, resultado: r };
        feitos++;
        if (typeof opts.onProgresso === 'function') { try { opts.onProgresso(feitos, lista.length, itens[i]); } catch (_) {} }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, lista.length) }, worker));

    const confirmadas = itens.filter(x => x.resultado.decisao === 'SKIP_IA').length;
    return {
      itens,
      resumo: { total: lista.length, confirmadas, paraIA: lista.length - confirmadas },
      decisao: lista.length && confirmadas === lista.length ? 'SKIP_IA' : 'IA_VERIFICAR'
    };
  }


  const nomeSeguro = n => String(n || '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7EÀ-ÿ]/g, '').slice(0, 80);

  function trechoSignatarios(res) {
    const sg = (res && res.signatarios) || [];
    return sg.length
      ? ' Certificados digitais de: ' + sg.map(s => nomeSeguro(s.nome) + (s.papeis && s.papeis.length ? ' (' + s.papeis.join('/') + ')' : '')).join('; ') + '.'
      : '';
  }

  function instrucaoParaIAVarios(lote) {
    const itens = (lote && lote.itens) || [];
    if (!itens.length) return '';
    const linhas = itens.map((x, i) => {
      const r = x.resultado, nome = nomeSeguro(x.nome);
      if (r.decisao === 'SKIP_IA') {
        return (i + 1) + '. "' + nome + '": leitor automático detectou assinatura ' +
          (r.tipo === 'manual' ? 'manual' : 'digital/eletrônica') + '.' + trechoSignatarios(r) +
          ' Para CADA papel, informe o nome impresso, a função/registro escritos junto à assinatura e o campo_id correspondente.';
      }
      return (i + 1) + '. "' + nome + '": assinatura NÃO confirmada pelo sistema. Verifique você mesmo se há assinatura (manuscrita ou digital) e informe o resultado para este arquivo.';
    });
    return 'ASSINATURAS POR ARQUIVO (resultado do leitor automático):\n' + linhas.join('\n');
  }

  function instrucaoParaIA(res) {
    const ids = ((res && res.campos) || []).map(c => c.id).join(', ');
    return 'ASSINATURAS: leitor automático ' + (res && res.encontrada ? 'detectou assinatura ' + res.tipo : 'NÃO detectou assinatura') + '.' +
      trechoSignatarios(res) +
      (ids ? ' Campos localizados: ' + ids + '.' : '') +
      ' Para CADA papel, informe o nome impresso, a função/registro escritos junto à assinatura e o campo_id correspondente. O sistema confere o restante.';
  }

  function paraContexto(res) {
    res = res || {};
    return {
      encontrada: !!res.encontrada, tipo: res.tipo || null, confianca: res.confianca || 0,
      decisao: res.decisao || 'IA_VERIFICAR', paginas: res.paginas || null, qtd_digital: res.qtd_digital || 0,
      varreu_manual: !!res.varreu_manual, mistura: !!res.mistura,
      signatarios: (res.signatarios || []).slice(0, 20).map(s => ({ nome: s.nome, cpf: s.cpf, tipo_cert: s.tipo_cert,
        emissor: String(s.emissor || '').slice(0, 60), data: s.data, papeis: s.papeis || [], contexto: String(s.contexto || '').slice(0, 160) })),
      manuais: (res.manuais || []).slice(0, 12).map(m => ({ pagina: m.pagina, confianca: m.confianca, papeis: m.papeis, texto: m.texto })),
      campos: (res.campos || []).slice(0, 16).map(c => ({
        id: c.id, tipo: c.tipo, pagina: c.pagina, x: c.x, y: c.y, w: c.w, h: c.h,
        confianca: c.confianca, papeis: c.papeis || [], texto: String(c.texto || '').slice(0, 120),
        signatario: String(c.signatario || '').slice(0, 80), invisivel: !!c.invisivel, campo_pdf: c.campo_pdf || ''
      })),
      evidencias: (res.evidencias || []).slice(0, 5).map(e => String(e).slice(0, 160))
    };
  }
  function recortesParaIA(res, max) {
    max = max || 8;
    return ((res && res.campos) || []).filter(c => c.recorte_b64)
      .sort((a, b) => b.confianca - a.confianca).slice(0, max)
      .map(c => ({ id: c.id, mime: 'image/jpeg', base64: c.recorte_b64 }));
  }

  global.LeitorAssinatura = { analisar, analisarVarios, instrucaoParaIA, instrucaoParaIAVarios, detectarDigitalPdf,
    lerAssinaturasDigitais, papeisDoTexto, carregarPdfjs, paraContexto, recortesParaIA };
})(typeof window !== 'undefined' ? window : globalThis);