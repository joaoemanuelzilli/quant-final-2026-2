"""Leitura dos dados congelados em dados/bruto/ e das correções em dados/."""
from functools import lru_cache

import pandas as pd

from .config import ACOES, BRUTO, DADOS, SETORES


def _ler(arq):
    return pd.read_csv(BRUTO / arq, index_col=0, parse_dates=True)


def corrigir(px):
    """Aplica dados/correcoes.csv: eventos que o Yahoo não ajusta.

    Cada linha multiplica os preços anteriores à data por um fator, de modo
    que o retorno do dia passe a ser o correto (cisões) ou a mediana do
    setor (saltos artificiais sem evento econômico).
    """
    px = px.copy()
    ret = px.pct_change(fill_method=None)
    for c in pd.read_csv(DADOS / "correcoes.csv").itertuples():
        data = pd.Timestamp(c.data)
        if c.metodo == "fator":
            k = c.fator
        else:
            pares = next(g for g in SETORES.values() if c.acao in g)
            mediana = ret.loc[data, [a for a in pares if a != c.acao]].median()
            k = (1 + ret.at[data, c.acao]) / (1 + mediana)
        px.loc[px.index < data, c.acao] *= k
    return px


def preco_nominal(fech):
    """Preço que aparecia na tela em cada data (desfaz desdobramentos futuros)."""
    eventos = pd.read_csv(BRUTO / "yahoo_desdobramentos.csv",
                          parse_dates=["data"])
    nominal = fech.copy()
    for e in eventos.itertuples():
        if e.acao in nominal:
            nominal.loc[nominal.index < e.data, e.acao] *= e.fator
    return nominal


@lru_cache(maxsize=1)
def carregar():
    """Preços ajustados, fechamentos, volume financeiro e CDI por pregão.

    Devolve um dicionário com
    - px: fechamento ajustado por proventos e corrigido (base dos retornos);
    - nominal: fechamento na moeda da época, sem ajuste algum (filtro de preço);
    - volfin: volume financeiro diário em R$ (fechamento x quantidade);
    - ret: retorno simples diário dos preços ajustados;
    - cdi: CDI acumulado de um pregão ao seguinte, em fração.
    """
    px = corrigir(_ler("yahoo_fechamento_ajustado.csv"))
    fech = _ler("yahoo_fechamento.csv")
    vol = _ler("yahoo_volume.csv")
    # pregões: dias em que a maior parte do universo tem preço
    pregao = px[ACOES].notna().mean(axis=1) >= 0.5
    px, fech, vol = px[pregao], fech[pregao], vol[pregao]
    # o volume financeiro não depende de desdobramentos (preço x quantidade)
    volfin = (fech * vol).fillna(0.0)
    nominal = preco_nominal(fech)
    # buracos curtos (até 5 pregões) repetem o último preço; antes da
    # estreia de um papel o preço continua ausente
    px = px.ffill(limit=5)
    nominal = nominal.ffill(limit=5)
    # CDI: a taxa datada do dia d rende de d a d+1; há dias úteis sem
    # pregão, então o fator é acumulado e lido nos pregões
    taxa = _ler("cdi.csv")["cdi"]
    fator = (1 + taxa).cumprod().shift(1, fill_value=1.0)
    cdi = fator.reindex(fator.index.union(px.index)).ffill()
    cdi = cdi.reindex(px.index).pct_change().fillna(0.0)
    ret = px.pct_change(fill_method=None)
    return {"px": px, "nominal": nominal, "volfin": volfin, "ret": ret,
            "cdi": cdi}


def semestres(indice, inicio, fim):
    """Lista de (rótulo, primeiro pregão, último pregão) dos semestres."""
    datas = indice[(indice >= inicio) & (indice <= fim)]
    rotulo = datas.year.astype(str) + "S" + ((datas.month > 6) + 1).astype(str)
    grupos = pd.Series(datas, index=datas).groupby(rotulo.to_numpy())
    return [(r, g.iloc[0], g.iloc[-1]) for r, g in grupos]

