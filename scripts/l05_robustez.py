"""Robustez pré-registrada: diagnóstico depois da rodada de teste.

Cada linha é uma rodada a mais no teste, isto é, um sorteio a mais: o
conjunto diz de que o resultado depende, e nenhuma linha substitui o
veredito de scripts/l04_teste.py.
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
from pares.metricas import excesso_mensal, metricas, resumo_operacoes
from pares.motor import backtest
from pares.selecao import aprovados, escolher, sortear, tabela_semestres

escolha = json.loads((C.RESULTADOS / "escolha.json").read_text())
HEDGE, ENTRADA = escolha["hedge"], escolha["entrada"]
d = carregar()
sem_teste = tabela_semestres(*C.TESTE)
sem_treino = tabela_semestres(*C.TREINO)
saida = {}


def resumo(diario, ops=None):
    m = metricas(diario["ret"], d["cdi"])
    _, _, t = excesso_mensal(diario["ret"], d["cdi"])
    r = {"sharpe": m["Sharpe"], "excesso_aa": m["Excesso a.a. sobre o CDI"],
         "t": t, "dd": m["Drawdown máx."], "vol": m["Volatilidade a.a."]}
    if ops is not None:
        r["operacoes"] = len(ops)
    return r


def rodar(entrada=ENTRADA, hedge=HEDGE, semestres=sem_teste, periodo=C.TESTE,
          **kw):
    diario, ops = backtest(d, semestres, entrada, hedge, periodo, **kw)
    return resumo(diario, ops), diario, ops


# 1. grade das 15 variantes no teste, ao lado do treino
treino = pd.read_csv(C.RESULTADOS / "treino_grade.csv")
linhas = []
for hedge in C.GRADE_HEDGE:
    for entrada in C.GRADE_ENTRADA:
        r, diario, ops = rodar(entrada, hedge)
        o = resumo_operacoes(ops)
        t0 = treino[(treino.hedge == hedge) & (treino.entrada == entrada)].iloc[0]
        linhas.append({"hedge": hedge, "entrada": entrada,
                       "sharpe_treino": t0["Sharpe"], "sharpe_teste": r["sharpe"],
                       "t_treino": t0["t do excesso mensal"], "t_teste": r["t"],
                       "excesso_teste": r["excesso_aa"], "ops_treino": t0["Operações"],
                       "ops_teste": o["Operações"], "acerto_teste": o["Taxa de acerto"],
                       "exposicao_teste": diario["bruta"].mean(), "dd_teste": r["dd"]})
grade = pd.DataFrame(linhas)
grade.to_csv(C.RESULTADOS / "grade_treino_teste.csv", index=False)
rho = stats.spearmanr(grade.sharpe_treino, grade.sharpe_teste).statistic
saida["grade_correlacao_postos"] = rho
print(grade.round(3).to_string())
print(f"correlação de postos treino x teste: {rho:.2f}")

# 2. custos, aluguel, atraso e caixa
linhas = []
for custo in [0.0, 0.001, 0.002, 0.005]:
    linhas.append({"teste": f"custo {custo:.2%} por ponta", **rodar(custo=custo)[0]})
for aluguel in [0.0, 0.02, 0.04, 0.08]:
    linhas.append({"teste": f"aluguel {aluguel:.0%} a.a.", **rodar(aluguel=aluguel)[0]})
for atraso in [0, 1, 2]:
    linhas.append({"teste": f"atraso de {atraso} pregão(ões)", **rodar(atraso=atraso)[0]})
linhas.append({"teste": "caixa conservador", **rodar(cdi_vendido=False)[0]})
sens = pd.DataFrame(linhas)
sens.to_csv(C.RESULTADOS / "sensibilidade.csv", index=False)
print(sens.round(4).to_string())

# 3. retirada de um setor por vez
linhas = []
for setor in C.SETORES:
    def sem_setor(tab, s=setor):
        return escolher(aprovados(tab[tab["setor"] != s]))
    r, _, ops = rodar(escolha=sem_setor)
    linhas.append({"sem o setor": setor, **r})
setores = pd.DataFrame(linhas)
setores.to_csv(C.RESULTADOS / "sem_setor.csv", index=False)
print(setores.round(3).to_string())

# 4. contribuição por setor e por tipo de par, treino e teste
HOLDINGS = {frozenset(p) for p in [("ITSA4", "ITUB4"), ("ITSA4", "ITUB3"),
                                    ("BRAP4", "VALE3"), ("GOAU4", "GGBR4")]}


def tipo(y, x):
    if y[:4] == x[:4]:
        return "Mesma empresa (ON/PN/unit)"
    if frozenset((y, x)) in HOLDINGS:
        return "Holding e controlada"
    return "Concorrentes do setor"


partes = []
for nome in ["treino", "teste"]:
    ops = pd.read_csv(C.RESULTADOS / f"{nome}_operacoes.csv")
    ops["tipo"] = [tipo(y, x) for y, x in zip(ops.y, ops.x)]
    ops["periodo"] = nome
    partes.append(ops)
ops_todas = pd.concat(partes)
contrib = ops_todas.groupby(["periodo", "setor"]).agg(
    operacoes=("retorno", "size"), contribuicao=("contribuicao", "sum"),
    acerto=("retorno", lambda r: (r > 0).mean())).reset_index()
contrib.to_csv(C.RESULTADOS / "contribuicao_setor.csv", index=False)
por_tipo = ops_todas.groupby(["periodo", "tipo"]).agg(
    operacoes=("retorno", "size"), contribuicao=("contribuicao", "sum"),
    retorno_medio=("retorno", "mean")).reset_index()
por_tipo.to_csv(C.RESULTADOS / "contribuicao_tipo.csv", index=False)
print(contrib.round(4).to_string())
print(por_tipo.round(4).to_string())

# 5. resultado por ano civil (treino e teste), contra o CDI e o BOVA11
partes = []
for nome in ["treino", "teste"]:
    r = pd.read_csv(C.RESULTADOS / f"{nome}_retornos.csv", index_col=0,
                    parse_dates=True)
    partes.append(r)
r = pd.concat(partes)
ano = (1 + r).groupby(r.index.year).prod() - 1
ano["excesso"] = (1 + ano["estrategia"]) / (1 + ano["cdi"]) - 1
ano.to_csv(C.RESULTADOS / "por_ano.csv")
print(ano.round(4).to_string())
_, _, t_sem_2020 = excesso_mensal(r.loc["2021":, "estrategia"], d["cdi"])
_, _, t_ate_2025 = excesso_mensal(r.loc["2020":"2025", "estrategia"], d["cdi"])
saida["t_teste_sem_2020"] = t_sem_2020
saida["t_teste_2020_a_2025"] = t_ate_2025
saida["excesso_teste_2026"] = ano.loc[2026, "excesso"]
print(f"t do excesso mensal no teste sem 2020: {t_sem_2020:.2f}; "
      f"de 2020 a 2025 (sem 2026): {t_ate_2025:.2f}")

# 6. pares sorteados: a seleção por cointegração acrescenta algo?
rng = np.random.default_rng(C.SEMENTE)
sorteios = []
for i in range(200):
    def acaso(tab):
        return sortear(tab, rng)
    r, _, _ = rodar(escolha=acaso)
    sorteios.append(r)
sorteios = pd.DataFrame(sorteios)
sorteios.to_csv(C.RESULTADOS / "sorteios.csv", index=False)
sharpe_teste = json.loads((C.RESULTADOS / "veredito.json").read_text())["sharpe_teste"]
pct = (sorteios["sharpe"] < sharpe_teste).mean()
saida.update({"sorteios_percentil_estrategia": pct,
              "sorteios_sharpe_mediano": sorteios["sharpe"].median(),
              "sorteios_p90": sorteios["sharpe"].quantile(0.9),
              "selecao_acrescenta_valor": bool(pct > 0.9)})
print(f"sorteios: Sharpe mediano {sorteios['sharpe'].median():.2f}, "
      f"p90 {sorteios['sharpe'].quantile(0.9):.2f}; estratégia no percentil {pct:.0%}")
(C.RESULTADOS / "robustez.json").write_text(json.dumps(saida, indent=1,
                                                       default=float))
