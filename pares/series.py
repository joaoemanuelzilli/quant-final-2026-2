"""Séries temporais: raiz unitária, cointegração e meia-vida (Caps. 4 e 8)."""
import warnings

import numpy as np
import pandas as pd
from statsmodels.tools.sm_exceptions import InterpolationWarning
from statsmodels.tsa.stattools import adfuller, coint, kpss


def adf_kpss(serie):
    """ADF (H0: raiz unitária) e KPSS (H0: estacionária), com constante."""
    x = pd.Series(serie).dropna().to_numpy()
    adf = adfuller(x, regression="c", autolag="AIC")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InterpolationWarning)
        kp = kpss(x, regression="c", nlags="auto")
    return {"adf": adf[0], "adf_p": adf[1], "adf_crit5": adf[4]["5%"],
            "kpss": kp[0], "kpss_p": kp[1], "kpss_crit5": kp[3]["5%"]}


def mqo(y, x):
    """Regressão y = a + b x por mínimos quadrados: (b, a, resíduo)."""
    b, a = np.polyfit(x, y, 1)
    return b, a, y - (a + b * x)


def meia_vida(spread):
    """Meia-vida da reversão: d_t - m = phi (d_{t-1} - m) + e, h = -ln2/ln phi.

    Devolve infinito quando phi está fora de (0, 1), isto é, quando não há
    reversão à média no formato AR(1).
    """
    s = np.asarray(spread, dtype=float)
    phi, _ = np.polyfit(s[:-1], s[1:], 1)
    if not 0 < phi < 1:
        return np.inf
    return -np.log(2) / np.log(phi)


def engle_granger(log_y, log_x):
    """Teste de Engle-Granger nas duas ordens; fica com a de menor p-valor.

    Devolve dicionário com a ordem escolhida ('y' é a perna dependente),
    o p-valor, a estatística, o beta, o intercepto, o desvio-padrão do
    resíduo e a meia-vida do resíduo.
    """
    melhor = None
    for dep, ind, inverteu in [(log_y, log_x, False), (log_x, log_y, True)]:
        est, p, _ = coint(dep, ind, trend="c", autolag="aic")
        if melhor is None or p < melhor["p"]:
            b, a, res = mqo(dep, ind)
            melhor = {"inverteu": inverteu, "p": p, "estat": est, "beta": b,
                      "alfa": a, "desvio": res.std(ddof=1),
                      "meia_vida": meia_vida(res)}
    return melhor
