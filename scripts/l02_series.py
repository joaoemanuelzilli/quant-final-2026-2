"""Séries temporais dos pares (Caps. 3, 4 e 8 do livro).

1. Par-exemplo do treino (GGBR4 e GOAU4, holding e controlada, formação do
   1º semestre de 2015): ADF e KPSS dos log-preços e do spread, meia-vida.
2. Quantos pares cointegrados na formação continuam com spread
   estacionário no semestre seguinte (com o beta da formação).
3. Múltiplos testes: aprovados por semestre contra os falsos positivos
   esperados a 5%.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar
from pares.motor import selecao_padrao, zscore_par
from pares.series import adf_kpss, meia_vida, mqo
from pares.selecao import tabela_semestres

d = carregar()
saida = {}

# 1. par-exemplo
semestres = {s[0]: s for s in tabela_semestres(*C.TREINO)}
rotulo, primeiro, ultimo, tab = semestres["2015S1"]
par = tab[(tab.y == "GGBR4") & (tab.x == "GOAU4")].iloc[0]
ini, fim = tab.attrs["inicio_formacao"], tab.attrs["fim_formacao"]
logp = np.log(d["px"].loc[ini:fim, [par.y, par.x]])
spread = logp[par.y] - par.beta * logp[par.x] - par.alfa
testes = {"ln GGBR4": adf_kpss(logp[par.y]), "ln GOAU4": adf_kpss(logp[par.x]),
          "Spread": adf_kpss(spread),
          "Retorno de GGBR4": adf_kpss(logp[par.y].diff().dropna())}
saida["exemplo"] = {"par": f"{par.y}/{par.x}", "semestre": rotulo,
                    "formacao": [str(ini.date()), str(fim.date())],
                    "beta": par.beta, "alfa": par.alfa, "p_engle_granger": par.p,
                    "meia_vida": par.meia_vida, "desvio_spread": par.desvio,
                    "testes": testes}
print(pd.DataFrame(testes).T.round(3).to_string())
print(f"Engle-Granger p = {par.p:.4f}, beta = {par.beta:.3f}, "
      f"meia-vida = {par.meia_vida:.1f} pregões")
serie = pd.DataFrame({"ln_y": logp[par.y], "ln_x": logp[par.x], "spread": spread})
serie.to_csv(C.RESULTADOS / "exemplo_formacao.csv")
escolha = json.loads((C.RESULTADOS / "escolha.json").read_text())
z, beta = zscore_par(d, par, primeiro, ultimo, escolha["hedge"], ini)
ops = pd.read_csv(C.RESULTADOS / "treino_operacoes.csv", parse_dates=["entrada", "saida"])
ops = ops[(ops.semestre == rotulo) & (ops.y == par.y) & (ops.x == par.x)]
pd.DataFrame({"z": z, "beta": beta}).to_csv(C.RESULTADOS / "exemplo_negociacao.csv")
ops.to_csv(C.RESULTADOS / "exemplo_operacoes.csv", index=False)

# 2. a cointegração persiste fora da amostra?
linhas = []
for periodo, intervalo in [("treino", C.TREINO), ("teste", C.TESTE)]:
    for rot, p0, p1, tb in tabela_semestres(*intervalo):
        for pr in selecao_padrao(tb).itertuples():
            lp = np.log(d["px"].loc[p0:p1, [pr.y, pr.x]]).dropna()
            s = lp[pr.y] - pr.beta * lp[pr.x] - pr.alfa
            # beta reestimado no próprio semestre: o par continua ligado?
            b2, _, res2 = mqo(lp[pr.y].to_numpy(), lp[pr.x].to_numpy())
            linhas.append({"periodo": periodo, "semestre": rot, "setor": pr.setor,
                           "par": f"{pr.y}/{pr.x}", "p_formacao": pr.p,
                           "meia_vida_formacao": pr.meia_vida,
                           "adf_p_beta_formacao": adf_kpss(s)["adf_p"],
                           "deriva_media_z": abs(s.mean()) / pr.desvio,
                           "meia_vida_semestre": meia_vida(s.to_numpy()),
                           "beta_formacao": pr.beta, "beta_semestre": b2})
persist = pd.DataFrame(linhas)
persist.to_csv(C.RESULTADOS / "persistencia.csv", index=False)
resumo = persist.groupby("periodo").agg(
    pares=("par", "size"),
    estacionario_5pct=("adf_p_beta_formacao", lambda p: (p < 0.05).mean()),
    deriva_mediana_z=("deriva_media_z", "median"),
    meia_vida_formacao_mediana=("meia_vida_formacao", "median"))
print(resumo.round(3).to_string())
saida["persistencia"] = resumo.to_dict(orient="index")

# 3. múltiplos testes
linhas = []
for periodo, intervalo in [("treino", C.TREINO), ("teste", C.TESTE)]:
    for rot, _, _, tb in tabela_semestres(*intervalo):
        linhas.append({"periodo": periodo, "semestre": rot,
                       "elegiveis": len(tb.attrs["elegiveis"]),
                       "candidatos": len(tb),
                       "p_menor_5pct": int((tb.p < 0.05).sum()),
                       "falsos_esperados": 0.05 * len(tb),
                       "escolhidos": len(selecao_padrao(tb))})
mult = pd.DataFrame(linhas)
mult.to_csv(C.RESULTADOS / "multiplos_testes.csv", index=False)
print(mult.to_string())
tot = mult.groupby("periodo")[["candidatos", "p_menor_5pct", "falsos_esperados",
                               "escolhidos"]].sum()
saida["multiplos_testes"] = tot.to_dict(orient="index")
print(tot.to_string())
(C.RESULTADOS / "series.json").write_text(json.dumps(saida, indent=1,
                                                     default=float))
