"""Leitura dos dados congelados em dados/bruto/."""
from functools import lru_cache

import pandas as pd

from .config import ACOES, BRUTO


def _ler(arq):
    return pd.read_csv(BRUTO / arq, index_col=0, parse_dates=True)


@lru_cache(maxsize=1)
def carregar():
    """Preços ajustados, fechamentos, volume financeiro e CDI por pregão.

    Devolve um dicionário com
    - px: fechamento ajustado por proventos (base dos retornos);
    - fech: fechamento sem ajuste por proventos (filtro de preço mínimo);
    - volfin: volume financeiro diário em R$ (fechamento x quantidade);
    - ret: retorno simples diário dos preços ajustados;
    - cdi: CDI acumulado de um pregão ao seguinte, em fração.
    """
    px = _ler("yahoo_fechamento_ajustado.csv")
    fech = _ler("yahoo_fechamento.csv")
    vol = _ler("yahoo_volume.csv")
    # pregões: dias em que a maior parte do universo tem preço
    pregao = px[ACOES].notna().mean(axis=1) >= 0.5
    px, fech, vol = px[pregao], fech[pregao], vol[pregao]
    # buracos curtos (até 5 pregões) repetem o último preço; antes da
    # estreia de um papel o preço continua ausente
    px = px.ffill(limit=5)
    fech = fech.ffill(limit=5)
    volfin = (fech * vol).fillna(0.0)
    # CDI: a taxa datada do dia d rende de d a d+1; há dias úteis sem
    # pregão, então o fator é acumulado e lido nos pregões
    taxa = _ler("cdi.csv")["cdi"]
    fator = (1 + taxa).cumprod().shift(1, fill_value=1.0)
    cdi = fator.reindex(fator.index.union(px.index)).ffill()
    cdi = cdi.reindex(px.index).pct_change().fillna(0.0)
    ret = px.pct_change(fill_method=None)
    return {"px": px, "fech": fech, "volfin": volfin, "ret": ret, "cdi": cdi}


def semestres(indice, inicio, fim):
    """Lista de (rótulo, primeiro pregão, último pregão) dos semestres."""
    datas = indice[(indice >= inicio) & (indice <= fim)]
    rotulo = datas.year.astype(str) + "S" + ((datas.month > 6) + 1).astype(str)
    grupos = pd.Series(datas, index=datas).groupby(rotulo.to_numpy())
    return [(r, g.iloc[0], g.iloc[-1]) for r, g in grupos]
