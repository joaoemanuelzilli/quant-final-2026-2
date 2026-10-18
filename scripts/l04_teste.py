"""Rodada única no período de teste (jan/2020 a 16/out/2026).

Aplica a variante escolhida no treino (resultados/escolha.json), calcula
as métricas obrigatórias no treino e no teste, para a estratégia e para os
benchmarks, e dá o veredito pela regra de decisão da ficha. O resultado
desta rodada é o resultado do projeto.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar
from pares.metricas import (beta_mercado, excesso_mensal, metricas,
                            resumo_operacoes, sharpe_deflacionado)
from pares.motor import backtest
from pares.selecao import tabela_semestres

escolha = json.loads((C.RESULTADOS / "escolha.json").read_text())
HEDGE, ENTRADA = escolha["hedge"], escolha["entrada"]
completo = carregar()


def comprar_e_manter(d, ativo, periodo):
    """Começa em caixa, compra no fechamento do 1º pregão pagando o custo."""
    r = d["ret"].loc[periodo[0]:periodo[1], ativo].fillna(0.0).copy()
    r.iloc[0] = d["cdi"].loc[r.index[0]] - C.CUSTO
    return r


def rodada(nome, periodo):
    d = {k: v.loc[:periodo[1]] for k, v in completo.items()}
    semestres = tabela_semestres(*periodo)
    diario, ops = backtest(d, semestres, ENTRADA, HEDGE, periodo)
    cdi = d["cdi"].loc[periodo[0]:periodo[1]]
    bova = comprar_e_manter(d, "BOVA11", periodo)
    anos = len(diario) / 252
    tab = {}
    for rotulo, r in [("Estratégia", diario["ret"]), ("CDI", cdi), ("BOVA11", bova)]:
        m = metricas(r, d["cdi"])
        if rotulo == "CDI":
            m[["Sharpe", "Sortino", "Erro-padrão do Sharpe"]] = np.nan
        tab[rotulo] = m
    tab = pd.DataFrame(tab)
    o = resumo_operacoes(ops)
    a, ri, t = excesso_mensal(diario["ret"], d["cdi"])
    beta = beta_mercado(diario["ret"], d["cdi"], d["ret"]["IBOV"])
    extra = {"Operações": o["Operações"], "Taxa de acerto": o["Taxa de acerto"],
             "Payoff": o["Payoff"], "Giro anual": diario["giro"].sum() / anos,
             "Exposição bruta média": diario["bruta"].mean(),
             "Pregões com posição": (diario["pares_abertos"] > 0).mean(),
             "Excesso médio ao mês": a.mean(), "Razão de informação (CDI)": ri,
             "t do excesso mensal": t, "Beta diário ao Ibovespa": beta["beta"],
             "Erro-padrão do beta": beta["beta_ep"],
             "Correlação com o Ibovespa": beta["correlacao"]}
    for k, v in extra.items():
        tab.loc[k, "Estratégia"] = v
    diario.to_csv(C.RESULTADOS / f"{nome}_diario_escolhida.csv")
    ops.to_csv(C.RESULTADOS / f"{nome}_operacoes.csv", index=False)
    pd.DataFrame({"estrategia": diario["ret"], "cdi": cdi, "bova11": bova,
                  "ibov": d["ret"]["IBOV"].loc[periodo[0]:periodo[1]]}).to_csv(
        C.RESULTADOS / f"{nome}_retornos.csv")
    return tab, a, t


treino, _, t_treino = rodada("treino", C.TREINO)
teste, a, t = rodada("teste", C.TESTE)
tabela = pd.concat({"Treino": treino, "Teste": teste}, axis=1)
tabela.to_csv(C.RESULTADOS / "metricas.csv")

if t >= 2:
    veredito = "confirmada"
elif a.mean() <= 0:
    veredito = "refutada"
else:
    veredito = "inconclusiva"
grade = pd.read_csv(C.RESULTADOS / "treino_grade.csv")
diarios = pd.read_csv(C.RESULTADOS / "treino_diario.csv", index_col=0,
                      parse_dates=True)
cdi_treino = completo["cdi"].reindex(diarios.index)
chave = f"{HEDGE}|{ENTRADA}"
dsr, sr0 = sharpe_deflacionado(diarios[chave] - cdi_treino, grade["Sharpe"])
resumo = {
    "variante": chave, "veredito": veredito,
    "t_excesso_mensal_teste": t, "t_excesso_mensal_treino": t_treino,
    "excesso_medio_mensal_teste": a.mean(),
    "ic95_excesso_mensal": [a.mean() - 1.96 * a.std() / np.sqrt(len(a)),
                            a.mean() + 1.96 * a.std() / np.sqrt(len(a))],
    "valor_p_bilateral": 2 * (1 - stats.t.cdf(abs(t), len(a) - 1)),
    "meses_teste": len(a),
    "sharpe_teste": teste.loc["Sharpe", "Estratégia"],
    "sharpe_treino": treino.loc["Sharpe", "Estratégia"],
    "sharpe_deflacionado_treino": dsr, "limiar_acaso_treino": sr0,
}
(C.RESULTADOS / "veredito.json").write_text(json.dumps(resumo, indent=1,
                                                       default=float))
pd.set_option("display.width", 200)
print(tabela.round(4).to_string())
print(json.dumps(resumo, indent=1, default=float))
