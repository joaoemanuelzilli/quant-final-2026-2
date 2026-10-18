"""Formação: filtros de liquidez, Engle-Granger e escolha dos pares.

A cada semestre, a formação usa só os 252 pregões anteriores ao primeiro
pregão do semestre. Nada aqui enxerga preços do período de negociação.
"""
import itertools
import json

import numpy as np
import pandas as pd

from . import config as C
from .dados import carregar, semestres
from .series import engle_granger


def elegiveis(d, janela):
    """Ações que passam nos filtros de cobertura, liquidez e preço."""
    px = d["px"].loc[janela, C.ACOES]
    cobertura = px.notna().mean()
    volume = d["volfin"].loc[janela, C.ACOES].median()
    preco = d["nominal"].loc[janela[-1], C.ACOES]
    ok = ((cobertura >= C.COBERTURA_MINIMA) & (volume >= C.VOLUME_MINIMO)
          & (preco >= C.PRECO_MINIMO))
    return list(ok[ok].index)


def estatisticas_formacao(d, primeiro_pregao):
    """Engle-Granger de todos os pares do mesmo setor elegíveis."""
    idx = d["px"].index
    fim = idx.get_loc(primeiro_pregao)            # posição do 1º pregão
    janela = idx[fim - C.JANELA_FORMACAO:fim]     # 252 pregões anteriores
    ok = set(elegiveis(d, janela))
    logp = np.log(d["px"].loc[janela])
    linhas = []
    for setor, grupo in C.SETORES.items():
        for a, b in itertools.combinations([t for t in grupo if t in ok], 2):
            par = logp[[a, b]].dropna()
            if len(par) < C.COBERTURA_MINIMA * C.JANELA_FORMACAO:
                continue
            eg = engle_granger(par[a].to_numpy(), par[b].to_numpy())
            y, x = (b, a) if eg.pop("inverteu") else (a, b)
            linhas.append({"setor": setor, "y": y, "x": x, **eg})
    tab = pd.DataFrame(linhas)
    tab.attrs.update(inicio_formacao=janela[0], fim_formacao=janela[-1],
                     elegiveis=sorted(ok))
    return tab


def _gravar_cache(tab, arq):
    attrs = {k: (v if isinstance(v, list) else str(v.date()))
             for k, v in tab.attrs.items()}
    arq.write_text(json.dumps({"attrs": attrs,
                               "tabela": tab.to_dict(orient="list")}))


def _ler_cache(arq):
    bruto = json.loads(arq.read_text())
    tab = pd.DataFrame(bruto["tabela"])
    tab.attrs = {k: (v if isinstance(v, list) else pd.Timestamp(v))
                 for k, v in bruto["attrs"].items()}
    return tab


def tabela_semestres(inicio, fim):
    """Estatísticas de formação de todos os semestres, com cache em disco."""
    d = carregar()
    C.CACHE.mkdir(parents=True, exist_ok=True)
    saida = []
    for rotulo, primeiro, ultimo in semestres(d["px"].index, inicio, fim):
        arq = C.CACHE / f"formacao_{rotulo}.json"
        if arq.exists():
            tab = _ler_cache(arq)
        else:
            tab = estatisticas_formacao(d, primeiro)
            _gravar_cache(tab, arq)
        saida.append((rotulo, primeiro, ultimo, tab))
    return saida


def aprovados(tab):
    """Pares que passam nos critérios estatísticos pré-registrados."""
    lo, hi = C.MEIA_VIDA
    m = ((tab["p"] < C.PVALOR_MAXIMO) & (tab["beta"] > 0)
         & tab["meia_vida"].between(lo, hi))
    return tab[m].sort_values(["p", "meia_vida"])


def escolher(candidatos, n=C.N_PARES, por_acao=C.MAX_PARES_POR_ACAO,
             por_setor=C.MAX_PARES_POR_SETOR):
    """Percorre os candidatos em ordem e respeita os limites de concentração."""
    usados, setores, escolhidos = {}, {}, []
    for _, linha in candidatos.iterrows():
        if len(escolhidos) == n:
            break
        if (usados.get(linha.y, 0) >= por_acao
                or usados.get(linha.x, 0) >= por_acao
                or setores.get(linha.setor, 0) >= por_setor):
            continue
        escolhidos.append(linha)
        for a in (linha.y, linha.x):
            usados[a] = usados.get(a, 0) + 1
        setores[linha.setor] = setores.get(linha.setor, 0) + 1
    return pd.DataFrame(escolhidos).reset_index(drop=True)


def sortear(tab, rng, n=C.N_PARES):
    """Pares sorteados entre os elegíveis do mesmo setor (benchmark de acaso)."""
    candidatos = tab[tab["beta"] > 0].sample(frac=1.0, random_state=rng)
    return escolher(candidatos, n=n)
