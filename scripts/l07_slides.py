"""Exporta para slides/dados.json todos os números e séries da apresentação.

O deck (slides/build_deck.js) não calcula nada: lê este arquivo. Assim,
todo número dos slides sai de um script deste repositório.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar

R = C.RESULTADOS
ler_json = lambda n: json.loads((R / n).read_text())
d = carregar()


def semanal(df, passo=5):
    """Uma observação a cada `passo` pregões, sempre com a última."""
    idx = list(range(0, len(df), passo))
    if idx[-1] != len(df) - 1:
        idx.append(len(df) - 1)
    return df.iloc[idx]


def serie(df):
    return {"datas": [x.strftime("%Y-%m-%d") for x in df.index],
            **{c: [None if pd.isna(v) else round(float(v), 6) for v in df[c]]
               for c in df.columns}}


saida = {"dados": ler_json("dados.json"), "escolha": ler_json("escolha.json"),
         "veredito": ler_json("veredito.json"), "robustez": ler_json("robustez.json"),
         "risco": ler_json("risco.json"), "series_tempo": ler_json("series.json")}

# trilha de auditoria: commits do repositório
log = subprocess.run(["git", "log", "--reverse", "--format=%h|%ad|%s",
                      "--date=format:%d/%m/%Y %H:%M"], capture_output=True,
                     text=True, cwd=C.RAIZ).stdout.strip().splitlines()
saida["commits"] = [dict(zip(["hash", "data", "titulo"], l.split("|", 2))) for l in log]

# métricas obrigatórias
m = pd.read_csv(R / "metricas.csv", header=[0, 1], index_col=0)
saida["metricas"] = {f"{p}|{c}": {k: (None if pd.isna(v) else float(v))
                                  for k, v in m[(p, c)].items()}
                     for p, c in m.columns}

# curvas: R$ 1 no teste e no treino, excesso acumulado, drawdown
for nome in ["treino", "teste"]:
    r = pd.read_csv(R / f"{nome}_retornos.csv", index_col=0, parse_dates=True)
    cota = (1 + r[["estrategia", "cdi", "bova11"]]).cumprod()
    saida[f"cota_{nome}"] = serie(semanal(cota))
    dd = pd.read_csv(R / f"{nome}_drawdown.csv", index_col=0, parse_dates=True)
    saida[f"drawdown_{nome}"] = serie(semanal(dd))
r = pd.concat([pd.read_csv(R / f"{n}_retornos.csv", index_col=0, parse_dates=True)
               for n in ["treino", "teste"]])
exc = ((1 + r["estrategia"]).cumprod() / (1 + r["cdi"]).cumprod() - 1).to_frame("excesso")
saida["excesso_acumulado"] = serie(semanal(exc))
saida["inicio_teste"] = C.TESTE[0]

# grade, sensibilidade, setores, ano, sorteios, contribuições
saida["grade"] = pd.read_csv(R / "grade_treino_teste.csv").to_dict(orient="records")
saida["sensibilidade"] = pd.read_csv(R / "sensibilidade.csv").to_dict(orient="records")
saida["sem_setor"] = pd.read_csv(R / "sem_setor.csv").to_dict(orient="records")
ano = pd.read_csv(R / "por_ano.csv", index_col=0)
saida["por_ano"] = {"anos": [str(a) for a in ano.index],
                    **{c: ano[c].round(5).tolist() for c in ano.columns}}
sorteios = pd.read_csv(R / "sorteios.csv")["sharpe"]
bordas = np.arange(-1.6, 0.81, 0.1)
cont, _ = np.histogram(sorteios.clip(bordas[0], bordas[-1] - 1e-9), bins=bordas)
saida["sorteios"] = {"centros": [round(b + 0.05, 2) for b in bordas[:-1]],
                     "contagem": cont.tolist(), "n": len(sorteios),
                     "mediana": float(sorteios.median()),
                     "p90": float(sorteios.quantile(0.9))}
saida["contribuicao_tipo"] = pd.read_csv(R / "contribuicao_tipo.csv").to_dict(orient="records")
saida["contribuicao_setor"] = pd.read_csv(R / "contribuicao_setor.csv").to_dict(orient="records")

# risco
saida["var_cvar"] = pd.read_csv(R / "var_cvar.csv").to_dict(orient="records")
saida["estresse"] = pd.read_csv(R / "estresse.csv").to_dict(orient="records")
g = pd.read_csv(R / "garch_exposicao.csv", index_col=0, parse_dates=True)
g = g.loc[C.TREINO[0]:]
mensal = g.groupby(g.index.to_period("M")).agg(vol=("vol_ibov_aa", "mean"),
                                                pares=("pares_abertos", "mean"))
saida["garch_mensal"] = {"meses": [str(p) for p in mensal.index],
                         "vol": mensal["vol"].round(4).tolist(),
                         "pares": mensal["pares"].round(3).tolist()}

# séries temporais: par-exemplo
f = pd.read_csv(R / "exemplo_formacao.csv", index_col=0, parse_dates=True)
f[["ln_y", "ln_x"]] = f[["ln_y", "ln_x"]] - f[["ln_y", "ln_x"]].iloc[0]
saida["exemplo_formacao"] = serie(f)
# o mesmo par no semestre de negociação, com a variante escolhida no treino
from pares.motor import zscore_par
from pares.selecao import tabela_semestres
rot, primeiro, ultimo, tab = {x[0]: x for x in tabela_semestres(*C.TREINO)}["2015S1"]
par = tab[(tab.y == "GGBR4") & (tab.x == "GOAU4")].iloc[0]
z, beta = zscore_par(d, par, primeiro, ultimo, saida["escolha"]["hedge"],
                     tab.attrs["inicio_formacao"])
saida["exemplo_z"] = serie(pd.DataFrame({"z": z, "beta": beta}))
ops = pd.read_csv(R / "treino_operacoes.csv")
ops = ops[(ops.semestre == rot) & (ops.y == par.y) & (ops.x == par.x)]
saida["exemplo_operacoes"] = ops.to_dict(orient="records")
saida["multiplos"] = pd.read_csv(R / "multiplos_testes.csv").to_dict(orient="records")

# operações do teste e correções de dados
ops = pd.read_csv(R / "teste_operacoes.csv")
saida["operacoes_teste"] = ops.sort_values("contribuicao", ascending=False).to_dict(orient="records")
saida["correcoes"] = pd.read_csv(C.DADOS / "correcoes.csv")[["acao", "data", "descricao"]].to_dict(orient="records")
saida["universo"] = {s: g for s, g in C.SETORES.items()}
saida["conferencia"] = pd.read_csv(R / "conferencia_fonte.csv").to_dict(orient="records")
saida["parametros"] = {"volume_minimo": C.VOLUME_MINIMO, "preco_minimo": C.PRECO_MINIMO,
                       "meia_vida": list(C.MEIA_VIDA), "n_pares": C.N_PARES,
                       "max_por_acao": C.MAX_PARES_POR_ACAO, "max_por_setor": C.MAX_PARES_POR_SETOR,
                       "stop_extra": C.STOP_EXTRA, "custo": C.CUSTO, "aluguel": C.ALUGUEL,
                       "bruto_por_par": C.BRUTO_POR_PAR, "janela_formacao": C.JANELA_FORMACAO,
                       "n_variantes": len(C.GRADE_ENTRADA) * len(C.GRADE_HEDGE),
                       "n_original": len(C.GRADE_ENTRADA) * len(C.GRADE_HEDGE_ORIGINAL)}

destino = C.RAIZ / "slides" / "dados.json"
destino.write_text(json.dumps(saida, ensure_ascii=False, default=float, indent=0))
print("gravado:", destino.relative_to(C.RAIZ), f"({destino.stat().st_size / 1e3:.0f} kB)")
