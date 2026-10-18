"""Risco (Caps. 4, 5 e 6 do livro): VaR, CVaR, Kupiec, GARCH e estresse.

Convenção do livro: perda L = -R, positiva quando se perde; VaR e CVaR de
um pregão, em % do patrimônio.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from arch import arch_model
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar
from pares.metricas import drawdown

d = carregar()
ret = pd.concat([pd.read_csv(C.RESULTADOS / f"{n}_retornos.csv", index_col=0,
                             parse_dates=True) for n in ["treino", "teste"]])
diario = pd.concat([pd.read_csv(C.RESULTADOS / f"{n}_diario_escolhida.csv",
                                index_col=0, parse_dates=True)
                    for n in ["treino", "teste"]])
teste = ret.loc[C.TESTE[0]:]
saida = {}


def var_es(r, nivel):
    """VaR e CVaR de um pregão por quatro métodos (perda positiva)."""
    perda = -r.dropna().to_numpy()
    mu, sd = perda.mean(), perda.std(ddof=1)
    z = stats.norm.ppf(nivel)
    q = np.quantile(perda, nivel)
    nu, loc, esc = stats.t.fit(perda)
    tq = stats.t.ppf(nivel, nu)
    s, k = stats.skew(perda), stats.kurtosis(perda)       # k: excesso
    zcf = z + (z ** 2 - 1) * s / 6 + (z ** 3 - 3 * z) * k / 24 - (2 * z ** 3 - 5 * z) * s ** 2 / 36
    es_t = loc + esc * stats.t.pdf(tq, nu) / (1 - nivel) * (nu + tq ** 2) / (nu - 1)
    return {"VaR histórico": q, "CVaR histórico": perda[perda >= q].mean(),
            "VaR normal": mu + sd * z,
            "CVaR normal": mu + sd * stats.norm.pdf(z) / (1 - nivel),
            "VaR t de Student": loc + esc * tq, "CVaR t de Student": es_t,
            "VaR Cornish-Fisher": mu + sd * zcf}


linhas = []
for nome, col in [("Estratégia", "estrategia"), ("BOVA11", "bova11")]:
    for nivel in [0.95, 0.99]:
        linhas.append({"carteira": nome, "nivel": nivel,
                       **var_es(teste[col], nivel)})
# a mesma conta só nos pregões em que a carteira tinha posição
com_posicao = diario.loc[C.TESTE[0]:, "pares_abertos"].shift(1) > 0
for nivel in [0.95, 0.99]:
    linhas.append({"carteira": "Estratégia, pregões com posição", "nivel": nivel,
                   **var_es(teste.loc[com_posicao, "estrategia"], nivel)})
var = pd.DataFrame(linhas)
var.to_csv(C.RESULTADOS / "var_cvar.csv", index=False)
print(var.round(5).to_string())

# Kupiec: VaR histórico 99% em janela de 250 pregões, previsto na véspera
perda = -ret["estrategia"]
previsto = perda.rolling(250).quantile(0.99).shift(1)
janela = previsto.loc[C.TESTE[0]:].dropna()
viol = (perda.loc[janela.index] > janela).astype(int)
x, T, p = viol.sum(), len(viol), 0.01
ph = x / T
lr = -2 * ((T - x) * np.log(1 - p) + x * np.log(p)
           - ((T - x) * np.log(1 - ph) + (x * np.log(ph) if x else 0)))
saida["kupiec"] = {"violacoes": int(x), "pregoes": int(T), "esperadas": T * p,
                   "lr": lr, "p_valor": 1 - stats.chi2.cdf(lr, 1)}
print("Kupiec:", saida["kupiec"])

# GARCH(1,1) t no Ibovespa: em que regime de volatilidade a carteira opera?
r_ibov = 100 * np.log(1 + ret["ibov"].dropna())
modelo = arch_model(r_ibov, mean="Constant", vol="GARCH", p=1, q=1,
                    dist="t").fit(disp="off")
par = modelo.params
persist = par["alpha[1]"] + par["beta[1]"]
vol_cond = modelo.conditional_volatility * np.sqrt(252)
aberto = diario["pares_abertos"].reindex(vol_cond.index).fillna(0) > 0
saida["garch_ibov"] = {
    "omega": par["omega"], "alpha": par["alpha[1]"], "beta": par["beta[1]"],
    "nu": par["nu"], "persistencia": persist,
    "meia_vida_pregoes": np.log(0.5) / np.log(persist),
    "vol_longo_prazo_aa": np.sqrt(par["omega"] / (1 - persist) * 252) / 100,
    "vol_media_com_posicao": vol_cond[aberto].mean() / 100,
    "vol_media_sem_posicao": vol_cond[~aberto].mean() / 100}
print("GARCH Ibovespa:", {k: round(v, 4) for k, v in saida["garch_ibov"].items()})
pd.DataFrame({"vol_ibov_aa": vol_cond / 100,
              "pares_abertos": diario["pares_abertos"].reindex(vol_cond.index),
              "bruta": diario["bruta"].reindex(vol_cond.index)}).to_csv(
    C.RESULTADOS / "garch_exposicao.csv")

# estresse: episódios históricos do Cap. 6, com a carteira efetivamente operada
EPISODIOS = {"Joesley Day": ("2017-05-17", "2017-05-18"),
             "Greve dos caminhoneiros (fev.-jun./2018)": ("2018-02-26", "2018-06-18"),
             "Covid-19": ("2020-01-23", "2020-03-23"),
             "Alta da Selic (2021-2022)": ("2021-06-07", "2022-07-14")}
linhas = []
for nome, (a, b) in EPISODIOS.items():
    trecho = ret.loc[a:b].iloc[1:]           # do fechamento de a ao de b
    acum = (1 + trecho).prod() - 1
    linhas.append({"episodio": nome, "inicio": a, "fim": b, "pregoes": len(trecho),
                   "estrategia": acum["estrategia"], "cdi": acum["cdi"],
                   "excesso": (1 + acum["estrategia"]) / (1 + acum["cdi"]) - 1,
                   "ibov": acum["ibov"], "bova11": acum["bova11"]})
estresse = pd.DataFrame(linhas)
estresse.to_csv(C.RESULTADOS / "estresse.csv", index=False)
print(estresse.round(4).to_string())

# drawdown e pior momento
for nome, r in [("treino", ret.loc[:C.TREINO[1]]), ("teste", teste)]:
    dd = drawdown(r["estrategia"])
    dd_b = drawdown(r["bova11"])
    pd.DataFrame({"estrategia": dd, "bova11": dd_b}).to_csv(
        C.RESULTADOS / f"{nome}_drawdown.csv")
saida["pior_pregao_teste"] = {"data": str(teste["estrategia"].idxmin().date()),
                              "retorno": teste["estrategia"].min()}
mes = (1 + teste["estrategia"]).groupby(teste.index.to_period("M")).prod() - 1
saida["pior_mes_teste"] = {"mes": str(mes.idxmin()), "retorno": mes.min()}
(C.RESULTADOS / "risco.json").write_text(json.dumps(saida, indent=1,
                                                    default=float))
print(json.dumps({k: saida[k] for k in ["pior_pregao_teste", "pior_mes_teste"]},
                 default=float))
