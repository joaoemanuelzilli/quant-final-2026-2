// Gera slides/apresentacao_pares_b3.pptx a partir de slides/dados.json.
// Nenhum número é digitado aqui: todos saem dos scripts em scripts/.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));

// pptxgenjs não grava as cores do tema: depois de salvar, troca o esquema
// de cores do theme1.xml pelas cores da Liga (para quem editar no PowerPoint)
async function aplicarTema(arquivo, tema) {
  const zip = await JSZip.loadAsync(fs.readFileSync(arquivo));
  for (const nome of Object.keys(zip.files).filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n))) {
    let xml = await zip.file(nome).async("string");
    xml = xml.replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${tema.name}">`);
    for (const [slot, cor] of Object.entries(tema.colors)) {
      xml = xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${cor}"/></a:${slot}>`);
    }
    zip.file(nome, xml);
  }
  fs.writeFileSync(arquivo, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

const D = JSON.parse(fs.readFileSync(path.join(__dirname, "dados.json"), "utf8"));
const ASSETS = path.join(__dirname, "assets");
const SAIDA = path.join(__dirname, "apresentacao_pares_b3.pptx");

// ---------- paleta da Liga (deck S2_EDA) e do livro do Núcleo ----------
const ROXO = "7B2FBE", ROXO_ESC = "4A1A78", ROXO_CLARO = "C9A7EB", LILAS = "F3ECFA";
const GRAFITE = "1E1E2E", GRAFITE_2 = "2A2A40", TINTA = "1A1A1A", CINZA = "6B7280";
const CINZA_CL = "D1D5DB", CINZA_BG = "F5F5F7", OCRE = "B97400", VERDE = "00A090";
const VERMELHO = "D1436A", BRANCO = "FFFFFF";
const FONTE = "Calibri";
const THEME = {
  name: "LMF Quant", headFontFace: FONTE, bodyFontFace: FONTE,
  colors: { dk1: TINTA, lt1: BRANCO, dk2: GRAFITE, lt2: LILAS, accent1: ROXO,
            accent2: OCRE, accent3: VERDE, accent4: "3F6FD8", accent5: VERMELHO,
            accent6: CINZA, hlink: ROXO, folHlink: ROXO_ESC },
};
const W = 13.333, H = 7.5, MX = 0.55;

// ---------- formatação pt-BR ----------
const num = (x, c = 2) => (x === null || x === undefined || Number.isNaN(x)) ? "–"
  : x.toFixed(c).replace("-", "−").replace(".", ",");
const pct = (x, c = 1) => (x === null || x === undefined || Number.isNaN(x)) ? "–"
  : num(100 * x, c) + "%";
const milhar = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloData = (s) => `${MESES[+s.slice(5, 7) - 1]}/${s.slice(2, 4)}`;
const EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaMes = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const mesAno = (s) => `${EXTENSO[+s.slice(5, 7) - 1]} de ${s.slice(0, 4)}`;

// ---------- ícones ----------
async function icone(nome, cor = BRANCO, tam = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(fa[nome], { color: "#" + cor, size: tam }));
  const png = await sharp(Buffer.from(svg)).resize(tam, tam).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

// ---------- opções de gráfico (objeto novo a cada chamada) ----------
function menos(codigo) {
  return codigo.includes(";") ? codigo : `${codigo};"−"${codigo}`;
}

function eixos(extra = {}, escuro = false) {
  const txt = escuro ? "C7C7D6" : CINZA;
  for (const k of ["valAxisLabelFormatCode", "dataLabelFormatCode", "catAxisLabelFormatCode"]) {
    if (extra[k]) extra[k] = menos(extra[k]);
  }
  return Object.assign({
    catAxisLabelColor: txt, valAxisLabelColor: txt,
    catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
    catAxisLabelFontFace: FONTE, valAxisLabelFontFace: FONTE,
    valGridLine: { color: escuro ? "3A3A55" : "E5E7EB", size: 0.5 },
    catGridLine: { style: "none" },
    catAxisLineShow: true, catAxisLineColor: escuro ? "55556E" : CINZA_CL,
    catAxisLabelPos: "low", catAxisMajorTickMark: "none", valAxisMajorTickMark: "none",
    valAxisLineShow: false,
    legendFontFace: FONTE, legendFontSize: 11, legendColor: escuro ? "E5E5EE" : TINTA,
    titleFontFace: FONTE, titleFontSize: 13, titleColor: escuro ? BRANCO : TINTA,
    showTitle: false, dataLabelFontFace: FONTE, dataLabelFontSize: 11,
    dataLabelColor: escuro ? BRANCO : TINTA,
  }, extra);
}

// ---------- largura aproximada de texto em Calibri (em polegadas) ----------
const EM = { i: 0.23, l: 0.23, t: 0.33, r: 0.35, s: 0.39, z: 0.4, c: 0.42, k: 0.46, a: 0.48, e: 0.5, ã: 0.48,
  o: 0.53, d: 0.53, b: 0.53, n: 0.53, u: 0.53, T: 0.49, D: 0.62, M: 0.86, B: 0.54, R: 0.54, C: 0.53 };
const largura = (txt, pt, negrito = false) =>
  [...txt].reduce((acc, ch) => acc + (EM[ch] || 0.5), 0) * pt / 72 * (negrito ? 1.06 : 1);

// ---------- montagem ----------
const SECOES = ["Tese", "Dados", "Modelo", "Backtest", "Risco", "Robustez", "Conclusão"];

function defineLayouts(pres) {
  const comum = (nome, secao) => {
    const objs = [
      { image: { x: W - MX - 0.52, y: 0.3, w: 0.52, h: 0.5, path: path.join(ASSETS, "lmf_simbolo_preto.png") } },
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.3, w: W - 2 * MX - 0.8, h: 0.62,
          fontFace: FONTE, fontSize: 28, bold: true, color: TINTA, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "subtitulo", type: "body", x: MX, y: 0.94, w: W - 2 * MX - 0.8, h: 0.42,
          fontFace: FONTE, fontSize: 16, color: CINZA, align: "left", valign: "top", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "fonte", type: "body", x: MX, y: 6.62, w: 9.5, h: 0.26,
          fontFace: FONTE, fontSize: 10, italic: true, color: CINZA, valign: "middle", margin: 0 }, text: "" } },
    ];
    if (secao !== undefined) {
      // navegação: uma caixa por seção (o layout só aceita texto simples)
      let x = MX;
      SECOES.forEach((s, i) => {
        const atual = s === secao, w = largura(s, 11, atual) + 0.04;
        objs.push({ text: { text: s, options: { x, y: 6.95, w, h: 0.3, fontFace: FONTE, fontSize: 11, margin: 0,
          valign: "middle", bold: atual, italic: atual, color: atual ? ROXO : CINZA } } });
        x += w;
        if (i < SECOES.length - 1) {
          objs.push({ text: { text: "|", options: { x, y: 6.95, w: 0.3, h: 0.3, fontFace: FONTE, fontSize: 11,
            margin: 0, align: "center", valign: "middle", color: CINZA_CL } } });
          x += 0.3;
        }
      });
    }
    objs.push({ text: { text: "Núcleo Quant · LMF UFU", options: { x: W - MX - 3.6, y: 6.95, w: 3.0, h: 0.3,
      fontFace: FONTE, fontSize: 10, color: CINZA, align: "right", margin: 0, valign: "top" } } });
    pres.defineSlideMaster({ title: nome, background: { color: BRANCO }, objects: objs,
      slideNumber: { x: W - MX - 0.5, y: 6.95, w: 0.5, h: 0.3, fontFace: FONTE, fontSize: 11,
        color: ROXO, bold: true, align: "right", margin: 0 } });
  };
  SECOES.forEach((s) => comum(`LMF ${s}`, s));
  comum("LMF Geral");
  pres.defineSlideMaster({
    title: "LMF Escuro", background: { color: GRAFITE },
    objects: [
      { image: { x: W - MX - 0.52, y: 0.3, w: 0.52, h: 0.5, path: path.join(ASSETS, "lmf_simbolo_branco.png") } },
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.3, w: W - 2 * MX - 0.8, h: 0.62,
          fontFace: FONTE, fontSize: 28, bold: true, color: BRANCO, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "subtitulo", type: "body", x: MX, y: 0.94, w: W - 2 * MX - 0.8, h: 0.42,
          fontFace: FONTE, fontSize: 16, color: ROXO_CLARO, align: "left", valign: "top", margin: 0 }, text: "" } },
      { text: { text: "Núcleo Quant · LMF UFU", options: { x: W - MX - 3.6, y: 6.95, w: 3.0, h: 0.3,
        fontFace: FONTE, fontSize: 10, color: "9C9CB5", align: "right", margin: 0, valign: "middle" } } },
    ],
    slideNumber: { x: W - MX - 0.5, y: 6.95, w: 0.5, h: 0.3, fontFace: FONTE, fontSize: 11,
      color: ROXO_CLARO, bold: true, align: "right", margin: 0 },
  });
  pres.defineSlideMaster({ title: "LMF Capa", background: { color: GRAFITE }, objects: [] });
}

function titulo(slide, partes) {
  // partes: ["texto normal", {d: "destaque"}, ...]
  const runs = partes.map((p) => typeof p === "string" ? { text: p }
    : { text: p.d, options: { color: p.cor || ROXO } });
  slide.addText(runs, { placeholder: "title" });
}

function cartao(slide, nome, x, y, w, h, fill = CINZA_BG) {
  slide.addShape("roundRect", { x, y, w, h, fill: { color: fill }, line: { color: fill },
    rectRadius: 0.08, objectName: nome });
}

function destaque(slide, nome, x, y, w, numero, rotulo, opts = {}) {
  const cor = opts.cor || ROXO, tam = opts.tam || 36;
  slide.addText(numero, { x, y, w, h: opts.hNum || 0.62, fontFace: FONTE, fontSize: tam, bold: true,
    color: cor, margin: 0, valign: "bottom", isTextBox: true, objectName: `${nome} número` });
  slide.addText(rotulo, { x, y: y + (opts.hNum || 0.62) + 0.04, w, h: opts.hRot || 0.62,
    fontFace: FONTE, fontSize: opts.tamRot || 13, color: opts.corRot || TINTA, margin: 0, valign: "top",
    isTextBox: true, objectName: `${nome} rótulo` });
}

function bolinha(slide, nome, x, y, d, img, fill = ROXO) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: `${nome} círculo` });
  const m = d * 0.24;
  slide.addImage({ data: img, x: x + m, y: y + m, w: d - 2 * m, h: d - 2 * m, objectName: `${nome} ícone` });
}

function tabela(slide, nome, linhas, opts) {
  const cab = linhas[0].map((c) => (typeof c === "object" ? c : {
    text: c, options: { bold: true, color: BRANCO, fill: { color: opts.corCab || ROXO }, align: "center", valign: "middle" } }));
  const corpo = linhas.slice(1).map((l, i) => l.map((c, j) => {
    const base = { fill: { color: i % 2 ? "FAFAFB" : BRANCO }, align: j === 0 || opts.alinhar === "left" ? "left" : "center",
      valign: "middle", color: TINTA };
    return typeof c === "object" ? { text: c.text, options: Object.assign(base, c.options) } : { text: c, options: base };
  }));
  const { alinhar, ...resto } = opts;
  slide.addTable([cab, ...corpo], Object.assign({ fontFace: FONTE, fontSize: 13, margin: [2, 5, 2, 5],
    border: { type: "solid", pt: 0.5, color: "E5E7EB" }, objectName: nome }, resto));
}

function interp(c1, c2, t) {
  const a = [0, 2, 4].map((i) => parseInt(c1.slice(i, i + 2), 16));
  const b = [0, 2, 4].map((i) => parseInt(c2.slice(i, i + 2), 16));
  return a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const corTexto = (fundo) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(fundo.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55 ? BRANCO : TINTA;
};
const corCalor = (v, lim = 1.0) => {
  const t = Math.max(-1, Math.min(1, v / lim));
  return t >= 0 ? interp("F4F4F6", ROXO, t) : interp("F4F4F6", OCRE, -t);
};

// ======================================================================
async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Núcleo de Análise Quantitativa · LMF UFU";
  pres.company = "Liga de Mercado Financeiro UFU";
  pres.title = "Pares cointegrados na B3";
  pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };
  defineLayouts(pres);

  const ic = {};
  for (const n of ["FaLightbulb", "FaDatabase", "FaGears", "FaChartLine", "FaShieldHalved",
    "FaMagnifyingGlassChart", "FaFlagCheckered", "FaBullseye", "FaScaleBalanced", "FaLayerGroup",
    "FaHourglassHalf", "FaBan", "FaFilter", "FaWaveSquare", "FaBriefcase", "FaGavel", "FaCoins",
    "FaTriangleExclamation", "FaRoute", "FaArrowRight", "FaCodeCommit", "FaCheck", "FaBuildingColumns",
    "FaIndustry", "FaHandshake"]) ic[n] = await icone(n);
  ic.setaRoxa = await icone("FaArrowRight", ROXO);

  const V = D.veredito, ESC = D.escolha, ROB = D.robustez, RIS = D.risco;
  const M = (p, c, k) => D.metricas[`${p}|${c}`][k];
  const tTeste = V.t_excesso_mensal_teste;
  const fmtVar = (x) => num(100 * x, 2) + "%";
  const MT = D.metricas["Teste|Estratégia"], MTr = D.metricas["Treino|Estratégia"], P = D.parametros;
  const exposicao = MT["Exposição bruta média"];
  const excessoTotal = (1 + MT["Retorno acumulado"]) / (1 + D.metricas["Teste|CDI"]["Retorno acumulado"]) - 1;
  const anosTeste = V.meses_teste / 12, riNecessaria = 2 / Math.sqrt(anosTeste);
  const ordem = [...D.grade].sort((a, b) => b.sharpe_treino - a.sharpe_treino);
  const segunda = ordem[1], margem = ordem[0].sharpe_treino - ordem[1].sharpe_treino;
  const negativas = D.grade.filter((r) => r.sharpe_teste < 0).length;
  const stopZ = ESC.entrada + P.stop_extra;
  const sensDe = (t) => D.sensibilidade.find((r) => r.teste === t);
  const semSetor = (st) => D.sem_setor.find((r) => r["sem o setor"] === st);
  const nomeHedge = { mqo: "MQO fixo", "kalman_1e-5": "Kalman δ = 10⁻⁵", "kalman_1e-4": "Kalman δ = 10⁻⁴",
    mqo_movel: "MQO com z móvel", kalman_mv: "Kalman MV" };

  // ---------------------------------------------------------------- 1 Capa
  pres.addSection({ title: "Abertura" });
  let s = pres.addSlide({ masterName: "LMF Capa", sectionTitle: "Abertura" });
  s.addImage({ path: path.join(ASSETS, "lmf_simbolo_branco.png"), x: 7.75, y: 1.0, w: 5.45, h: 5.23,
    transparency: 90, objectName: "Águia de fundo" });
  s.addImage({ path: path.join(ASSETS, "lmf_marca_branco.png"), x: MX + 0.05, y: 0.55, w: 3.9, h: 0.6,
    objectName: "Marca da Liga" });
  s.addShape("roundRect", { x: MX + 0.05, y: 2.15, w: 5.5, h: 0.42, fill: { color: ROXO }, line: { color: ROXO },
    rectRadius: 0.21, objectName: "Selo do núcleo" });
  s.addText("PROJETO FINAL · NÚCLEO DE ANÁLISE QUANTITATIVA", { x: MX + 0.05, y: 2.15, w: 5.5, h: 0.42,
    fontFace: FONTE, fontSize: 13, bold: true, color: BRANCO, align: "center", valign: "middle", charSpacing: 1,
    margin: 0, isTextBox: true, objectName: "Texto do selo" });
  s.addText("Pares cointegrados na B3", { x: MX, y: 2.75, w: 10.2, h: 1.05, fontFace: FONTE, fontSize: 50,
    bold: true, color: BRANCO, margin: 0, valign: "middle", isTextBox: true, objectName: "Título" });
  s.addText("Arbitragem estatística com filtro de Kalman, pré-registrada e testada fora da amostra",
    { x: MX, y: 3.85, w: 6.7, h: 0.95, fontFace: FONTE, fontSize: 22, color: ROXO_CLARO, margin: 0,
      valign: "top", isTextBox: true, objectName: "Subtítulo" });
  s.addText([
    { text: "Apresentação final · ciclo 2026.2", options: { bold: true, color: BRANCO, breakLine: true } },
    { text: "Liga de Mercado Financeiro · Universidade Federal de Uberlândia · outubro de 2026", options: { color: "B8B8CC" } },
  ], { x: MX, y: 6.15, w: 9, h: 0.7, fontFace: FONTE, fontSize: 14, margin: 0, isTextBox: true, objectName: "Rodapé da capa" });
  s.addNotes("Abertura. Em uma frase: testamos se pares de ações ligadas da B3 voltam à média o bastante para pagar custos e aluguel acima do CDI, com as regras gravadas no GitHub antes de abrir o período de teste. Adiantar que o veredito vem já no próximo slide.");

  // ---------------------------------------------------------------- 2 Resposta
  s = pres.addSlide({ masterName: "LMF Escuro", sectionTitle: "Abertura" });
  titulo(s, ["Pares cointegrados batem o CDI? ", { d: "Inconclusivo", cor: "C084FC" }]);
  s.addText("No teste (jan/2020 a out/2026), sinal positivo, mas pequeno, concentrado em 2026 e sensível à execução",
    { placeholder: "subtitulo" });
  const ex = D.excesso_acumulado;
  const i0 = ex.datas.findIndex((x) => x >= D.inicio_teste);
  const base = 1 + ex.excesso[i0 - 1];
  const exDatas = ex.datas.slice(i0), exVals = ex.excesso.slice(i0).map((v) => (1 + v) / base - 1);
  s.addChart(pres.charts.LINE, [{ name: "Excesso acumulado sobre o CDI", labels: exDatas.map(rotuloData), values: exVals }],
    eixos({ x: MX, y: 1.65, w: 7.4, h: 4.55, chartColors: ["C084FC"], lineSize: 2.5, lineDataSymbol: "none",
      showLegend: false, valAxisLabelFormatCode: "0%", catAxisLabelFrequency: 104, valAxisMinVal: -0.06, valAxisMaxVal: 0.06,
      showTitle: true, title: "Excesso acumulado sobre o CDI no teste, líquido de custos e aluguel",
      objectName: "Gráfico do excesso no teste" }, true));
  const xR = 8.45, wR = 4.3;
  destaque(s, "t", xR, 1.6, wR, `t = ${num(tTeste, 2)}`, "estatística do excesso mensal; a ficha pedia t ≥ 2 para confirmar",
    { cor: "C084FC", corRot: "E5E5EE", tam: 34 });
  destaque(s, "excesso", xR, 2.85, wR, `${pct(M("Teste", "Estratégia", "Excesso a.a. sobre o CDI"), 1)} a.a.`,
    `acima do CDI, com ${pct(exposicao, 1)} de exposição bruta média`, { cor: BRANCO, corRot: "E5E5EE", tam: 34 });
  destaque(s, "sharpe", xR, 4.1, wR, `Sharpe ${num(V.sharpe_teste, 2)} ± ${num(M("Teste", "Estratégia", "Erro-padrão do Sharpe"), 2)}`,
    "erro-padrão de Lo (2002): indistinguível de zero", { cor: BRANCO, corRot: "E5E5EE", tam: 34 });
  s.addShape("roundRect", { x: MX, y: 6.3, w: 12.2, h: 0.56, fill: { color: ROXO }, line: { color: ROXO },
    rectRadius: 0.28, objectName: "Faixa do veredito" });
  s.addText([{ text: "Regra da ficha: ", options: { bold: true } },
    { text: `t ≥ 2 confirma; excesso ≤ 0 refuta. Com t = ${num(tTeste, 2)} e excesso positivo: ` },
    { text: "INCONCLUSIVA", options: { bold: true } }, { text: `. Sem 2026, t = ${num(ROB.t_teste_2020_a_2025, 2)}.` }],
  { x: MX + 0.25, y: 6.3, w: 11.7, h: 0.56, fontFace: FONTE, fontSize: 15, color: BRANCO, valign: "middle",
    margin: 0, isTextBox: true, objectName: "Texto do veredito" });
  s.addText("Fonte: scripts/l04_teste.py e l05_robustez.py; excesso composto, (1 + estratégia) / (1 + CDI) − 1", { x: MX, y: 6.95,
    w: 9, h: 0.26, fontFace: FONTE, fontSize: 10, italic: true, color: "9C9CB5", margin: 0, isTextBox: true, objectName: "Fonte" });
  s.addNotes(`Damos a resposta antes do caminho. A carteira terminou o teste ${pct(M("Teste", "Estratégia", "Excesso a.a. sobre o CDI"), 1)} ao ano acima do CDI, mas com t de ${num(tTeste, 2)}: a ficha pedia 2. O gráfico mostra onde está o problema: o excesso fica perto de zero de 2020 a 2025 e salta em 2026. O resto da apresentação explica como chegamos aqui e por que não dá para afirmar que a estratégia funciona.`);

  // ---------------------------------------------------------------- 3 Agenda
  s = pres.addSlide({ masterName: "LMF Geral", sectionTitle: "Abertura" });
  titulo(s, ["O caminho: da ", { d: "tese" }, " ao ", { d: "veredito" }]);
  s.addText("O fluxo obrigatório do Núcleo (Cap. 12): tese, modelo, backtest e resultado, com o teste aberto uma única vez",
    { placeholder: "subtitulo" });
  const agenda = [
    ["FaLightbulb", "Tese", "afirmação, mecanismo e critério de refutação"],
    ["FaDatabase", "Dados", "16 anos de B3 conferidos e a ficha de pré\u2011registro"],
    ["FaGears", "Modelo", "Engle-Granger, filtro de Kalman e a escolha no treino"],
    ["FaChartLine", "Backtest", "curva de capital e métricas obrigatórias"],
    ["FaShieldHalved", "Risco", "VaR, CVaR, GARCH e estresse"],
    ["FaMagnifyingGlassChart", "Robustez", "de que depende o resultado, e por que falhou"],
    ["FaFlagCheckered", "Conclusão", "veredito, limitações e próximos passos"],
  ];
  const wCol = (W - 2 * MX) / 7;
  agenda.forEach(([icn, nome, desc], i) => {
    const x = MX + i * wCol;
    bolinha(s, nome, x + wCol / 2 - 0.5, 2.15, 1.0, ic[icn]);
    s.addText(String(i + 1).padStart(2, "0"), { x, y: 3.35, w: wCol, h: 0.4, fontFace: FONTE, fontSize: 16, bold: true,
      color: ROXO, align: "center", margin: 0, isTextBox: true, objectName: `${nome} número` });
    s.addText(nome, { x, y: 3.72, w: wCol, h: 0.45, fontFace: FONTE, fontSize: 20, bold: true, color: TINTA,
      align: "center", margin: 0, isTextBox: true, objectName: `${nome} nome` });
    s.addText(desc, { x: x + 0.1, y: 4.2, w: wCol - 0.2, h: 1.0, fontFace: FONTE, fontSize: 14, color: CINZA,
      align: "center", valign: "top", margin: 0, isTextBox: true, objectName: `${nome} descrição` });
    if (i < 6) s.addImage({ data: ic.setaRoxa, x: x + wCol - 0.13, y: 2.52, w: 0.26, h: 0.26, objectName: `Seta ${i + 1}` });
  });
  s.addShape("roundRect", { x: MX, y: 5.5, w: W - 2 * MX, h: 0.8, fill: { color: LILAS }, line: { color: LILAS },
    rectRadius: 0.08, objectName: "Caixa do repositório" });
  s.addText([{ text: "Tudo reproduzível: ", options: { bold: true, color: ROXO } },
    { text: "github.com/joaoemanuelzilli/quant-final-2026-2 · dados congelados, versões exatas, testes automáticos do simulador e um commit datado para cada decisão" }],
  { x: MX + 0.25, y: 5.5, w: W - 2 * MX - 0.5, h: 0.8, fontFace: FONTE, fontSize: 15, color: TINTA, valign: "middle",
    margin: 0, isTextBox: true, objectName: "Texto do repositório" });
  s.addNotes("Sete etapas, na ordem do enunciado do Núcleo. O ponto metodológico central é o pré-registro: as regras foram gravadas no GitHub antes de qualquer backtest, e o período de teste foi aberto uma vez só.");

  // ---------------------------------------------------------------- 4 Tese
  pres.addSection({ title: "Tese" });
  s = pres.addSlide({ masterName: "LMF Tese", sectionTitle: "Tese" });
  titulo(s, ["A tese: spreads entre ações ", { d: "ligadas" }, " voltam à média"]);
  s.addText("As cinco partes que o Cap. 12 exige de uma tese testável", { placeholder: "subtitulo" });
  const partes = [
    ["FaBullseye", "Afirmação", "Pares do mesmo setor cointegrados no ano anterior têm spread que volta à média no semestre seguinte; a carteira de soma zero rende acima do CDI."],
    ["FaScaleBalanced", "Mecanismo", "Choques de liquidez sem informação afastam ações ligadas; quem fornece liquidez é pago. Aluguel e risco limitam a arbitragem."],
    ["FaLayerGroup", "Universo", "73 ações líquidas da B3 em 15 setores; pares só dentro do mesmo setor."],
    ["FaHourglassHalf", "Horizonte", "Operações de dias a semanas; carteira de pares refeita a cada semestre."],
    ["FaBan", "Refutação", "Refutada se o excesso mensal médio sobre o CDI for ≤ 0 no teste; confirmada com t ≥ 2."],
  ];
  partes.forEach(([icn, nome, txt], i) => {
    const y = 1.6 + i * 0.98;
    bolinha(s, nome, MX, y + 0.05, 0.62, ic[icn]);
    s.addText([{ text: nome, options: { bold: true, color: ROXO, fontSize: 16, breakLine: true } },
      { text: txt, options: { color: TINTA, fontSize: 14 } }],
    { x: MX + 0.8, y, w: 6.0, h: 0.92, fontFace: FONTE, valign: "top", margin: 0, isTextBox: true, objectName: `${nome} texto` });
  });
  const fo = D.exemplo_formacao;
  s.addChart(pres.charts.LINE, [
    { name: "GGBR4 (Gerdau)", labels: fo.datas.map(rotuloData), values: fo.ln_y },
    { name: "GOAU4 (Metalúrgica Gerdau, holding)", labels: fo.datas.map(rotuloData), values: fo.ln_x }],
  eixos({ x: 7.55, y: 1.6, w: 5.25, h: 4.4, chartColors: [ROXO, OCRE], lineSize: 2, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", valAxisLabelFormatCode: "0.00", catAxisLabelFrequency: 42,
    showTitle: true, title: "Log-preço desde o início da formação (2014)", objectName: "Gráfico GGBR4 e GOAU4" }));
  s.addText("Fonte: Yahoo Finance, preços ajustados por proventos; formação do 1º semestre de 2015", { placeholder: "fonte" });
  s.addNotes("A tese tem as cinco partes do capítulo 12. O exemplo à direita é o mais intuitivo: a Metalúrgica Gerdau é a holding que controla a Gerdau, então o valor de uma depende da outra. O mecanismo é econômico, não estatístico: choques de liquidez afastam as duas e a arbitragem é cara o bastante para não fechar o desvio na hora.");

  // ---------------------------------------------------------------- 5 Evidência
  s = pres.addSlide({ masterName: "LMF Tese", sectionTitle: "Tese" });
  titulo(s, ["O que a literatura mostrou, e por que ", { d: "esperar menos" }]);
  s.addText("O efeito existiu, mas encolheu à medida que ficou conhecido", { placeholder: "subtitulo" });
  const lit = [
    ["Gatev, Goetzmann e Rouwenhorst (2006)", "EUA, 1962 a 2002", "até 11% a.a.", "de retorno em excesso com pares formados por distância de preços"],
    ["Do e Faff (2010)", "EUA, até 2009", "em queda", "a mesma regra rende cada vez menos depois de publicada e popularizada"],
    ["Caldeira e Moura (2013)", "B3, 2005 a 2012", "Sharpe 1,34", "seleção por cointegração, cerca de 16% a.a. de excesso, antes da queda"],
  ];
  lit.forEach(([autor, onde, big, txt], i) => {
    const x = MX + i * 4.13, w = 3.9;
    cartao(s, `Cartão ${autor}`, x, 1.65, w, 2.75);
    s.addText(autor, { x: x + 0.25, y: 1.8, w: w - 0.5, h: 0.55, fontFace: FONTE, fontSize: 15, bold: true, color: TINTA,
      margin: 0, valign: "top", isTextBox: true, objectName: `${autor} autor` });
    s.addText(onde, { x: x + 0.25, y: 2.33, w: w - 0.5, h: 0.3, fontFace: FONTE, fontSize: 13, color: CINZA,
      margin: 0, isTextBox: true, objectName: `${autor} amostra` });
    s.addText(big, { x: x + 0.25, y: 2.7, w: w - 0.5, h: 0.65, fontFace: FONTE, fontSize: 32, bold: true, color: ROXO,
      margin: 0, valign: "middle", isTextBox: true, objectName: `${autor} número` });
    s.addText(txt, { x: x + 0.25, y: 3.4, w: w - 0.5, h: 0.85, fontFace: FONTE, fontSize: 14, color: TINTA,
      margin: 0, valign: "top", isTextBox: true, objectName: `${autor} texto` });
  });
  const tipos = [
    ["FaBuildingColumns", "Mesma empresa", "PETR3 e PETR4, BBDC3 e BBDC4: o mesmo fluxo de caixa em duas classes"],
    ["FaHandshake", "Holding e controlada", "ITSA4 e ITUB4, GOAU4 e GGBR4, BRAP4 e VALE3"],
    ["FaIndustry", "Concorrentes", "BBAS3 e SANB11, CYRE3 e EVEN3: os mesmos fatores de risco"],
  ];
  tipos.forEach(([icn, nome, txt], i) => {
    const x = MX + i * 4.13;
    bolinha(s, nome, x, 4.75, 0.6, ic[icn]);
    s.addText([{ text: nome, options: { bold: true, color: TINTA, breakLine: true } }, { text: txt, options: { color: CINZA } }],
      { x: x + 0.75, y: 4.68, w: 3.2, h: 0.95, fontFace: FONTE, fontSize: 14, margin: 0, valign: "top", isTextBox: true,
        objectName: `${nome} texto` });
  });
  s.addShape("roundRect", { x: MX, y: 5.8, w: W - 2 * MX, h: 0.7, fill: { color: LILAS }, line: { color: LILAS },
    rectRadius: 0.08, objectName: "Caixa da expectativa" });
  s.addText([{ text: "Escrito na ficha, antes do teste: ", options: { bold: true, color: ROXO } },
    { text: `esperar efeito menor que o publicado. Com ${num(anosTeste, 1)} anos de teste, só uma razão de informação acima de ${num(riNecessaria, 2)} chegaria a t = 2.` }],
  { x: MX + 0.25, y: 5.8, w: W - 2 * MX - 0.5, h: 0.7, fontFace: FONTE, fontSize: 15, color: TINTA, valign: "middle",
    margin: 0, isTextBox: true, objectName: "Texto da expectativa" });
  s.addText("Fontes: Gatev et al. (2006), Review of Financial Studies; Do e Faff (2010), Financial Analysts Journal; Caldeira e Moura (2013), Revista Brasileira de Finanças", { placeholder: "fonte" });
  s.addNotes(`Três artigos resumem a história. Gatev e coautores acharam até 11% ao ano nos Estados Unidos. Do e Faff mostraram que o lucro caiu depois que a regra ficou conhecida. Caldeira e Moura acharam Sharpe de 1,34 na B3 até 2012. Por isso a ficha já registrava que esperávamos menos, e a conta de poder: com ${num(anosTeste, 1)} anos de teste, t igual a 2 exige uma razão de informação de ${num(riNecessaria, 2)}.`);

  // ---------------------------------------------------------------- 6 Dados
  pres.addSection({ title: "Dados" });
  s = pres.addSlide({ masterName: "LMF Dados", sectionTitle: "Dados" });
  titulo(s, ["Dados: 16 anos de B3, ", { d: "conferidos" }, " contra a fonte oficial"]);
  s.addText("Congelados em 16/10/2026; cinco eventos corrigidos com fonte, antes de qualquer backtest", { placeholder: "subtitulo" });
  const dd0 = D.dados;
  [["73", "ações em 15 setores"], [milhar(dd0.pregoes), "pregões, de jan/2010 a out/2026"],
    ["CDI", "série 12 do Banco Central, dia a dia"], ["5", "eventos corrigidos (cisões e erros do Yahoo)"]]
    .forEach(([n, r], i) => destaque(s, `Número ${i}`, MX + i * 3.1, 1.55, 2.9, n, r, { tam: 40, hRot: 0.5, tamRot: 14 }));
  s.addText("Retornos diários: Yahoo × fechamento oficial da B3 (2010 a 2025)", { x: MX, y: 2.95, w: 6.2, h: 0.35,
    fontFace: FONTE, fontSize: 15, bold: true, color: TINTA, margin: 0, isTextBox: true, objectName: "Título da conferência" });
  const conf = [["Ação", "Correlação", "Diferença média", "Dias com dif.\u00A0>\u00A01%"]];
  D.conferencia.forEach((r) => conf.push([r.acao, num(r.correlacao, 3), `${num(r.dif_media_pb, 1)} pb`, String(r.dias_dif_maior_1pct)]));
  tabela(s, "Tabela de conferência", conf, { x: MX, y: 3.38, w: 6.2, colW: [1.2, 1.4, 1.7, 1.9], fontSize: 13, rowH: 0.36 });
  s.addText("O que corrigimos, com a fonte de cada linha", { x: 7.15, y: 2.95, w: 5.6, h: 0.35, fontFace: FONTE,
    fontSize: 15, bold: true, color: TINTA, margin: 0, isTextBox: true, objectName: "Título das correções" });
  const corr = [
    ["ITUB4 e ITUB3, 04/10/2021", "cisão da XPart sem ajuste no Yahoo (−18%)"],
    ["PCAR3, 01/03/2021 e 23/08/2023", "cisões do Assaí e do Éxito"],
    ["UGPA3, 28/06/2021", "+119% sem evento: desdobramento mal datado"],
    ["Filtro de R$ 5", "com o preço da época (AMER3 aparecia a R$ 1.200 em 2023)"],
  ];
  corr.forEach(([a, b], i) => {
    const y = 3.4 + i * 0.75;
    s.addImage({ data: ic.setaRoxa, x: 7.15, y: y + 0.06, w: 0.22, h: 0.22, objectName: `Marcador correção ${i}` });
    s.addText([{ text: a, options: { bold: true, breakLine: true } }, { text: b, options: { color: CINZA } }],
      { x: 7.5, y, w: 5.3, h: 0.7, fontFace: FONTE, fontSize: 14, color: TINTA, margin: 0, valign: "top",
        isTextBox: true, objectName: `Correção ${i}` });
  });
  s.addText("Fontes: Yahoo Finance; B3/COTAHIST ajustado (livro do Núcleo, Cap. 2); BCB SGS 12; Ipeadata (Selic over, 2026); scripts/l01_dados.py", { placeholder: "fonte" });
  s.addNotes(`Os dados vêm do Yahoo, que é gratuito e tem defeitos conhecidos. Conferimos contra o fechamento oficial da B3 que o livro do Núcleo usa: correlação de pelo menos ${num(Math.min(...D.conferencia.map((r) => r.correlacao)), 2)} nos retornos diários. A conferência achou a cisão da XPart sem ajuste e uma busca sistemática achou mais quatro eventos artificiais. Também percebemos que o fechamento do Yahoo vem ajustado por grupamentos futuros, o que faria o filtro de preço usar informação do futuro; corrigimos usando o preço da época. Tudo isso foi feito e gravado antes de qualquer backtest.`);

  // ---------------------------------------------------------------- 7 Pré-registro
  s = pres.addSlide({ masterName: "LMF Dados", sectionTitle: "Dados" });
  titulo(s, ["Pré-registro: as regras foram ", { d: "gravadas antes" }, " do teste"]);
  s.addText("Cada decisão tem data e hash no GitHub; o período de teste foi aberto uma única vez", { placeholder: "subtitulo" });
  const t0 = 2010, t1 = 2026.8, xa = MX, wa = W - 2 * MX;
  const xAno = (a) => xa + (a - t0) / (t1 - t0) * wa;
  [["aquec.", 2010, 2011.5, CINZA_CL, TINTA], ["Treino: escolhe a variante", 2011.5, 2020, ROXO_CLARO, TINTA],
    ["Teste: uma rodada", 2020, t1, ROXO, BRANCO]].forEach(([n, a, b, cor, txt]) => {
    s.addShape("rect", { x: xAno(a), y: 1.65, w: xAno(b) - xAno(a), h: 0.6, fill: { color: cor }, line: { color: BRANCO, width: 1 },
      objectName: `Faixa ${n}` });
    s.addText(n, { x: xAno(a), y: 1.65, w: xAno(b) - xAno(a), h: 0.6, fontFace: FONTE, fontSize: 14, bold: true, color: txt,
      align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Rótulo ${n}` });
  });
  [[2010, "jan/2010", "left", 0], [2011.5, "jul/2011", "center", -0.7], [2020, "jan/2020", "center", -0.7], [t1, "16/out/2026", "right", -1.4]]
    .forEach(([a, r, al, dx], i) => s.addText(r, { x: xAno(a) + dx, y: 2.28, w: 1.4, h: 0.3, fontFace: FONTE, fontSize: 12,
      color: CINZA, align: al, margin: 0, isTextBox: true, objectName: `Data ${i}` }));
  const passos = D.commits.slice(0, 5);
  const rotPasso = ["Ficha de pré-registro", "Correções de dados", "Emenda: z calibrado", "Escolha no treino", "Rodada única no teste"];
  const descPasso = [`tese, universo, períodos, ${P.n_original} variantes, custos, regra de decisão`,
    "cisões e filtro de preço da época; nenhum retorno calculado",
    `+${P.n_variantes - P.n_original} variantes depois do treino; teste ainda fechado; N = ${P.n_variantes}`,
    `${nomeHedge[ESC.hedge]}, z = ${num(ESC.entrada, 1)}: maior Sharpe no treino`,
    "veredito inconclusivo, gravado do jeito que saiu"];
  const wp = (W - 2 * MX) / 5;
  passos.forEach((c, i) => {
    const x = MX + i * wp;
    bolinha(s, `Passo ${i + 1}`, x + 0.05, 2.95, 0.55, i === 4 ? ic.FaFlagCheckered : ic.FaCodeCommit, i === 4 ? ROXO_ESC : ROXO);
    s.addText(rotPasso[i], { x, y: 3.6, w: wp - 0.2, h: 0.35, fontFace: FONTE, fontSize: 15, bold: true, color: TINTA, margin: 0,
      isTextBox: true, objectName: `Passo ${i + 1} título` });
    s.addText([{ text: c.hash, options: { fontFace: "Consolas", color: ROXO, bold: true } },
      { text: `  ${c.data.slice(0, 5)} · ${c.data.slice(11)}`, options: { color: CINZA } }],
    { x, y: 3.95, w: wp - 0.2, h: 0.3, fontFace: FONTE, fontSize: 12, margin: 0, isTextBox: true, objectName: `Passo ${i + 1} hash` });
    s.addText(descPasso[i], { x, y: 4.28, w: wp - 0.25, h: 0.9, fontFace: FONTE, fontSize: 13, color: TINTA, margin: 0,
      valign: "top", isTextBox: true, objectName: `Passo ${i + 1} descrição` });
  });
  cartao(s, "Caixa das regras fixas", MX, 5.35, W - 2 * MX, 1.1, LILAS);
  s.addText([
    { text: "Fixado na ficha: ", options: { bold: true, color: ROXO } },
    { text: `benchmark CDI (BOVA11 como secundário) · ${pct(P.custo, 2)} por ponta + aluguel de ${pct(P.aluguel, 0)} a.a. · ordem um pregão depois do sinal · caixa no CDI · métricas obrigatórias + t, Lo e Sharpe deflacionado · ` },
    { text: "regra: t ≥ 2 confirma; excesso ≤ 0 refuta; o resto é inconclusivo.", options: { bold: true } }],
  { x: MX + 0.25, y: 5.35, w: W - 2 * MX - 0.5, h: 1.1, fontFace: FONTE, fontSize: 14, color: TINTA, valign: "middle",
    margin: 0, isTextBox: true, objectName: "Texto das regras fixas" });
  s.addText("Fonte: histórico de commits em github.com/joaoemanuelzilli/quant-final-2026-2 (PRE_REGISTRO.md)", { placeholder: "fonte" });
  s.addNotes("Este é o slide que responde à pergunta mais importante da banca: alguma decisão foi tomada depois de ver o teste? Não. A ficha foi commitada antes de qualquer backtest. Houve uma emenda, e ela está declarada: depois do treino vimos que o z-score estava mal calibrado e acrescentamos seis variantes, ainda com o teste fechado. Todas as quinze contam como tentativas. Depois disso, escolha e teste, em commits separados, minutos depois.");

  // ---------------------------------------------------------------- 8 Séries temporais
  pres.addSection({ title: "Modelo" });
  s = pres.addSlide({ masterName: "LMF Modelo", sectionTitle: "Modelo" });
  titulo(s, ["Preço não é estacionário; o ", { d: "spread" }, " é"]);
  s.addText("GGBR4 e GOAU4 na formação de 2015: Engle-Granger acha a combinação estacionária das duas séries", { placeholder: "subtitulo" });
  const T = D.series_tempo.exemplo.testes;
  const ler = (k) => T[k].adf_p < 0.05 && T[k].kpss_p > 0.05 ? "estacionária" : "raiz unitária";
  const lin = [["Série (formação)", "ADF", "p-valor ADF", "KPSS", "Leitura"]];
  [["ln GGBR4", "ln GGBR4"], ["ln GOAU4", "ln GOAU4"], ["Spread ln Y − β ln X − α", "Spread"], ["Retorno de GGBR4", "Retorno de GGBR4"]]
    .forEach(([rot, k]) => {
      const est = ler(k) === "estacionária";
      lin.push([rot, num(T[k].adf, 2), num(T[k].adf_p, 3), num(T[k].kpss, 2),
        { text: ler(k), options: { bold: true, color: est ? ROXO : OCRE } }]);
    });
  tabela(s, "Tabela ADF e KPSS", lin, { x: MX, y: 1.65, w: 6.6, colW: [2.2, 0.85, 1.05, 0.85, 1.65], fontSize: 13, rowH: 0.4 });
  s.addText(`ADF: H0 = raiz unitária (crítico a 5%: ${num(T["Spread"].adf_crit5, 2)}). KPSS: H0 = estacionária (crítico a 5%: ${num(T["Spread"].kpss_crit5, 2)}).`,
    { x: MX, y: 3.75, w: 6.6, h: 0.5, fontFace: FONTE, fontSize: 12, color: CINZA, margin: 0, isTextBox: true, objectName: "Nota dos testes" });
  const ex8 = D.series_tempo.exemplo;
  [[`β = ${num(ex8.beta, 2)}`, "razão de hedge da formação (MQO)"],
    [`p = ${num(ex8.p_engle_granger, 3)}`, "Engle-Granger, nas duas ordens"],
    [num(ex8.meia_vida, 1), "pregões de meia-vida do spread, por AR(1)"]]
    .forEach(([n, r], i) => destaque(s, `Destaque ${i}`, MX + i * 2.25, 4.45, 2.1, n, r, { tam: 30, hNum: 0.55, hRot: 0.75, tamRot: 13 }));
  const sp = fo.spread, dsp = ex8.desvio_spread;
  s.addChart(pres.charts.LINE, [
    { name: "Spread", labels: fo.datas.map(rotuloData), values: sp },
    { name: "+2 desvios", labels: fo.datas.map(rotuloData), values: sp.map(() => 2 * dsp) },
    { name: "−2 desvios", labels: fo.datas.map(rotuloData), values: sp.map(() => -2 * dsp) }],
  eixos({ x: 7.45, y: 1.6, w: 5.35, h: 4.85, chartColors: [ROXO, OCRE, OCRE], lineSize: 1.75, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", valAxisLabelFormatCode: "0.00", catAxisLabelFrequency: 63,
    showTitle: true, title: "Spread na formação, com faixa de ±2 desvios", objectName: "Gráfico do spread" }));
  const dbrf = (x) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  s.addText(`Fonte: scripts/l02_series.py; formação de ${dbrf(ex8.formacao[0])} a ${dbrf(ex8.formacao[1])}`, { placeholder: "fonte" });
  s.addNotes(`Aqui entra séries temporais. Os log-preços das duas ações têm raiz unitária: o ADF não rejeita e o KPSS rejeita. O retorno é estacionário, como sempre. O ponto do Engle-Granger é que uma combinação dos dois preços, o spread, é estacionária: o ADF rejeita a raiz unitária e o KPSS não rejeita a estacionariedade. A meia-vida de ${num(ex8.meia_vida, 1)} pregões diz em quanto tempo metade de um desvio costuma sumir.`);

  // ---------------------------------------------------------------- 9 Pipeline
  s = pres.addSlide({ masterName: "LMF Modelo", sectionTitle: "Modelo" });
  titulo(s, ["Do teste estatístico à ordem: ", { d: "três etapas" }]);
  s.addText("Tudo o que entra em uma decisão está disponível no fechamento anterior à ordem", { placeholder: "subtitulo" });
  const etapas = [
    ["FaFilter", "Formação", "252 pregões antes do semestre", [
      `Liquidez ≥ R$ ${num(P.volume_minimo / 1e6, 0)} mi/dia e preço da época ≥ R$ ${num(P.preco_minimo, 0)}`,
      "Engle-Granger nas duas ordens, p\u00A0<\u00A05%",
      `Meia-vida AR(1) entre ${P.meia_vida[0]} e ${P.meia_vida[1]} pregões`,
      `Até ${P.n_pares} pares: ≤ ${P.max_por_acao} por ação, ≤ ${P.max_por_setor} por setor`]],
    ["FaWaveSquare", "Sinal", "todo pregão, dados até o dia", [
      "Kalman: β e α mudam como passeio aleatório",
      "z = erro de previsão ÷ desvio previsto",
      `Entra com |z| ≥ ${num(ESC.entrada, 1)}; sai quando z cruza 0`,
      `Stop em |z| ≥ ${num(stopZ, 1)}, par bloqueado no semestre`]],
    ["FaBriefcase", "Carteira", "execução e custos", [
      "Ordem no fechamento do pregão seguinte",
      `${pct(P.bruto_por_par, 0)} de exposição bruta por par, pernas 1 : β`,
      "Caixa, inclusive da venda a descoberto, no CDI",
      `${pct(P.custo, 2)} por ponta + aluguel de ${pct(P.aluguel, 0)}\u00A0a.a.`]],
  ];
  etapas.forEach(([icn, nome, sub, itens], i) => {
    const x = MX + i * 4.17, w = 3.75;
    cartao(s, `Etapa ${nome}`, x, 1.65, w, 4.75);
    bolinha(s, nome, x + 0.3, 1.9, 0.72, ic[icn]);
    s.addText(nome, { x: x + 1.2, y: 1.9, w: w - 1.4, h: 0.42, fontFace: FONTE, fontSize: 22, bold: true, color: TINTA,
      margin: 0, valign: "middle", isTextBox: true, objectName: `${nome} título` });
    s.addText(sub, { x: x + 1.2, y: 2.3, w: w - 1.4, h: 0.35, fontFace: FONTE, fontSize: 13, color: CINZA, margin: 0,
      isTextBox: true, objectName: `${nome} subtítulo` });
    s.addText(itens.map((t, j) => ({ text: t, options: { bullet: { indent: 15 }, breakLine: j < itens.length - 1 } })),
      { x: x + 0.3, y: 2.95, w: w - 0.55, h: 3.25, fontFace: FONTE, fontSize: 15, color: TINTA, valign: "top",
        paraSpaceAfter: 10, margin: 0, isTextBox: true, objectName: `${nome} itens` });
    if (i < 2) s.addImage({ data: ic.setaRoxa, x: x + w + 0.08, y: 3.85, w: 0.26, h: 0.26, objectName: `Seta etapa ${i}` });
  });
  s.addText("Fonte: pares/selecao.py, pares/kalman.py e pares/motor.py; parâmetros em pares/config.py", { placeholder: "fonte" });
  s.addNotes("Três etapas. A formação usa só o ano anterior ao semestre e escolhe até dez pares, com limites para não concentrar em uma ação ou um setor. O sinal é recalculado todo pregão com o filtro de Kalman. A carteira executa a ordem no fechamento seguinte, como o enunciado exige, paga custo por ponta e aluguel, e deixa o caixa no CDI.");

  // ---------------------------------------------------------------- 10 Kalman
  s = pres.addSlide({ masterName: "LMF Modelo", sectionTitle: "Modelo" });
  titulo(s, ["Hedge dinâmico com o ", { d: "filtro de Kalman" }]);
  s.addText("β é reestimado a cada pregão; o z-score mede a surpresa do dia diante do que o filtro esperava na véspera", { placeholder: "subtitulo" });
  cartao(s, "Caixa das equações", MX, 1.65, 5.6, 3.3, LILAS);
  const eq = [
    ["Observação", "ln Yₜ = βₜ · ln Xₜ + αₜ + εₜ,   εₜ ~ N(0, Vₑ)"],
    ["Estado", "(βₜ, αₜ) = (βₜ₋₁, αₜ₋₁) + wₜ,   wₜ ~ N(0, δ/(1−δ)·I)"],
    ["Sinal", "zₜ = eₜ ÷ √Qₜ   (erro e variância previstos)"],
    ["Calibração", "δ fixo (10⁻⁵ ou 10⁻⁴) ou δ e Vₑ por máxima verossimilhança na formação"],
  ];
  eq.forEach(([k, v], i) => s.addText([{ text: k, options: { bold: true, color: ROXO, breakLine: true } },
    { text: v, options: { color: TINTA } }], { x: MX + 0.25, y: 1.77 + i * 0.74, w: 5.2, h: 0.72, fontFace: FONTE,
    fontSize: 15, margin: 0, valign: "top", isTextBox: true, objectName: `Equação ${k}` }));
  s.addText([{ text: "Por que Kalman: ", options: { bold: true } },
    { text: "o MQO da formação fica velho; fora da amostra, o z do MQO fixo teve desvio de 3,4 em vez de 1, e a carteira ficava presa em posições." }],
  { x: MX, y: 5.05, w: 5.6, h: 1.3, fontFace: FONTE, fontSize: 14, color: TINTA, margin: 0, valign: "top", isTextBox: true,
    objectName: "Por que Kalman" });
  const zz = D.exemplo_z;
  const thr = ESC.entrada;
  s.addChart(pres.charts.LINE, [
    { name: "z-score (Kalman δ = 10⁻⁴)", labels: zz.datas.map(diaMes), values: zz.z },
    { name: `+${num(thr, 1)}: vende o spread`, labels: zz.datas.map(diaMes), values: zz.z.map(() => thr) },
    { name: `−${num(thr, 1)}: compra o spread`, labels: zz.datas.map(diaMes), values: zz.z.map(() => -thr) }],
  eixos({ x: 6.45, y: 1.6, w: 6.35, h: 3.3, chartColors: [ROXO, OCRE, OCRE], lineSize: 1.75, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", valAxisLabelFormatCode: "0.0", catAxisLabelFrequency: 42,
    showTitle: true, title: "GGBR4/GOAU4 no 1º semestre de 2015 (treino)", objectName: "Gráfico do z de Kalman" }));
  const opx = [["Entrada", "Saída", "Lado", "Pregões", "Resultado"]];
  D.exemplo_operacoes.forEach((o) => opx.push([o.entrada.slice(8, 10) + "/" + o.entrada.slice(5, 7),
    o.saida.slice(8, 10) + "/" + o.saida.slice(5, 7), o.direcao > 0 ? "compra spread" : "vende spread",
    String(o.pregoes), { text: pct(o.retorno, 2), options: { color: o.retorno > 0 ? ROXO : OCRE, bold: true } }]));
  tabela(s, "Operações do exemplo", opx, { x: 6.45, y: 5.05, w: 6.35, colW: [1.1, 1.1, 1.65, 1.0, 1.5], fontSize: 13, rowH: 0.32 });
  s.addText("Fonte: scripts/l02_series.py; resultado de cada operação líquido de custos e aluguel, sobre a exposição bruta do par", { placeholder: "fonte" });
  const nGanho = D.exemplo_operacoes.filter((o) => o.retorno > 0).length;
  s.addNotes(`O filtro de Kalman trata beta e alfa como coeficientes que andam devagar. A cada pregão ele prevê o preço de Y com o que sabia até a véspera; o erro dessa previsão, dividido pelo desvio esperado, é o z-score. No exemplo, ${D.exemplo_operacoes.length} operações no semestre, ${nGanho} com ganho, todas de menos de 1%. É um exemplo honesto do que a estratégia faz: poucas operações curtas e pequenas.`);

  // ---------------------------------------------------------------- 11 Escolha
  s = pres.addSlide({ masterName: "LMF Modelo", sectionTitle: "Modelo" });
  titulo(s, [`Treino: ${P.n_variantes} variantes, e a escolhida venceu por `, { d: num(margem, 3) }]);
  s.addText("Sharpe líquido de jul/2011 a dez/2019; a grade original (9) e a emenda (6) contam como tentativas", { placeholder: "subtitulo" });
  const hedges = [["mqo", "MQO fixo"], ["kalman_1e-5", "Kalman δ 10⁻⁵"], ["kalman_1e-4", "Kalman δ 10⁻⁴"],
    ["mqo_movel", "MQO z móvel*"], ["kalman_mv", "Kalman MV*"]];
  const gl = [[{ text: "z de entrada", options: { bold: true, color: BRANCO, fill: { color: ROXO }, align: "center", valign: "middle" } },
    ...hedges.map(([, r]) => r)]];
  [1.5, 2.0, 2.5].forEach((zi) => {
    gl.push([{ text: num(zi, 1), options: { bold: true, align: "center" } }, ...hedges.map(([h]) => {
      const g = D.grade.find((r) => r.hedge === h && r.entrada === zi);
      const esc = h === ESC.hedge && zi === ESC.entrada;
      return { text: num(g.sharpe_treino, 2), options: { fill: { color: corCalor(g.sharpe_treino, 0.6) }, bold: esc,
        color: corTexto(corCalor(g.sharpe_treino, 0.6)), fontSize: esc ? 18 : 15,
        border: esc ? [{ type: "solid", pt: 3, color: TINTA }, { type: "solid", pt: 3, color: TINTA },
          { type: "solid", pt: 3, color: TINTA }, { type: "solid", pt: 3, color: TINTA }] : undefined } };
    })]);
  });
  tabela(s, "Grade do treino", gl, { x: MX, y: 1.7, w: 7.4, colW: [1.4, 1.2, 1.2, 1.2, 1.2, 1.2], fontSize: 14, rowH: 0.62 });
  s.addText(`* variantes da emenda (commit ${D.commits[2].hash}), registradas depois do treino da grade original e antes do teste. Contorno: escolhida.`,
    { x: MX, y: 4.35, w: 7.4, h: 0.5, fontFace: FONTE, fontSize: 12, color: CINZA, margin: 0, isTextBox: true, objectName: "Nota da grade" });
  s.addText([{ text: "Escolhida: ", options: { bold: true, color: ROXO } },
    { text: `${nomeHedge[ESC.hedge]}, z = ${num(ESC.entrada, 1)}. Sharpe ${num(ESC.sharpe_treino, 3)}, contra ${num(segunda.sharpe_treino, 3)} da segunda (${nomeHedge[segunda.hedge]}, z = ${num(segunda.entrada, 1)}). A diferença é ${pct(margem / MTr["Erro-padrão do Sharpe"], 0)} do erro-padrão do Sharpe (${num(MTr["Erro-padrão do Sharpe"], 2)}): a regra escolheu por ruído, e seguimos a regra.` }],
  { x: MX, y: 4.95, w: 7.4, h: 1.45, fontFace: FONTE, fontSize: 15, color: TINTA, margin: 0, valign: "top", isTextBox: true,
    objectName: "Texto da escolha" });
  const xr = 8.45;
  destaque(s, "Máximo do acaso", xr, 1.6, 4.3, num(ESC.maximo_esperado_sem_habilidade, 2),
    `Sharpe esperado do melhor de ${P.n_variantes} tentativas sem habilidade nenhuma, em ${num(ESC.anos_treino, 1)} anos`, { tam: 40, hRot: 0.75 });
  destaque(s, "Sharpe deflacionado", xr, 3.15, 4.3, pct(V.sharpe_deflacionado_treino, 0),
    "Sharpe deflacionado: chance de o Sharpe verdadeiro superar o máximo do acaso", { tam: 40, hRot: 0.75 });
  destaque(s, "Operações no treino", xr, 4.7, 4.3, num(MTr["Operações"], 0),
    `operações em ${num(ESC.anos_treino, 1)} anos: a escolhida opera pouco (posição em ${pct(MTr["Pregões com posição"], 0)} dos pregões)`, { tam: 40, hRot: 0.75 });
  s.addText("Fonte: scripts/l03_treino.py; Sharpe deflacionado de Bailey e López de Prado (2014), como no Cap. 7", { placeholder: "fonte" });
  s.addNotes(`A escolha seguiu a regra da ficha: maior Sharpe no treino. Ganhou ${nomeHedge[ESC.hedge]} com z de ${num(ESC.entrada, 1)}, por ${num(margem, 3)} sobre a segunda colocada. Isso é ruído, e está registrado antes de abrir o teste. Mais importante: o melhor de ${P.n_variantes} sorteios sem habilidade nenhuma teria, em média, Sharpe de ${num(ESC.maximo_esperado_sem_habilidade, 2)} nesse período. O treino sozinho já não distinguia a regra do acaso.`);

  // ---------------------------------------------------------------- 12 Curva de capital
  pres.addSection({ title: "Backtest" });
  s = pres.addSlide({ masterName: "LMF Backtest", sectionTitle: "Backtest" });
  titulo(s, ["Fora da amostra, a carteira anda ", { d: "colada ao CDI" }]);
  s.addText("Valor de R$ 1 aplicado em jan/2020 e excesso acumulado sobre o CDI desde 2011", { placeholder: "subtitulo" });
  const ct = D.cota_teste;
  s.addChart(pres.charts.LINE, [
    { name: "Estratégia", labels: ct.datas.map(rotuloData), values: ct.estrategia },
    { name: "CDI", labels: ct.datas.map(rotuloData), values: ct.cdi },
    { name: "BOVA11", labels: ct.datas.map(rotuloData), values: ct.bova11 }],
  eixos({ x: MX, y: 1.55, w: 6.3, h: 3.05, chartColors: [ROXO, "9CA3AF", OCRE], lineSize: 2, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", valAxisLabelFormatCode: "0.0", catAxisLabelFrequency: 52, valAxisMinVal: 0.5,
    showTitle: true, title: "Teste: valor de R$ 1", objectName: "Gráfico da cota no teste" }));
  const dt = D.drawdown_teste;
  s.addChart(pres.charts.LINE, [
    { name: "Estratégia", labels: dt.datas.map(rotuloData), values: dt.estrategia },
    { name: "BOVA11", labels: dt.datas.map(rotuloData), values: dt.bova11 }],
  eixos({ x: MX, y: 4.65, w: 6.3, h: 1.9, chartColors: [ROXO, OCRE], lineSize: 1.5, lineDataSymbol: "none",
    showLegend: false, valAxisLabelFormatCode: "0%", catAxisLabelFrequency: 52, valAxisMaxVal: 0,
    showTitle: true, title: "Drawdown no teste", objectName: "Gráfico do drawdown" }));
  const tr = ex.datas.map((d, i) => (d < D.inicio_teste ? ex.excesso[i] : null));
  const te = ex.datas.map((d, i) => (d >= D.inicio_teste || i === i0 - 1 ? ex.excesso[i] : null));
  s.addChart(pres.charts.LINE, [
    { name: "Treino (jul/2011 a 2019)", labels: ex.datas.map(rotuloData), values: tr },
    { name: "Teste (2020 a out/2026)", labels: ex.datas.map(rotuloData), values: te }],
  eixos({ x: 7.1, y: 1.55, w: 5.7, h: 5.0, chartColors: ["9CA3AF", ROXO], lineSize: 2.25, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", valAxisLabelFormatCode: "0%", catAxisLabelFrequency: 104, displayBlanksAs: "gap",
    showTitle: true, title: "Excesso acumulado sobre o CDI (líquido)", objectName: "Gráfico do excesso acumulado" }));
  s.addText("Fonte: scripts/l04_teste.py; BOVA11 comprado e mantido, pagando o mesmo custo de entrada", { placeholder: "fonte" });
  s.addNotes(`À esquerda, o teste em reais: a linha da estratégia praticamente cobre a do CDI, enquanto o BOVA11 oscila muito mais. O drawdown da estratégia foi de ${pct(MT["Drawdown máx."], 1)}, em ${mesAno(RIS.pior_mes_teste.mes + "-01")}. À direita, só o que a estratégia acrescentou ao CDI desde 2011: ${pct(ex.excesso[ex.excesso.length - 1], 1)} em quinze anos, com uma subida concentrada em 2026.`);

  // ---------------------------------------------------------------- 13 Métricas
  s = pres.addSlide({ masterName: "LMF Backtest", sectionTitle: "Backtest" });
  titulo(s, ["Métricas obrigatórias: ", { d: "treino e teste" }, " lado a lado"]);
  s.addText(`Líquidas de ${pct(P.custo, 2)} por ponta e de aluguel de ${pct(P.aluguel, 0)} a.a.; caixa a 100% do CDI; brutas de IR`, { placeholder: "subtitulo" });
  const linhasM = [
    ["Retorno acumulado", "Retorno acumulado", (x) => pct(x, 1)], ["Retorno a.a.", "Retorno a.a.", (x) => pct(x, 1)],
    ["Excesso a.a. sobre o CDI", "Excesso a.a. sobre o CDI", (x) => pct(x, 2)],
    ["Volatilidade a.a.", "Volatilidade a.a.", (x) => pct(x, 1)], ["Sharpe", "Sharpe", (x) => num(x, 2)],
    ["Erro-padrão do Sharpe", "Erro-padrão do Sharpe", (x) => num(x, 2)],
    ["Drawdown máximo", "Drawdown máx.", (x) => pct(x, 1)], ["Recuperação (pregões)", "Recuperação (pregões)", (x) => num(x, 0)],
    ["Operações", "Operações", (x) => num(x, 0)], ["Taxa de acerto", "Taxa de acerto", (x) => pct(x, 0)],
    ["Beta diário ao Ibovespa", "Beta diário ao Ibovespa", (x) => num(x, 2)], ["t do excesso mensal", "t do excesso mensal", (x) => num(x, 2)],
  ];
  const cabM = [{ text: "Métrica", options: { bold: true, color: BRANCO, fill: { color: ROXO }, align: "left", valign: "middle" } },
    "Estratégia", "CDI", "BOVA11", "Estratégia", "CDI", "BOVA11"];
  const tabM = [cabM];
  linhasM.forEach(([rot, k, f]) => {
    const linha = [rot];
    ["Treino", "Teste"].forEach((p) => ["Estratégia", "CDI", "BOVA11"].forEach((c) => {
      const v = D.metricas[`${p}|${c}`][k];
      const forte = c === "Estratégia" && p === "Teste" && ["t do excesso mensal", "Excesso a.a. sobre o CDI", "Beta diário ao Ibovespa"].includes(k);
      linha.push({ text: v === null ? "–" : f(v), options: forte ? { bold: true, color: ROXO, fill: { color: LILAS } } : {} });
    }));
    tabM.push(linha);
  });
  s.addText("Treino · jul/2011 a dez/2019", { x: MX + 2.75, y: 1.5, w: 4.5, h: 0.3, fontFace: FONTE, fontSize: 14, bold: true,
    color: CINZA, align: "center", margin: 0, isTextBox: true, objectName: "Cabeçalho treino" });
  s.addText("Teste · jan/2020 a 16/out/2026", { x: MX + 7.25, y: 1.5, w: 4.5, h: 0.3, fontFace: FONTE, fontSize: 14, bold: true,
    color: ROXO, align: "center", margin: 0, isTextBox: true, objectName: "Cabeçalho teste" });
  tabela(s, "Tabela de métricas", tabM, { x: MX, y: 1.85, w: W - 2 * MX, colW: [2.75, 1.5, 1.5, 1.5, 1.5, 1.5, 1.98], fontSize: 13, rowH: 0.33 });
  s.addText("Fonte: scripts/l04_teste.py; Sharpe sobre o excesso diário ao CDI (252 pregões); erro-padrão de Lo (2002); beta com erro-padrão HAC", { placeholder: "fonte" });
  s.addNotes(`Três números importam. O t do excesso mensal no teste é ${num(tTeste, 2)}, longe de 2. O excesso é de ${pct(M("Teste", "Estratégia", "Excesso a.a. sobre o CDI"), 2)} ao ano, parecido com o do treino. E o beta é praticamente zero, o que confirma a neutralidade prometida. Contra o BOVA11 a estratégia ganha em retorno e em Sharpe no teste, mas isso diz mais sobre o Ibovespa do período do que sobre a regra.`);

  // ---------------------------------------------------------------- 14 Risco: VaR
  pres.addSection({ title: "Risco" });
  s = pres.addSlide({ masterName: "LMF Risco", sectionTitle: "Risco" });
  titulo(s, ["O VaR de 95% não vê nada: o risco está ", { d: "na cauda" }]);
  s.addText("VaR e CVaR de um pregão no teste, em % do patrimônio (perda positiva, convenção do Cap. 5)", { placeholder: "subtitulo" });
  const vc = D.var_cvar;
  const linV = [["Carteira", "Nível", "VaR hist.", "CVaR hist.", "VaR normal", "VaR t", "VaR C-F"]];
  vc.forEach((r) => linV.push([r.carteira.replace("Estratégia, pregões com posição", "Estratégia, com posição"),
    pct(r.nivel, 0), fmtVar(r["VaR histórico"]), fmtVar(r["CVaR histórico"]), fmtVar(r["VaR normal"]),
    fmtVar(r["VaR t de Student"]), fmtVar(r["VaR Cornish-Fisher"])]));
  tabela(s, "Tabela de VaR e CVaR", linV, { x: MX, y: 1.65, w: 7.8, colW: [2.15, 0.65, 1.0, 1.0, 1.0, 1.0, 1.0], fontSize: 12, rowH: 0.42 });
  const var99pos = vc.find((r) => r.carteira.startsWith("Estratégia, pregões") && r.nivel === 0.99)["VaR histórico"];
  s.addText(`A carteira fica só no CDI em ${pct(1 - MT["Pregões com posição"], 0)} dos pregões; por isso o VaR de 95% sai negativo (um ganho). Nos pregões com posição, o VaR de 99% é de ${pct(var99pos, 1)}. Cornish-Fisher explode com a curtose extrema e deixa de ser uma aproximação útil.`,
    { x: MX, y: 4.95, w: 7.8, h: 1.3, fontFace: FONTE, fontSize: 14, color: TINTA, margin: 0, valign: "top", isTextBox: true, objectName: "Leitura do VaR" });
  const K = RIS.kupiec;
  destaque(s, "Kupiec", 8.85, 1.6, 3.95, `${K.violacoes} × ${num(K.esperadas, 0)}`,
    `violações do VaR histórico de 99% (250 pregões) contra as esperadas: Kupiec ${K.p_valor < 0.05 ? "rejeita" : "não rejeita"} (${K.p_valor < 0.001 ? "p < 0,001" : "p = " + num(K.p_valor, 3)})`, { tam: 36, hRot: 0.95 });
  destaque(s, "Drawdown", 8.85, 3.35, 3.95, pct(M("Teste", "Estratégia", "Drawdown máx."), 1),
    `drawdown máximo, em ${num(M("Teste", "Estratégia", "Queda (pregões)"), 0)} pregões de mar/2020; ${num(M("Teste", "Estratégia", "Recuperação (pregões)"), 0)} pregões para recuperar`,
    { tam: 36, hRot: 0.95, cor: OCRE });
  destaque(s, "Pior pregão", 8.85, 5.1, 3.95, pct(RIS.pior_pregao_teste.retorno, 2),
    "pior pregão do teste (16/03/2020, Covid-19)", { tam: 36, hRot: 0.6, cor: OCRE });
  s.addText("Fonte: scripts/l06_risco.py; VaR histórico, normal, t de Student (ajuste por máxima verossimilhança) e Cornish-Fisher", { placeholder: "fonte" });
  s.addNotes(`Risco de uma estratégia que fica quase sempre no caixa é traiçoeiro. O VaR de 95% sai negativo, porque em ${pct(1 - MT["Pregões com posição"], 0)} dos dias a carteira só rende o CDI. O risco aparece quando ela opera: nos dias com posição, o VaR de 99% é de ${pct(var99pos, 1)} do patrimônio. O teste de Kupiec rejeita o VaR histórico porque as perdas chegam em rajadas, nos períodos de crise.`);

  // ---------------------------------------------------------------- 15 Risco: GARCH e estresse
  s = pres.addSlide({ masterName: "LMF Risco", sectionTitle: "Risco" });
  titulo(s, ["A carteira só opera quando o ", { d: "mercado estressa" }]);
  s.addText("Volatilidade condicional do Ibovespa por GARCH(1,1) t e episódios de estresse do Cap. 6", { placeholder: "subtitulo" });
  const gm = D.garch_mensal;
  const rotM = gm.meses.map((m) => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`);
  s.addChart(pres.charts.LINE, [{ name: "Volatilidade do Ibovespa (a.a.)", labels: rotM, values: gm.vol }],
    eixos({ x: MX, y: 1.55, w: 6.6, h: 2.45, chartColors: [OCRE], lineSize: 1.75, lineDataSymbol: "none", showLegend: false,
      valAxisLabelFormatCode: "0%", catAxisLabelFrequency: 36, catAxisLabelFontSize: 10, showTitle: true, title: "Ibovespa: volatilidade condicional, média do mês",
      objectName: "Gráfico GARCH" }));
  s.addChart(pres.charts.BAR, [{ name: "Pares abertos (média do mês)", labels: rotM, values: gm.pares }],
    eixos({ x: MX, y: 4.05, w: 6.6, h: 2.45, barDir: "col", chartColors: [ROXO], barGapWidthPct: 20, showLegend: false,
      valAxisLabelFormatCode: "0.0", catAxisLabelFrequency: 36, catAxisLabelFontSize: 10, showTitle: true, title: "Estratégia: pares abertos, média do mês",
      objectName: "Gráfico de pares abertos" }));
  const G = RIS.garch_ibov;
  destaque(s, "Vol com posição", 7.55, 1.55, 5.25, `${pct(G.vol_media_com_posicao, 0)} × ${pct(G.vol_media_sem_posicao, 0)}`,
    `volatilidade média do Ibovespa nos pregões com e sem posição (persistência ${num(G.persistencia, 3)}, meia-vida ${num(G.meia_vida_pregoes, 0)} pregões)`,
    { tam: 34, hRot: 0.75 });
  const es = D.estresse;
  s.addChart(pres.charts.BAR, [
    { name: "Excesso da estratégia sobre o CDI", labels: ["Joesley", "Greve 2018", "Covid-19", "Selic 21-22"], values: es.map((e) => e.excesso) },
    { name: "Ibovespa", labels: ["Joesley", "Greve 2018", "Covid-19", "Selic 21-22"], values: es.map((e) => e.ibov) }],
  eixos({ x: 7.45, y: 3.2, w: 5.35, h: 3.3, barDir: "col", barGrouping: "clustered", chartColors: [ROXO, OCRE], showLegend: true,
    legendPos: "b", valAxisLabelFormatCode: "0%", showValue: true, dataLabelFormatCode: "0.0%", dataLabelPosition: "outEnd",
    dataLabelFontSize: 10, valAxisMinVal: -0.6, valAxisMaxVal: 0.1, showTitle: true, title: "Episódios de estresse do Cap. 6",
    objectName: "Gráfico de estresse" }));
  s.addText("Fonte: scripts/l06_risco.py; GARCH(1,1) com t de Student no log-retorno do Ibovespa (pacote arch); episódios do Cap. 6 do livro", { placeholder: "fonte" });
  const covid = es.find((e) => e.episodio === "Covid-19");
  s.addNotes(`O GARCH do Ibovespa mostra a ligação entre a estratégia e o regime de mercado: a carteira abre pares quando a volatilidade explode, como em março de 2020. Nos episódios de estresse do capítulo 6, o excesso sobre o CDI foi de ${pct(covid.excesso, 1)} no Covid, contra ${pct(covid.ibov, 1)} do Ibovespa. É neutra ao mercado, mas não imune a crises: elas são justamente quando os spreads se abrem.`);

  // ---------------------------------------------------------------- 16 Robustez: execução e grade
  pres.addSection({ title: "Robustez" });
  s = pres.addSlide({ masterName: "LMF Robustez", sectionTitle: "Robustez" });
  titulo(s, ["Robustez: o resultado depende de ", { d: "detalhes de execução" }]);
  s.addText("Cada barra é uma rodada a mais no teste: diagnóstico, não novo veredito", { placeholder: "subtitulo" });
  const sens = D.sensibilidade;
  const rotS = sens.map((r) => r.teste.replace("custo ", "Custo ").replace(" por ponta", " por ponta").replace("aluguel ", "Aluguel ")
    .replace("atraso de 0 pregão(ões)", "Ordem no próprio fechamento").replace("atraso de 1 pregão(ões)", "Ordem 1 pregão depois")
    .replace("atraso de 2 pregão(ões)", "Ordem 2 pregões depois").replace("caixa conservador", "Caixa conservador")
    .replace(/(\d)\.(\d)/g, "$1,$2"));
  const casoBase = ["custo 0.10% por ponta", "aluguel 2% a.a.", "atraso de 1 pregão(ões)"];
  s.addChart(pres.charts.BAR, [{ name: "Sharpe no teste", labels: rotS, values: sens.map((r) => r.sharpe) }],
    eixos({ x: MX, y: 1.55, w: 6.3, h: 4.95, barDir: "bar", chartColors: sens.map((r) => (casoBase.includes(r.teste) ? ROXO : (r.sharpe < 0 ? OCRE : "A5A9B4"))),
      showLegend: false, showValue: true, dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd", valAxisMinVal: -0.4, valAxisMaxVal: 0.6, valAxisHidden: true,
      valAxisLabelFormatCode: "0.0", catAxisOrientation: "maxMin", barGapWidthPct: 35, showTitle: true,
      title: "Sharpe no teste por hipótese (roxo: caso-base)", objectName: "Gráfico de sensibilidade" }));
  s.addText("Sharpe no teste, mesma grade do slide 11 (contorno: escolhida no treino)", { x: 7.1, y: 1.6, w: 5.7, h: 0.35,
    fontFace: FONTE, fontSize: 13, color: TINTA, align: "center", margin: 0, isTextBox: true, objectName: "Título da grade do teste" });
  const hedgesT = [["mqo", "MQO fixo"], ["kalman_1e-5", "Kalman 10⁻⁵"], ["kalman_1e-4", "Kalman 10⁻⁴"],
    ["mqo_movel", "MQO móvel*"], ["kalman_mv", "Kalman MV*"]];
  const gt = [[{ text: "z", options: { bold: true, color: BRANCO, fill: { color: ROXO }, align: "center", valign: "middle" } },
    ...hedgesT.map(([, r]) => r)]];
  [1.5, 2.0, 2.5].forEach((zi) => {
    gt.push([{ text: num(zi, 1), options: { bold: true, align: "center" } }, ...hedgesT.map(([h]) => {
      const g = D.grade.find((r) => r.hedge === h && r.entrada === zi);
      const esc = h === ESC.hedge && zi === ESC.entrada;
      const borda = { type: "solid", pt: 3, color: TINTA };
      return { text: num(g.sharpe_teste, 2), options: { fill: { color: corCalor(g.sharpe_teste, 0.6) }, bold: esc,
        color: corTexto(corCalor(g.sharpe_teste, 0.6)), fontSize: esc ? 16 : 14,
        border: esc ? [borda, { ...borda }, { ...borda }, { ...borda }] : undefined } };
    })]);
  });
  tabela(s, "Grade do teste", gt, { x: 7.1, y: 2.05, w: 5.7, colW: [0.6, 1.02, 1.02, 1.02, 1.02, 1.02], fontSize: 13, rowH: 0.55 });
  s.addText([{ text: `Correlação de postos ${num(ROB.grade_correlacao_postos, 2)}. `, options: { bold: true, color: ROXO } },
    { text: `${negativas} das ${P.n_variantes} variantes perdem para o CDI no teste; a segunda colocada do treino (${nomeHedge[segunda.hedge]}, z = ${num(segunda.entrada, 1)}) teve Sharpe de ${num(segunda.sharpe_teste, 2)}.` }],
  { x: 7.1, y: 4.45, w: 5.7, h: 1.3, fontFace: FONTE, fontSize: 15, color: TINTA, margin: 0, valign: "top", isTextBox: true,
    objectName: "Leitura da grade" });
  s.addText("Fonte: scripts/l05_robustez.py; caixa conservador: o produto da venda a descoberto não rende CDI", { placeholder: "fonte" });
  s.addNotes(`Do que o resultado depende? De execução. Com custo de 0,20% por ponta o Sharpe cai para ${num(sensDe("custo 0.20% por ponta").sharpe, 2)}; com 0,50%, fica em ${num(sensDe("custo 0.50% por ponta").sharpe, 2)}. E o atraso: executar no próprio fechamento ou dois pregões depois zera ou inverte o resultado, o que um efeito robusto de reversão não faria. O aluguel quase não pesa, porque a exposição é pequena. À direita, a grade: ${negativas} das ${P.n_variantes} variantes perdem para o CDI no teste.`);

  // ---------------------------------------------------------------- 17 Robustez: concentração
  s = pres.addSlide({ masterName: "LMF Robustez", sectionTitle: "Robustez" });
  titulo(s, ["De onde veio o excesso: ", { d: "2026 e uma operação" }]);
  s.addText("Excesso sobre o CDI por ano e comparação com 200 carteiras de pares sorteados no mesmo setor", { placeholder: "subtitulo" });
  const pa = D.por_ano;
  s.addChart(pres.charts.BAR, [{ name: "Excesso sobre o CDI", labels: pa.anos, values: pa.excesso }],
    eixos({ x: MX, y: 1.55, w: 5.9, h: 3.75, barDir: "col", chartColors: pa.anos.map((a) => (+a >= 2020 ? ROXO : "A5A9B4")),
      showLegend: false, showValue: false, valAxisLabelFormatCode: "0%", barGapWidthPct: 30, showTitle: true,
      title: "Excesso sobre o CDI por ano (cinza: treino; roxo: teste)", objectName: "Gráfico por ano" }));
  const top = D.operacoes_teste[0];
  [[`t = ${num(ROB.t_teste_2020_a_2025, 2)}`, "de 2020 a 2025: sem 2026, não sobra excesso"],
    [`${top.y}/${top.x}`, `uma operação (${rotuloData(top.entrada)}): ${pct(top.contribuicao, 1)} do patrimônio; o teste todo, ${pct(excessoTotal, 1)}`]]
    .forEach(([n, r], i) => destaque(s, `Concentração ${i}`, MX + i * 3.0, 5.4, 2.85, n, r, { tam: 24, hNum: 0.42, hRot: 0.62, tamRot: 13 }));
  const so = D.sorteios;
  s.addChart(pres.charts.BAR, [{ name: "Carteiras sorteadas", labels: so.centros.map((c) => num(Math.round((c - 0.05) * 10) / 10, 1)), values: so.contagem }],
    eixos({ x: 6.85, y: 1.55, w: 5.95, h: 3.6, barDir: "col", chartColors: so.centros.map((c) => (Math.abs(c - V.sharpe_teste) < 0.05 ? ROXO : "C7CAD1")),
      showLegend: false, barGapWidthPct: 10, valAxisLabelFormatCode: "0", catAxisLabelFrequency: 3, catAxisLabelRotate: 0, showTitle: true,
      title: "Sharpe de 200 seleções sorteadas (roxo: estratégia)", objectName: "Histograma dos sorteios" }));
  s.addText([{ text: `Percentil ${pct(ROB.sorteios_percentil_estrategia, 0)}. `, options: { bold: true, color: ROXO } },
    { text: `A regra aplicada a pares sorteados tem Sharpe mediano de ${num(so.mediana, 2)}: escolher por cointegração ajuda, mas a regra sozinha perde do CDI.` }],
  { x: 6.85, y: 5.25, w: 5.95, h: 1.25, fontFace: FONTE, fontSize: 14, color: TINTA, margin: 0, valign: "top", isTextBox: true,
    objectName: "Leitura dos sorteios" });
  s.addText("Fonte: scripts/l05_robustez.py; 2011 só com o 2º semestre; sorteios com semente 42, mesmas regras e custos", { placeholder: "fonte" });
  s.addNotes(`O excesso do teste está concentrado. De 2020 a 2025 o t é ${num(ROB.t_teste_2020_a_2025, 2)}: nada. Em 2026 a carteira ganhou ${pct(ROB.excesso_teste_2026, 1)} sobre o CDI, e uma única operação, ${top.y} contra ${top.x}, rendeu ${pct(top.contribuicao, 1)} do patrimônio, mais da metade dos ${pct(excessoTotal, 1)} de excesso do teste. A boa notícia vem dos sorteios: a mesma regra em pares sorteados perde do CDI, e a estratégia fica no percentil ${num(100 * ROB.sorteios_percentil_estrategia, 0)}. A seleção por cointegração ajuda; o problema é o que vem depois.`);

  // ---------------------------------------------------------------- 18 Por que não funcionou
  s = pres.addSlide({ masterName: "LMF Robustez", sectionTitle: "Robustez" });
  titulo(s, ["Por que não funcionou: a cointegração ", { d: "não dura" }]);
  s.addText("O que se mede em 252 pregões raramente sobrevive ao semestre seguinte, e parte é acaso", { placeholder: "subtitulo" });
  const per = D.series_tempo.persistencia;
  destaque(s, "Persistência", MX, 1.65, 4.2, pct(per.teste.estacionario_5pct, 0),
    "dos pares escolhidos no teste continuam com spread estacionário no semestre seguinte (ADF a 5%, β da formação)", { tam: 54, hNum: 0.85, hRot: 1.0 });
  destaque(s, "Deriva", MX, 3.65, 4.2, `${num(per.teste.deriva_mediana_z, 1)} desvio`,
    "deslocamento mediano do nível do spread no semestre, em desvios da formação", { tam: 40, hNum: 0.7, hRot: 0.75 });
  const mt = D.series_tempo.multiplos_testes.treino;
  s.addText([{ text: `${mt.p_menor_5pct} achados para ${num(mt.falsos_esperados, 0)} falsos esperados. `, options: { bold: true, color: ROXO } },
    { text: "No treino, cerca de um em cada três pares com p < 5% seria acaso puro (Cap. 3: muitos testes, alguns achados)." }],
  { x: MX, y: 5.3, w: 4.2, h: 1.2, fontFace: FONTE, fontSize: 14, color: TINTA, margin: 0, valign: "top", isTextBox: true,
    objectName: "Texto dos múltiplos testes" });
  const mu = D.multiplos;
  s.addChart(pres.charts.BAR, [
    { name: "Pares com p < 5%", labels: mu.map((r) => r.semestre.replace("S", "·")), values: mu.map((r) => r.p_menor_5pct) },
    { name: "Falsos positivos esperados (5% dos candidatos)", labels: mu.map((r) => r.semestre.replace("S", "·")), values: mu.map((r) => r.falsos_esperados) }],
  eixos({ x: 5.2, y: 1.55, w: 7.6, h: 4.95, barDir: "col", barGrouping: "clustered", chartColors: [ROXO, "C7CAD1"], showLegend: true,
    legendPos: "b", valAxisLabelFormatCode: "0", catAxisLabelFrequency: 2, barGapWidthPct: 40, showTitle: true,
    title: "Por semestre: aprovados no Engle-Granger × falsos positivos esperados", objectName: "Gráfico de múltiplos testes" }));
  s.addText("Fonte: scripts/l02_series.py; ADF com constante e defasagens por AIC sobre o spread do semestre de negociação", { placeholder: "fonte" });
  s.addNotes(`Este é o diagnóstico central. Dos pares que passaram no Engle-Granger, só ${pct(per.teste.estacionario_5pct, 0)} continuam com spread estacionário no semestre seguinte, quase a taxa de falso positivo do próprio teste. E testamos muitos pares por semestre: no treino, ${mt.p_menor_5pct} aprovações para ${num(mt.falsos_esperados, 0)} falsos positivos esperados. A estratégia aposta numa relação que, na maior parte das vezes, já não existe quando a posição é aberta.`);

  // ---------------------------------------------------------------- 19 Conclusão
  pres.addSection({ title: "Conclusão" });
  s = pres.addSlide({ masterName: "LMF Conclusão", sectionTitle: "Conclusão" });
  titulo(s, ["Conclusão: ", { d: "inconclusiva" }, ", com um caminho claro"]);
  s.addText(`Excesso de ${pct(M("Teste", "Estratégia", "Excesso a.a. sobre o CDI"), 1)} a.a. sobre o CDI com t = ${num(tTeste, 2)}: a tese não se confirma nem se refuta`, { placeholder: "subtitulo" });
  const quad = [
    ["FaGavel", "Veredito", [`Inconclusiva pela ficha: t = ${num(tTeste, 2)} < 2 e excesso médio > 0`,
      `Sem 2026, t = ${num(ROB.t_teste_2020_a_2025, 2)}`, `Seleção por cointegração supera o acaso (percentil ${num(100 * ROB.sorteios_percentil_estrategia, 0)})`]],
    ["FaCoins", "Significância econômica", [`${pct(MT["Excesso a.a. sobre o CDI"], 1)} a.a. com ${pct(exposicao, 1)} de exposição média: pouco capital trabalhando`,
      `Some com custo de 0,50% por ponta (Sharpe ${num(sensDe("custo 0.50% por ponta").sharpe, 2)}) ou atraso\u00A0≠\u00A01\u00A0pregão`, `Sharpe ${num(V.sharpe_teste, 2)} ± ${num(M("Teste", "Estratégia", "Erro-padrão do Sharpe"), 2)}: indistinguível de zero`]],
    ["FaTriangleExclamation", "Limitações", ["Universo escolhido hoje: viés de sobrevivência",
      "Yahoo com cinco correções manuais; custo único, sem impacto", `${P.n_variantes} variantes; a escolhida venceu por ${num(margem, 3)}`]],
    ["FaRoute", "Próximos passos", ["Teste prospectivo: regra congelada a partir de nov/2026",
      "Composição histórica do Ibovespa e dados COTAHIST", "Selecionar por estabilidade do spread em walk-forward"]],
  ];
  quad.forEach(([icn, nome, itens], i) => {
    const x = MX + (i % 2) * 6.17, y = 1.6 + Math.floor(i / 2) * 2.5, w = 5.95, h = 2.3;
    cartao(s, `Quadro ${nome}`, x, y, w, h);
    bolinha(s, nome, x + 0.25, y + 0.25, 0.6, ic[icn]);
    s.addText(nome, { x: x + 1.0, y: y + 0.25, w: w - 1.2, h: 0.6, fontFace: FONTE, fontSize: 19, bold: true, color: TINTA,
      margin: 0, valign: "middle", isTextBox: true, objectName: `${nome} título` });
    s.addText(itens.map((t, j) => ({ text: t, options: { bullet: { indent: 15 }, breakLine: j < itens.length - 1 } })),
      { x: x + 0.3, y: y + 0.95, w: w - 0.5, h: h - 1.05, fontFace: FONTE, fontSize: 14, color: TINTA, valign: "top",
        paraSpaceAfter: 4, margin: 0, isTextBox: true, objectName: `${nome} itens` });
  });
  s.addText("Fonte: resultados/veredito.json e resultados/robustez.json; PRE_REGISTRO.md", { placeholder: "fonte" });
  s.addNotes("Respondendo às quatro perguntas do enunciado. Veredito: inconclusiva, pela regra que escrevemos antes. Significância econômica: pequena; o excesso depende de 2026, de custos baixos e de um atraso específico. Limitações: universo de hoje, dados gratuitos com correções, quinze tentativas. O que faríamos: congelar a regra e acompanhar a partir de novembro, que é o único teste sem nenhuma contaminação, e trocar a seleção por uma que exija estabilidade do spread fora da amostra.");

  // ---------------------------------------------------------------- 20 Obrigado
  s = pres.addSlide({ masterName: "LMF Capa", sectionTitle: "Conclusão" });
  s.addImage({ path: path.join(ASSETS, "lmf_simbolo_branco.png"), x: 7.75, y: 1.0, w: 5.45, h: 5.23, transparency: 92,
    objectName: "Águia de fundo" });
  s.addImage({ path: path.join(ASSETS, "lmf_marca_branco.png"), x: MX + 0.05, y: 0.55, w: 3.9, h: 0.6, objectName: "Marca da Liga" });
  s.addText("Obrigado", { x: MX, y: 2.1, w: 7, h: 1.1, fontFace: FONTE, fontSize: 60, bold: true, color: BRANCO, margin: 0,
    isTextBox: true, objectName: "Título" });
  s.addText("Perguntas? O apêndice traz as respostas às 14 perguntas previsíveis da banca (Cap. 12).",
    { x: MX, y: 3.25, w: 6.6, h: 0.9, fontFace: FONTE, fontSize: 20, color: ROXO_CLARO, margin: 0, valign: "top",
      isTextBox: true, objectName: "Subtítulo" });
  s.addShape("roundRect", { x: MX, y: 4.45, w: 7.9, h: 1.65, fill: { color: GRAFITE_2 }, line: { color: GRAFITE_2 },
    rectRadius: 0.08, objectName: "Caixa de reprodução" });
  s.addText([
    { text: "Para reproduzir todos os números", options: { bold: true, color: BRANCO, breakLine: true } },
    { text: "git clone https://github.com/joaoemanuelzilli/quant-final-2026-2", options: { fontFace: "Consolas", color: ROXO_CLARO, breakLine: true } },
    { text: "pip install -r requirements.txt", options: { fontFace: "Consolas", color: ROXO_CLARO, breakLine: true } },
    { text: "python scripts/l01_dados.py  (…)  python scripts/l07_slides.py", options: { fontFace: "Consolas", color: ROXO_CLARO } }],
  { x: MX + 0.25, y: 4.5, w: 7.5, h: 1.55, fontFace: FONTE, fontSize: 13, valign: "middle", margin: 0, isTextBox: true,
    objectName: "Texto de reprodução" });
  s.addShape("roundRect", { x: 9.35, y: 2.2, w: 2.9, h: 2.9, fill: { color: BRANCO }, line: { color: BRANCO }, rectRadius: 0.08,
    objectName: "Fundo do QR" });
  s.addImage({ path: path.join(ASSETS, "qr_repositorio.png"), x: 9.5, y: 2.35, w: 2.6, h: 2.6, objectName: "QR do repositório" });
  s.addText("código, dados e pré-registro", { x: 9.0, y: 5.2, w: 3.6, h: 0.35, fontFace: FONTE, fontSize: 14, color: "C7C7D6",
    align: "center", margin: 0, isTextBox: true, objectName: "Legenda do QR" });
  s.addNotes("Encerrar reforçando que o repositório reproduz cada número e que a ficha de pré-registro e os commits datados estão públicos. Abrir para perguntas; o apêndice tem respostas curtas, com número, para as perguntas que a banca costuma fazer.");

  // ---------------------------------------------------------------- Apêndice
  pres.addSection({ title: "Apêndice" });
  const BV = D.metricas["Teste|BOVA11"];
  const nAcoes = Object.values(D.universo).flat().length;
  const topo = D.operacoes_teste[0];
  const banca = [
    ["Onde poderia haver look-ahead?", "Formação só com os 252 pregões anteriores; z de t com dados até t; ordem em t+1. Teste automático “o futuro não muda o passado” e dados cortados no fim de cada período."],
    ["Quantas variantes vocês testaram?", `${P.n_variantes}: ${P.n_original} da ficha e ${P.n_variantes - P.n_original} da emenda, ambas antes do teste, todas reportadas. Sharpe deflacionado do treino: ${pct(V.sharpe_deflacionado_treino, 0)}.`],
    ["E se o custo dobrar?", `Giro de ${num(MT["Giro anual"], 1)} vezes o patrimônio por ano. Com 0,20% por ponta, Sharpe ${num(V.sharpe_teste, 2)} → ${num(sensDe("custo 0.20% por ponta").sharpe, 2)}; com 0,50%, ${num(sensDe("custo 0.50% por ponta").sharpe, 2)}.`],
    ["Por que este benchmark?", `Carteira de soma zero com caixa no CDI: o CDI é o custo de oportunidade. Contra o BOVA11 ganha em retorno (${pct(MT["Retorno a.a."], 1)} × ${pct(BV["Retorno a.a."], 1)} a.a.) e em Sharpe (${num(V.sharpe_teste, 2)} × ${num(BV.Sharpe, 2)}).`],
    ["Há viés de sobrevivência?", `Sim: ${nAcoes} ações que existem hoje no Yahoo. Mitigação parcial: liquidez e preço filtrados com dados da época.`],
    ["Depende de um ano ou de um ativo?", `Sim. Sem 2026, t = ${num(ROB.t_teste_2020_a_2025, 2)}; a operação ${topo.y}/${topo.x} rendeu ${pct(topo.contribuicao, 1)} do patrimônio, para ${pct(excessoTotal, 1)} de excesso no teste todo.`],
    ["Qual a incerteza do Sharpe?", `${num(V.sharpe_teste, 2)} ± ${num(MT["Erro-padrão do Sharpe"], 2)} (Lo). IC de 95% do excesso mensal: ${pct(V.ic95_excesso_mensal[0], 2)} a +${pct(V.ic95_excesso_mensal[1], 2)}. Indistinguível de zero.`],
  ];
  const banca2 = [
    ["Qual foi o pior momento?", `${mesAno(RIS.pior_mes_teste.mes + "-01").replace(/^./, (c) => c.toUpperCase())}: ${pct(MT["Drawdown máx."], 1)} em ${num(MT["Queda (pregões)"], 0)} pregões, ${num(MT["Recuperação (pregões)"], 0)} pregões para recuperar. Com ${pct(P.bruto_por_par, 0)} de exposição por par, era suportável.`],
    ["Chego aos mesmos números se clonar?", "Sim: dados congelados, versões exatas em requirements.txt, sementes fixas e scripts l01 a l07 em ordem."],
    ["Que resultado refutaria a tese?", `Excesso mensal médio ≤ 0 no teste, escrito na ficha (commit ${D.commits[0].hash}) antes de qualquer backtest.`],
    ["As variantes vizinhas são outras apostas?", `Correlação de postos treino × teste de ${num(ROB.grade_correlacao_postos, 2)}. Sem energia elétrica, t = ${num(semSetor("Energia elétrica").t, 2)}; sem petróleo, ${num(semSetor("Petróleo e gás").t, 2)}.`],
    ["Quanto capital a estratégia comporta?", `Cada perna leva até ${pct(P.bruto_por_par / 2, 0)} do patrimônio; com piso de R$ ${num(P.volume_minimo / 1e6, 0)} mi/dia, uma carteira de R$ 10 mi já negociaria ${pct(1e7 * P.bruto_por_par / 2 / P.volume_minimo, 0)} do volume do papel menos líquido.`],
    ["Quanto é mercado e quanto é seleção?", `Beta diário de ${num(MT["Beta diário ao Ibovespa"], 2)} (erro-padrão ${num(MT["Erro-padrão do beta"], 2)}); correlação de ${num(MT["Correlação com o Ibovespa"], 2)}, concentrada nos dias de crise.`],
    ["Líquido de quê?", `De ${pct(P.custo, 2)} por ponta e aluguel de ${pct(P.aluguel, 0)} a.a.; caixa a 100% do CDI, inclusive a venda a descoberto; bruto de IR.`],
  ];
  [[banca, "1 a 7"], [banca2, "8 a 14"]].forEach(([qs, rot]) => {
    s = pres.addSlide({ masterName: "LMF Geral", sectionTitle: "Apêndice" });
    titulo(s, ["Apêndice: perguntas da banca, ", { d: rot }]);
    s.addText("As 14 perguntas previsíveis do Cap. 12, cada uma com uma resposta de 30 segundos e um número", { placeholder: "subtitulo" });
    const lq = [["Pergunta", "Resposta curta"]];
    qs.forEach(([q, r]) => lq.push([{ text: q, options: { bold: true } }, r]));
    tabela(s, `Tabela da banca ${rot}`, lq, { x: MX, y: 1.6, w: W - 2 * MX, colW: [3.6, W - 2 * MX - 3.6], fontSize: 14, rowH: 0.6,
      valign: "middle", alinhar: "left" });
    s.addText("Fontes: resultados/*.json e *.csv do repositório", { placeholder: "fonte" });
    s.addNotes("Slide de apoio para a fase de perguntas. Cada resposta cabe em trinta segundos e traz um número verificável no repositório.");
  });

  s = pres.addSlide({ masterName: "LMF Geral", sectionTitle: "Apêndice" });
  titulo(s, ["Apêndice: as operações do ", { d: "teste" }]);
  s.addText("39 operações de jan/2020 a out/2026, ordenadas pela contribuição ao patrimônio; as 6 melhores e as 6 piores", { placeholder: "subtitulo" });
  const ops = D.operacoes_teste;
  const sel = [...ops.slice(0, 6), ...ops.slice(-6)];
  const lo = [["Par", "Setor", "Lado", "Entrada", "Saída", "Motivo", "Pregões", "Retorno", "Contribuição"]];
  const dbr = (s0) => `${s0.slice(8, 10)}/${s0.slice(5, 7)}/${s0.slice(2, 4)}`;
  sel.forEach((o) => lo.push([`${o.y}/${o.x}`, o.setor, o.direcao > 0 ? "compra spread" : "vende spread", dbr(o.entrada), dbr(o.saida),
    o.motivo, String(o.pregoes), { text: pct(o.retorno, 1), options: { color: o.retorno > 0 ? ROXO : OCRE, bold: true } },
    { text: pct(o.contribuicao, 2), options: { color: o.contribuicao > 0 ? ROXO : OCRE, bold: true } }]));
  tabela(s, "Tabela de operações", lo, { x: MX, y: 1.6, w: W - 2 * MX, colW: [1.65, 2.2, 1.45, 1.1, 1.1, 1.15, 0.95, 1.15, 1.48], fontSize: 12, rowH: 0.36 });
  s.addText("Fonte: resultados/teste_operacoes.csv; retorno sobre a exposição bruta do par; contribuição sobre o patrimônio na entrada", { placeholder: "fonte" });
  s.addNotes("Tabela de apoio: mostra que os maiores ganhos e as maiores perdas vêm de poucos episódios, quase todos em março de 2020 e em 2026.");

  s = pres.addSlide({ masterName: "LMF Geral", sectionTitle: "Apêndice" });
  titulo(s, ["Apêndice: o ", { d: "universo" }, " de 73 ações em 15 setores"]);
  s.addText("Pares só se formam dentro do mesmo setor; a elegibilidade de cada semestre usa liquidez e preço da época", { placeholder: "subtitulo" });
  const uni = Object.entries(D.universo);
  const lu = [["Setor", "Ações", "Setor", "Ações"]];
  for (let i = 0; i < Math.ceil(uni.length / 2); i++) {
    const a = uni[i], b = uni[i + Math.ceil(uni.length / 2)];
    lu.push([{ text: a[0], options: { bold: true } }, a[1].join(", "), b ? { text: b[0], options: { bold: true } } : "", b ? b[1].join(", ") : ""]);
  }
  tabela(s, "Tabela do universo", lu, { x: MX, y: 1.6, w: W - 2 * MX, colW: [2.3, 3.8, 2.3, 3.83], fontSize: 12, rowH: 0.52, alinhar: "left" });
  s.addText("Fonte: pares/config.py", { placeholder: "fonte" });
  s.addNotes("Universo completo, para a pergunta sobre viés de sobrevivência: são ações que existem hoje, o que favorece qualquer regra testada nelas.");

  await pres.writeFile({ fileName: SAIDA });
  await aplicarTema(SAIDA, THEME);
  console.log("gravado:", SAIDA);
}

main().catch((e) => { console.error(e); process.exit(1); });
