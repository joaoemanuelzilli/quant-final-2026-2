"""Simulador da carteira de pares: sinal, execução com atraso, custos e CDI.

Convenções (Caps. 7, 8, 11 e 12 do livro do Núcleo):
- o z-score do pregão t usa preços até t; a ordem sai no fechamento de
  t + atraso e a posição rende a partir do pregão seguinte;
- custo por ponta sobre o valor negociado; aluguel anual sobre o valor da
  ponta vendida, cobrado por pregão;
- o caixa, que inclui o produto da venda a descoberto, rende o CDI;
- preços ajustados por proventos, de modo que a ponta vendida paga os
  dividendos ao doador.
"""
import json

import numpy as np
import pandas as pd

from . import config as C
from .kalman import estimar, filtrar
from .selecao import aprovados, escolher


def zscore_par(d, par, primeiro, ultimo, hedge, inicio_formacao):
    """z-score e hedge ratio de um par nos pregões do semestre.

    Formas de hedge (todas usam só dados até cada pregão):
    - "mqo": beta, alfa e desvio da formação, fixos no semestre;
    - "mqo_movel": beta e alfa da formação; z com média e desvio móveis
      de JANELA_Z pregões do próprio spread;
    - "kalman_<delta>": filtro de Kalman com delta fixo e Ve igual à
      variância do resíduo da formação;
    - "kalman_mv": delta e Ve estimados por máxima verossimilhança na
      formação (pregões anteriores ao semestre).
    No Kalman, o filtro roda desde o início da formação, partindo do MQO, e
    o z-score de t é o erro de previsão de t sobre o desvio previsto.
    """
    px = d["px"]
    dias = px.loc[primeiro:ultimo].index
    if hedge == "mqo":
        ly, lx = np.log(px.loc[dias, par.y]), np.log(px.loc[dias, par.x])
        z = (ly - par.beta * lx - par.alfa) / par.desvio
        return z, pd.Series(par.beta, dias)
    trecho = np.log(px.loc[inicio_formacao:ultimo, [par.y, par.x]]).dropna()
    if hedge == "mqo_movel":
        s = trecho[par.y] - par.beta * trecho[par.x] - par.alfa
        z = (s - s.rolling(C.JANELA_Z).mean()) / s.rolling(C.JANELA_Z).std()
        return z.reindex(dias), pd.Series(par.beta, dias)
    if hedge == "kalman_mv":
        form = trecho[trecho.index < primeiro]
        delta, ve = parametros_mv(form, par)
    else:
        delta, ve = float(hedge.split("_")[1]), par.desvio ** 2
    beta_prev, _, erro, desvio = filtrar(trecho[par.y], trecho[par.x], delta,
                                         ve, par.beta, par.alfa)
    z = pd.Series(erro / desvio, trecho.index).reindex(dias)
    # o beta disponível no fechamento de t é a previsão feita para t+1
    beta = pd.Series(np.r_[beta_prev[1:], beta_prev[-1]], trecho.index)
    return z, beta.reindex(dias)


_CACHE_MV = {}


def parametros_mv(form, par):
    """delta e Ve do par estimados na formação, com cache em disco."""
    arq = C.CACHE / "kalman_mv.json"
    if not _CACHE_MV and arq.exists():
        _CACHE_MV.update(json.loads(arq.read_text()))
    chave = f"{par.y}|{par.x}|{form.index[0].date()}|{form.index[-1].date()}"
    if chave not in _CACHE_MV:
        _CACHE_MV[chave] = estimar(form[par.y].to_numpy(), form[par.x].to_numpy(),
                                   par.beta, par.alfa, par.desvio ** 2)
        C.CACHE.mkdir(parents=True, exist_ok=True)
        arq.write_text(json.dumps(_CACHE_MV))
    return tuple(_CACHE_MV[chave])


def operacoes_par(z, beta, entrada, atraso, saida=C.SAIDA_Z,
                  stop_extra=C.STOP_EXTRA):
    """Máquina de estados do par: devolve as operações do semestre.

    Cada operação é (i_entrada, i_saida, direção, beta, motivo), com os
    índices dos pregões de execução. Direção +1 compra o spread (compra Y,
    vende X); -1 vende o spread.
    """
    n = len(z)
    estado, bloqueado, ordens = 0, False, []
    for i, zi in enumerate(z.to_numpy()):
        if np.isnan(zi):
            continue
        if estado == 0:
            if bloqueado:
                continue
            if zi <= -entrada:
                estado = +1
            elif zi >= entrada:
                estado = -1
            else:
                continue
            ordens.append((i + atraso, "abre", estado, beta.iloc[i]))
            continue
        stop = (estado * zi) <= -(entrada + stop_extra)
        volta = (estado * zi) >= -saida
        if stop or volta:
            ordens.append((i + atraso, "stop" if stop else "reversão", 0, None))
            estado, bloqueado = 0, stop
    ops, aberta = [], None
    for j, tipo, direcao, b in ordens:
        if tipo == "abre":
            if j < n - 1:                 # não abre no último pregão
                aberta = (j, direcao, b)
            continue
        if aberta is None:
            continue
        if j > n - 1:                     # a ordem cairia depois do semestre
            break
        ops.append((aberta[0], j, aberta[1], aberta[2], tipo))
        aberta = None
    if aberta is not None:
        ops.append((aberta[0], n - 1, aberta[1], aberta[2], "fim do semestre"))
    return ops


def selecao_padrao(tab):
    return escolher(aprovados(tab))


def plano(d, semestres_tab, entrada, hedge, atraso=C.ATRASO,
          escolha=selecao_padrao):
    """Operações de todos os semestres, só com dados disponíveis em cada data."""
    linhas = []
    for rotulo, primeiro, ultimo, tab in semestres_tab:
        pares = escolha(tab)
        for par in pares.itertuples():
            z, beta = zscore_par(d, par, primeiro, ultimo, hedge,
                                 tab.attrs["inicio_formacao"])
            for ie, isai, direcao, b, motivo in operacoes_par(z, beta, entrada,
                                                              atraso):
                linhas.append({"semestre": rotulo, "setor": par.setor,
                               "y": par.y, "x": par.x, "direcao": direcao,
                               "beta": b, "entrada": z.index[ie],
                               "saida": z.index[isai], "motivo": motivo,
                               "pregoes": isai - ie})
    return pd.DataFrame(linhas)


def simular(d, ops, periodo, custo=C.CUSTO, aluguel=C.ALUGUEL,
            bruto=C.BRUTO_POR_PAR, cdi_vendido=True):
    """Carteira dia a dia a partir das operações. Começa com patrimônio 1.

    Devolve (diário, operações), em que diário tem o retorno líquido e as
    exposições, e operações ganha o resultado de cada uma.
    """
    ini, fim = periodo
    ret = d["ret"].loc[ini:fim]
    dias = ret.index
    col = {a: k for k, a in enumerate(ret.columns)}
    r = np.nan_to_num(ret.to_numpy())
    cdi = d["cdi"].reindex(dias).fillna(0.0).to_numpy()
    ops = ops[(ops["entrada"] >= dias[0]) & (ops["saida"] <= dias[-1])]
    ops = ops.reset_index(drop=True)
    entra, sai = {}, {}
    for k, op in ops.iterrows():
        entra.setdefault(op["entrada"], []).append(k)
        sai.setdefault(op["saida"], []).append(k)
    caixa, cota_ant = 1.0, 1.0
    abertas, resultado = {}, {}
    diario = []
    for t, dia in enumerate(dias):
        # 1. marca a mercado as pernas abertas
        for k, p in abertas.items():
            dy, dx = p["vy"] * r[t, p["iy"]], p["vx"] * r[t, p["ix"]]
            p["vy"] += dy
            p["vx"] += dx
            p["pnl"] += dy + dx
        # 2. CDI sobre o caixa e aluguel sobre as pontas vendidas
        vendido = sum(-v for p in abertas.values() for v in (p["vy"], p["vx"])
                      if v < 0)
        base = caixa if cdi_vendido else caixa - vendido
        caixa += base * cdi[t]
        for p in abertas.values():
            for v in (p["vy"], p["vx"]):
                if v < 0:
                    taxa = aluguel / 252 * -v
                    caixa -= taxa
                    p["pnl"] -= taxa
        negociado = 0.0
        # 3. saídas executadas no fechamento de hoje
        for k in sai.get(dia, []):
            p = abertas.pop(k)
            c = custo * (abs(p["vy"]) + abs(p["vx"]))
            caixa += p["vy"] + p["vx"] - c
            p["pnl"] -= c
            negociado += abs(p["vy"]) + abs(p["vx"])
            resultado[k] = (p["pnl"] / p["bruto"], p["pnl"] / p["cota"])
        # 4. entradas executadas no fechamento de hoje
        cota = caixa + sum(p["vy"] + p["vx"] for p in abertas.values())
        for k in entra.get(dia, []):
            op = ops.loc[k]
            g = bruto * cota
            b = op["beta"]
            vy = op["direcao"] * g / (1 + b)
            vx = -op["direcao"] * g * b / (1 + b)
            caixa -= vy + vx + custo * g
            negociado += g
            abertas[k] = {"iy": col[op["y"]], "ix": col[op["x"]], "vy": vy,
                          "vx": vx, "pnl": -custo * g, "bruto": g,
                          "cota": cota}
        pernas = [v for p in abertas.values() for v in (p["vy"], p["vx"])]
        cota = caixa + sum(pernas)
        diario.append((dia, cota / cota_ant - 1, len(abertas),
                       sum(abs(v) for v in pernas) / cota, sum(pernas) / cota,
                       negociado / cota))
        cota_ant = cota
    diario = pd.DataFrame(diario, columns=["data", "ret", "pares_abertos",
                                           "bruta", "liquida", "giro"])
    diario = diario.set_index("data")
    res = pd.DataFrame.from_dict(resultado, orient="index",
                                 columns=["retorno", "contribuicao"])
    return diario, ops.join(res)


def backtest(d, semestres_tab, entrada, hedge, periodo, atraso=C.ATRASO,
             escolha=selecao_padrao, **kw):
    """Atalho: plano de operações e simulação no período."""
    ops = plano(d, semestres_tab, entrada, hedge, atraso, escolha)
    if ops.empty:
        ops = pd.DataFrame(columns=["semestre", "setor", "y", "x", "direcao",
                                    "beta", "entrada", "saida", "motivo",
                                    "pregoes"])
    return simular(d, ops, periodo, **kw)
