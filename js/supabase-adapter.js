(function () {
  'use strict';

  const SUPABASE_URL = 'https://jedjrzxewklahainnyfn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_lh7kWRJ3QlreuD55BVc2fw_cNiU98VK';
  const BUCKET = 'documentos';
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyTHNHS0S0P5s73yUJkwCM2zd9VsOdRX2WsIA5JR-fxSuoNzlwfSumfn0i3PdRF5WXF/exec';
  const GAS_CHAVE = '';

  let _sb = null;
  let _sbKey = '';

  function sb() {
    const url = SUPABASE_URL.trim();
    const key = SUPABASE_ANON_KEY.trim();

    if (!url || url.includes('COLE_A_URL') || !key || key.includes('COLE_SUA_CHAVE')) {
      throw new Error('Configure a URL e a chave pública do Supabase no supabase-adapter.js.');
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Biblioteca Supabase não carregou. Verifique a ordem dos scripts no HTML.');
    }

    if (!_sb || _sbKey !== url + key) {
      _sb = window.supabase.createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      _sbKey = url + key;
    }

    return _sb;
  }

  function ck(result) {
    if (result.error) {
      throw new Error(result.error.message || 'Erro no Supabase.');
    }
    return result.data;
  }

  function dh(value) {
    if (!value) return '';

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function dataISO(value) {
    if (!value) return null;

    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;

    return null;
  }

  function texto(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('; ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function numero(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const m = String(value).replace(',', '.').match(/-?\d+(\.\d+)?/);
    if (!m) return null;

    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function primeiro(obj, chaves) {
    for (const chave of chaves) {
      if (obj[chave] !== undefined && obj[chave] !== null && obj[chave] !== '') {
        return obj[chave];
      }
    }
    return null;
  }

  function descricaoItem(i) {
    const nome = i.item || i.verificacao || 'Item';
    const obs = i.obs || i.detalhe;
    return nome + (obs ? ': ' + obs : '');
  }
  const COLS = [
    'id',
    'data_hora',
    'ciclo',
    'documento',
    'status',
    'nome',
    'cpf',
    'cnpj',
    'razao_social',
    'funcao',
    'projeto',
    'data_emissao',
    'validade',
    'inicio',
    'fim',
    'carga_horaria_h',
    'endereco_instituicao',
    'portaria_citada',
    'dias_treinamento',
    'aptidoes',
    'riscos',
    'qtd_nok',
    'motivos_nok',
    'atencoes',
    'arquivo',
    'arquivo_id',
    'status_original',
    'justificativa_relevo',
    'relevado_em',
    'relevado_por'
  ].join(',');

  function normalizarRegistro(r) {
    return {
      id: r.id,
      data_hora: dh(r.data_hora),
      ciclo: r.ciclo || '',
      documento: r.documento || 'Não identificado',
      arquivo: r.arquivo || '',
      arquivo_id: r.arquivo_id || '',
      nome: r.nome || '',
      cpf: r.cpf || '',
      cnpj: r.cnpj || '',
      razao_social: r.razao_social || '',
      funcao: r.funcao || '',
      projeto: r.projeto || '',
      data_emissao: r.data_emissao || '',
      validade: r.validade || '',
      inicio: r.inicio || '',
      fim: r.fim || '',
      carga_horaria_h: r.carga_horaria_h ?? '',
      endereco_instituicao: r.endereco_instituicao || '',
      portaria_citada: r.portaria_citada || '',
      dias_treinamento: r.dias_treinamento ?? '',
      aptidoes: r.aptidoes || '',
      riscos: r.riscos || '',
      status: r.status || 'ATENCAO',
      qtd_nok: r.qtd_nok ?? 0,
      motivos_nok: r.motivos_nok || '',
      atencoes: r.atencoes || '',
      status_original: r.status_original || '',
      justificativa_relevado: r.justificativa_relevo || '',
      relevado_em: dh(r.relevado_em),
      relevado_por: r.relevado_por || ''
    };
  }

  async function listar(body) {
    const limite = Math.max(1, Math.min(Number(body.limite) || 1000, 5000));

    const rows = ck(
      await sb()
        .from('analises')
        .select(COLS)
        .order('data_hora', { ascending: false })
        .limit(limite)
    );

    return {
      ok: true,
      analises: (rows || []).map(normalizarRegistro)
    };
  }
  async function detalhe(body) {
    if (body.id === undefined || body.id === null || body.id === '') {
      throw new Error('ID da análise não informado.');
    }

    const db = sb();

    const [verificacoesResult, textosResult] = await Promise.all([
      db
        .from('verificacoes')
        .select('*')
        .eq('id_analise', body.id)
        .order('id', { ascending: true }),

      db
        .from('textos_extraidos')
        .select('*')
        .eq('id_analise', body.id)
        .order('data_hora', { ascending: false })
        .limit(1)
    ]);

    const verificacoes = ck(verificacoesResult) || [];
    const textos = ck(textosResult) || [];

    return {
      ok: true,

      itens: verificacoes.map(v => ({
        grupo: v.grupo || '',
        item: v.verificacao || v.item || '',
        status: v.status || '',
        detalhe: v.detalhe || '',
        obs: v.detalhe || '',
        evidencia: v.evidencia || ''
      })),

      texto: textos.length ? (textos[0].texto_extraido || '') : ''
    };
  }

  async function relevar(body) {
    if (body.id === undefined || body.id === null || body.id === '') {
      throw new Error('ID da análise não informado.');
    }

    const db = sb();

    const atual = ck(
      await db
        .from('analises')
        .select('status,status_original')
        .eq('id', body.id)
        .single()
    );

    let atualizacao;

    if (body.relevar) {
      const justificativa = String(body.justificativa || '').trim();

      if (justificativa.length < 5) {
        throw new Error('Informe uma justificativa com pelo menos 5 caracteres.');
      }

      atualizacao = {
        status: 'RELEVADO',
        status_original:
          atual.status === 'RELEVADO'
            ? (atual.status_original || 'NOK')
            : atual.status,
        justificativa_relevo: justificativa,
        relevado_em: new Date().toISOString()
      };
    } else {
      atualizacao = {
        status: atual.status_original || 'NOK',
        status_original: null,
        justificativa_relevo: null,
        relevado_em: null
      };
    }

    ck(
      await db
        .from('analises')
        .update(atualizacao)
        .eq('id', body.id)
    );

    return { ok: true };
  }

  async function salvarAnalise(resultado, body) {
    const db = sb();

    const dados = resultado.dados || {};
    const itens = Array.isArray(resultado.itens) ? resultado.itens : [];

    const tipo = typeof tipoDe === 'function' ? tipoDe(resultado) : null;

    if (!body.base64) {
      throw new Error('O conteúdo do documento não foi recebido.');
    }

    const nomeArquivo = String(body.nome_arquivo || 'documento.pdf')
      .replace(/[^A-Za-z0-9._-]+/g, '_');

    const mime = body.mime || 'application/pdf';

    const binario = atob(body.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime });
    const caminho = `${crypto.randomUUID()}/${nomeArquivo}`;

    ck(
      await db.storage
        .from(BUCKET)
        .upload(caminho, blob, { contentType: mime, upsert: false })
    );

    const nok = itens.filter(i => String(i.status || '').toUpperCase() === 'NOK');

    const atencoes = itens.filter(i =>
      ['ATENCAO', 'ATENÇÃO', 'PENDENTE'].includes(String(i.status || '').toUpperCase())
    );

    const linha = {
      data_hora: new Date().toISOString(),

      ciclo: primeiro(resultado, ['ciclo']) || null,

      documento:
        (tipo && tipo.nome) ||
        resultado.nome ||
        resultado.tipo_identificado ||
        'Não identificado',

      status: String(resultado.status || 'ATENCAO').toUpperCase(),

      nome: primeiro(dados, ['nome']),

      cpf: texto(primeiro(dados, ['cpf'])).replace(/\D/g, '') || null,
      cnpj: texto(primeiro(dados, ['cnpj'])).replace(/\D/g, '') || null,

      razao_social: primeiro(dados, ['razao_social']),
      funcao: primeiro(dados, ['funcao']),
      projeto: primeiro(dados, ['projeto']),

      data_emissao: dataISO(primeiro(dados, ['data_emissao'])),

      validade: dataISO(
        primeiro(dados, ['data_validade', 'validade']) ||
        primeiro(resultado, ['validade'])
      ),

      inicio: dataISO(primeiro(dados, ['data_inicio', 'inicio'])),
      fim: dataISO(primeiro(dados, ['data_fim', 'fim'])),

      carga_horaria_h: numero(primeiro(dados, ['carga_horaria_horas', 'carga_horaria_h'])),

      endereco_instituicao: primeiro(dados, ['endereco_instituicao']),
      portaria_citada: primeiro(dados, ['portaria_citada']),

      dias_treinamento: numero(primeiro(dados, ['dias_treinamento'])),

      aptidoes: texto(primeiro(dados, ['aptidoes'])) || null,
      riscos: texto(primeiro(dados, ['riscos'])) || null,

      qtd_nok: nok.length,
      motivos_nok: nok.map(descricaoItem).join('; ') || null,
      atencoes: atencoes.map(descricaoItem).join('; ') || null,

      arquivo: body.nome_arquivo || nomeArquivo,
      arquivo_id: caminho
    };

    let registro;

    try {
      registro = ck(
        await db
          .from('analises')
          .insert(linha)
          .select(COLS)
          .single()
      );

      if (itens.length) {
        const linhasVerificacao = itens.map(i => ({
          id_analise: registro.id,
          data_hora: new Date().toISOString(),
          ciclo: registro.ciclo || null,
          documento: registro.documento,
          nome: registro.nome || null,
          grupo: i.grupo || null,
          verificacao: i.item || i.verificacao || null,
          status: String(i.status || 'ATENCAO').toUpperCase(),
          detalhe: i.obs || i.detalhe || null,
          evidencia: i.evidencia || null
        }));

        ck(await db.from('verificacoes').insert(linhasVerificacao));
      }

      if (resultado.texto_extraido) {
        ck(
          await db.from('textos_extraidos').insert({
            id_analise: registro.id,
            data_hora: new Date().toISOString(),
            documento: registro.documento,
            arquivo: registro.arquivo,
            texto_extraido: String(resultado.texto_extraido)
          })
        );
      }
    } catch (erro) {
      if (!registro) {
        try { await db.storage.from(BUCKET).remove([caminho]); } catch (_) {}
        throw erro;
      }
      resultado.id = registro.id;
      resultado.registro = normalizarRegistro(registro);
      resultado.salvo = true;
      resultado.erro_salvar =
        'Análise salva, mas houve falha nos detalhes: ' + (erro.message || erro);
      return resultado;
    }

    resultado.id = registro.id;
    resultado.salvo = true;
    resultado.registro = normalizarRegistro(registro);

    return resultado;
  }
  async function validar(body) {
    const resposta = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, chave: GAS_CHAVE })
    });

    const conteudo = await resposta.text();

    let json;
    try {
      json = JSON.parse(conteudo);
    } catch (_) {
      throw new Error(
        'O Apps Script retornou uma resposta inválida. Verifique a URL /exec e as permissões.'
      );
    }

    if (!resposta.ok || !json.ok) {
      throw new Error(json.erro || `Erro no Apps Script: HTTP ${resposta.status}`);
    }

    const resultado = json.resultado || {};

    try {
      await salvarAnalise(resultado, body);
    } catch (erro) {
      resultado.salvo = false;
      resultado.erro_salvar = erro.message || String(erro);
    }

    return { ok: true, resultado };
  }

  async function chamarApi(body) {
    if (!body || !body.acao) {
      throw new Error('Ação da API não informada.');
    }

    switch (body.acao) {
      case 'listar':
        return listar(body);

      case 'detalhe':
        return detalhe(body);

      case 'relevar':
        return relevar(body);

      case 'validar':
        return validar(body);

      case 'ping':
        return { ok: true };

      default:
        throw new Error('Ação não suportada: ' + body.acao);
    }
  }

  async function obterBlobArquivo(analise) {
    if (!analise || !analise.arquivo_id) {
      throw new Error('Este registro não possui arquivo_id no Storage.');
    }

    const chaveCache =
      location.origin + '/vd-arq/' + encodeURIComponent(analise.arquivo_id);

    let cache = null;

    try {
      if ('caches' in window) {
        cache = await caches.open('vd-arquivos-v1');

        const encontrado = await cache.match(chaveCache);
        if (encontrado) return await encontrado.blob();
      }
    } catch (_) {
      cache = null;
    }

    const arquivo = ck(
      await sb().storage.from(BUCKET).download(analise.arquivo_id)
    );

    if (cache) {
      try {
        await cache.put(
          chaveCache,
          new Response(arquivo, {
            headers: { 'Content-Type': arquivo.type || 'application/octet-stream' }
          })
        );
      } catch (_) {}
    }

    return arquivo;
  }

  window.chamarApi = chamarApi;
  window.obterBlobArquivo = obterBlobArquivo;

  console.log('Supabase adapter carregado. A conexão será aberta quando necessário.');
})();