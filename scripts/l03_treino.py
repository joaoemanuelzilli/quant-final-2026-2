"""Grade de 15 variantes no treino (jul/2011 a dez/2019) e escolha.

Critério pré-registrado: maior Sharpe líquido no treino entre as 15 (as 9
da ficha original e as 6 da emenda). Este script não
lê nenhum preço posterior a 31/12/2019: os semestres de 2020 em diante nem
são formados.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar
from pares.metricas import excesso_mensal, maximo_esperado, metricas, resumo_operacoes
from pares.motor import backtest
from pares.selecao import tabela_semestres

d = carregar()
# corta os dados no fim do treino: nada do teste entra nesta rodada
d = {k: v.loc[:C.TREINO[1]] for k, v in d.items()}
semestres = tabela_semestres(*C.TREINO)
anos = len(d["ret"].loc[C.TREINO[0]:]) / 252

linhas, diarios = [], {}
for hedge in C.GRADE_HEDGE:
    for entrada in C.GRADE_ENTRADA:
        diario, ops = backtest(d, semestres, entrada, hedge, C.TREINO)
        m = metricas(diario["ret"], d["cdi"])
        _, ri, t = excesso_mensal(diario["ret"], d["cdi"])
        o = resumo_operacoes(ops)
        linhas.append({"hedge": hedge, "entrada": entrada, **m.to_dict(),
                       "t do excesso mensal": t, "Giro anual": diario["giro"].sum() / anos,
                       "Exposição bruta média": diario["bruta"].mean(),
                       **o.to_dict()})
        diarios[f"{hedge}|{entrada}"] = diario["ret"]
        print(f"{hedge:12s} z={entrada:.1f}  Sharpe {m['Sharpe']:5.2f}  "
              f"excesso {m['Excesso a.a. sobre o CDI']:6.2%}  t {t:5.2f}  "
              f"ops {int(o['Operações']):4d}  acerto {o['Taxa de acerto']:.0%}")

grade = pd.DataFrame(linhas)
grade.to_csv(C.RESULTADOS / "treino_grade.csv", index=False)
pd.DataFrame(diarios).to_csv(C.RESULTADOS / "treino_diario.csv")

melhor = grade.loc[grade["Sharpe"].idxmax()]
desvio = grade["Sharpe"].std(ddof=1)
esperado = maximo_esperado(len(grade), 1 / np.sqrt(anos))
escolha = {"hedge": melhor["hedge"], "entrada": float(melhor["entrada"]),
           "sharpe_treino": float(melhor["Sharpe"]),
           "sharpe_mediano_grade": float(grade["Sharpe"].median()),
           "desvio_sharpe_grade": float(desvio),
           "n_variantes": len(grade),
           "maximo_esperado_sem_habilidade": float(esperado),
           "anos_treino": anos}
(C.RESULTADOS / "escolha.json").write_text(json.dumps(escolha, indent=1))
print("\nSharpe líquido no treino")
print(grade.pivot(index="entrada", columns="hedge", values="Sharpe")
      [C.GRADE_HEDGE].round(2).to_string())
print(f"\nescolha: hedge = {escolha['hedge']}, z de entrada = {escolha['entrada']}")
print(f"melhor de {len(grade)} tentativas sem habilidade, com {anos:.1f} anos: "
      f"{esperado:.2f} em média")
