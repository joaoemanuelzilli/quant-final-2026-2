"""Conferência dos dados (Cap. 2): faltantes, retornos extremos e fonte.

Compara o Yahoo Finance com os fechamentos oficiais da B3 ajustados pelo
livro do Núcleo, nas ações que as duas bases têm em comum (2010 a 2025).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C
from pares.dados import carregar

d = carregar()
px, ret = d["px"], d["ret"]
print(f"pregões: {len(px)} ({px.index[0].date()} a {px.index[-1].date()})")
print(f"ações no universo: {len(C.ACOES)} em {len(C.SETORES)} setores")

# faltantes depois da estreia de cada papel
estreia = px[C.ACOES].apply(lambda s: s.first_valid_index())
buracos = {a: int(px.loc[estreia[a]:, a].isna().sum()) for a in C.ACOES}
print("pregões sem preço depois da estreia (top 5):",
      sorted(buracos.items(), key=lambda kv: -kv[1])[:5])

# retornos diários extremos
extremos = (ret[C.ACOES].abs() > 0.25).sum().sort_values(ascending=False)
print("dias com |retorno| > 25%:", int(extremos.sum()),
      dict(extremos[extremos > 0].head(8)))

# conferência contra a B3 (livro)
b3 = pd.read_csv(C.BRUTO / "livro_b3_precos_ajustados.csv", index_col=0,
                 parse_dates=True)
comuns = [c.replace(".SA", "") for c in b3.columns
          if c.endswith(".SA") and c.replace(".SA", "") in px.columns]
linhas = []
for a in comuns:
    r1 = np.log(px[a]).diff()
    r2 = np.log(b3[f"{a}.SA"]).diff()
    j = pd.concat([r1, r2], axis=1, join="inner").dropna()
    dif = (j.iloc[:, 0] - j.iloc[:, 1]).abs()
    acum = np.exp(j.sum()).to_numpy()
    linhas.append({"acao": a, "pregoes": len(j),
                   "correlacao": j.corr().iloc[0, 1],
                   "dias_dif_maior_1pct": int((dif > 0.01).sum()),
                   "dif_media_pb": dif.mean() * 1e4,
                   "acum_yahoo": acum[0] - 1, "acum_b3": acum[1] - 1})
conf = pd.DataFrame(linhas).set_index("acao")
print(conf.round(4).to_string())
C.RESULTADOS.mkdir(exist_ok=True)
conf.to_csv(C.RESULTADOS / "conferencia_fonte.csv")
resumo = {
    "pregoes": len(px), "inicio": str(px.index[0].date()),
    "fim": str(px.index[-1].date()), "acoes": len(C.ACOES),
    "setores": len(C.SETORES), "extremos_25pct": int(extremos.sum()),
    "conferencia_correlacao_min": float(conf["correlacao"].min()),
    "conferencia_dif_media_pb": float(conf["dif_media_pb"].mean()),
    "conferencia_acoes": comuns,
    "cdi_fontes": pd.read_csv(C.BRUTO / "cdi.csv")["fonte"].value_counts().to_dict(),
}
(C.RESULTADOS / "dados.json").write_text(json.dumps(resumo, indent=1,
                                                    ensure_ascii=False))
