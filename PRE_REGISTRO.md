# Ficha de pré-registro: pares cointegrados na B3

Núcleo de Análise Quantitativa · Liga de Mercado Financeiro (UFU)
Escrita e gravada em commit em 18/10/2026, **antes de qualquer backtest**,
no treino ou no teste. Segue o formato do Capítulo 12 do livro do Núcleo
(*Finanças quantitativas com Python*). Os valores numéricos desta ficha
estão também em `pares/config.py`, no mesmo commit.

## O que já tinha sido feito quando a ficha foi escrita

1. Download e congelamento dos dados (`scripts/baixar_dados.py`), até o
   pregão de 16/10/2026.
2. Uma conta de viabilidade **só com o treino**: quantas ações passam no
   filtro de liquidez e quantos pares passam nos critérios estatísticos a
   cada semestre de 2011 a 2019 (de 0 a 9 pares por semestre). Nenhum
   retorno de estratégia foi calculado, em período algum.
3. Nenhum backtest de pares foi feito pelo Núcleo antes desta ficha: o
   livro do Núcleo trata pares e cointegração só na teoria (Cap. 8, seção
   "Pares e cointegração"), sem resultado empírico. O período de teste é,
   nesse sentido, inédito para quem escreveu a ficha.

## Afirmação

Entre ações da B3 do mesmo setor, os pares cujos log-preços se mostram
cointegrados nos 252 pregões anteriores têm um spread que volta à média
no semestre seguinte. Uma carteira comprada e vendida de soma zero, que
abre posição quando o spread se afasta da média e fecha quando ele volta,
rende acima do CDI, líquida de custos de transação e de aluguel de ações.

## Mecanismo

Lei do preço único com limites à arbitragem. Ações ligadas por fluxo de
caixa (classes ON e PN da mesma empresa, holding e controlada) ou pelos
mesmos fatores (concorrentes do mesmo setor) são deslocadas uma da outra
por choques de liquidez sem informação: fluxo de índices e de
estrangeiros, ordens grandes, rebalanceamentos. Quem compra a perna
barata e vende a cara fornece liquidez e é pago por isso. O efeito não é
eliminado porque a arbitragem tem custo e risco: aluguel e garantias da
venda a descoberto e a chance de o spread abrir mais antes de fechar
(Shleifer e Vishny, 1997).

Evidência anterior: Gatev, Goetzmann e Rouwenhorst (2006), nos EUA de
1962 a 2002, encontram retorno em excesso de até 11% ao ano; Do e Faff
(2010) mostram que esse lucro caiu ao longo do tempo; Caldeira e Moura
(2013), na B3 de 2005 a 2012, com seleção por cointegração, reportam cerca
de 16% ao ano de excesso e Sharpe de 1,34. A queda documentada por Do e
Faff e a amostra brasileira anterior a 2013 fazem esperar um efeito menor
do que o publicado.

## Universo e horizonte

- 73 ações em 15 grupos setoriais (lista em `pares/config.py`). Pares só
  dentro do mesmo grupo.
- Em cada semestre, uma ação é elegível se, nos 252 pregões de formação,
  tem preço em pelo menos 95% deles, mediana do volume financeiro diário
  de pelo menos R$ 10 milhões e fechamento sem ajuste de pelo menos R$ 5
  no último pregão da formação.
- Posições compradas e vendidas, de dias a semanas; carteira refeita a
  cada semestre civil.

## Modelo

**Formação** (252 pregões anteriores ao semestre, só dados passados):

1. Teste de Engle-Granger (`statsmodels.tsa.stattools.coint`, constante,
   defasagens por AIC) sobre os log-preços ajustados, nas duas ordens; fica
   a ordem de menor p-valor.
2. Aprovado se p-valor < 0,05, beta > 0 e meia-vida do resíduo (AR(1),
   h = −ln 2 / ln φ) entre 2 e 63 pregões.
3. Ordena por p-valor e escolhe até 10 pares, com no máximo 2 pares por
   ação e 3 por setor.

**Negociação** (pregões do semestre):

- Spread: `ln Y − β ln X − α`. Duas formas de estimar β (ver variantes):
  MQO fixo da formação, com z-score `z = resíduo / desvio da formação`; ou
  filtro de Kalman (β e α como passeio aleatório, variância de estado
  δ/(1−δ), variância de observação igual à variância do resíduo da
  formação), com `z = erro de previsão / desvio previsto`.
- Entrada: z ≤ −z_entrada compra o spread (compra Y, vende X);
  z ≥ +z_entrada vende o spread.
- Saída: quando z cruza zero. Stop: |z| ≥ z_entrada + 2, e o par fica
  bloqueado até o fim do semestre. Todas as posições fecham no último
  pregão do semestre.
- Tamanho: cada par recebe exposição bruta de 20% do patrimônio na
  entrada (comprado + vendido), dividida entre as pernas na proporção
  1 : β. Com 10 pares abertos, a exposição bruta chega a 200%.

## Períodos

- Aquecimento: 2010 a junho de 2011 (formação do primeiro semestre).
- Treino: semestres de negociação de julho de 2011 a dezembro de 2019
  (17 semestres).
- Teste: de janeiro de 2020 a 16 de outubro de 2026 (13 semestres e uma
  fração), aberto **uma única vez**.

## Variantes

Nove: z_entrada ∈ {1,5; 2,0; 2,5} × hedge ∈ {MQO fixo, Kalman δ = 10⁻⁵,
Kalman δ = 10⁻⁴}. Escolhe-se a de maior Sharpe líquido no treino. Todas as
nove são reportadas no treino e no teste.

## Execução e custos

- Sinal com o fechamento do pregão t; ordem no fechamento de t+1 (um
  pregão de atraso, exigência do enunciado).
- Custo de 0,10% do valor negociado, por ponta (taxas, meio spread e
  slippage de ordens pequenas, hipótese do livro).
- Aluguel de 2% ao ano sobre o valor da ponta vendida, cobrado por dia.
- Caixa, incluindo o produto da venda a descoberto, rende 100% do CDI.
- Preços ajustados por proventos: a ponta vendida paga os dividendos.
- Retornos brutos de imposto de renda.

## Benchmarks

- Principal: CDI. A carteira é de soma zero; o que ela acrescenta ao CDI
  é o resultado da tese.
- Secundário (exigido pelo enunciado): BOVA11 comprado e mantido.
- Acaso: 200 sorteios (semente 42) de pares do mesmo setor, entre as ações
  elegíveis, com as mesmas regras de negociação e a variante escolhida. Mede
  se a seleção por cointegração acrescenta algo à regra de negociação.

## Métricas

As obrigatórias do enunciado (retorno acumulado e anualizado, volatilidade
anualizada, Sharpe sobre o CDI, drawdown máximo e tempo de recuperação,
número de operações e taxa de acerto), mais: Sortino, giro anual, beta
diário em relação ao Ibovespa, estatística t do excesso mensal sobre o CDI,
erro-padrão do Sharpe (Lo, 2002) e Sharpe deflacionado pelas nove
variantes. Convenção de 252 pregões.

## Regra de decisão

No período de teste, com a variante escolhida no treino:

- **Confirmada** se a estatística t do retorno mensal em excesso ao CDI
  for ≥ 2.
- **Refutada** se o retorno mensal médio em excesso ao CDI for ≤ 0.
- **Inconclusiva** em qualquer outro caso.

Pergunta secundária (seleção): a seleção por cointegração acrescenta
valor se o Sharpe da estratégia no teste ficar acima do percentil 90 dos
200 sorteios.

Poder do teste, calculado antes: com cerca de 6,8 anos de teste, t ≥ 2
exige razão de informação (contra o CDI) acima de 2/√6,8 ≈ 0,77.

## Robustez planejada (diagnóstico, não muda o veredito)

Custo por ponta de 0%, 0,10%, 0,20% e 0,50%; aluguel de 0%, 2%, 4% e
8% ao ano; atraso de 0, 1 e 2 pregões; caixa conservador (produto da venda
a descoberto sem CDI); retirada de um setor por vez; resultado por ano;
contribuição por setor; grade das nove variantes no treino e no teste;
estresse nos episódios do Cap. 6 (Covid-19, Joesley Day, fev.–jun./2018,
alta da Selic 2021–2022).

## Referências

- Caldeira, J. e Moura, G. (2013). Selection of a portfolio of pairs based
  on cointegration: a statistical arbitrage strategy. *Revista Brasileira
  de Finanças*, 11(1), 49–80.
- Chan, E. (2013). *Algorithmic Trading*. Wiley.
- Do, B. e Faff, R. (2010). Does simple pairs trading still work?
  *Financial Analysts Journal*, 66(4), 83–95.
- Gatev, E., Goetzmann, W. e Rouwenhorst, K. G. (2006). Pairs trading:
  performance of a relative-value arbitrage rule. *Review of Financial
  Studies*, 19(3), 797–827.
- Lo, A. (2002). The statistics of Sharpe ratios. *Financial Analysts
  Journal*, 58(4), 36–52.
- Shleifer, A. e Vishny, R. (1997). The limits of arbitrage. *Journal of
  Finance*, 52(1), 35–55.
