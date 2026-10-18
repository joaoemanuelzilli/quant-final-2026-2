"""Filtro de Kalman para o hedge ratio dinâmico de um par.

Modelo em espaço de estados (Chan, 2013, cap. 3):
    observação:  ln Y_t = beta_t ln X_t + alfa_t + e_t,   e_t ~ N(0, Ve)
    estado:      [beta_t, alfa_t] = [beta_{t-1}, alfa_{t-1}] + w_t,
                 w_t ~ N(0, W),  W = delta / (1 - delta) * I

O erro de previsão um passo à frente, e_t = ln Y_t - (beta_{t|t-1} ln X_t
+ alfa_{t|t-1}), usa só informação até t-1 para os coeficientes; dividido
pelo desvio previsto sqrt(Q_t), vira o z-score do spread no pregão t.

As contas da matriz 2x2 são feitas em escalares: o filtro roda milhões de
vezes na estimação por máxima verossimilhança.
"""
import math

import numpy as np
from scipy.optimize import minimize


def filtrar(log_y, log_x, delta, ve, beta0, alfa0):
    """Roda o filtro e devolve (beta_prev, alfa_prev, erro, desvio_prev).

    beta_prev[t] e alfa_prev[t] são as previsões feitas com dados até t-1;
    erro[t] e desvio_prev[t] formam o z-score do pregão t.
    """
    y = np.asarray(log_y, dtype=float)
    x = np.asarray(log_x, dtype=float)
    n = len(y)
    w = delta / (1 - delta)
    b, a = float(beta0), float(alfa0)
    p11 = p12 = p22 = 0.0
    beta_prev, alfa_prev = np.empty(n), np.empty(n)
    erro, desvio = np.empty(n), np.empty(n)
    for t in range(n):
        p11 += w                                   # previsão do estado
        p22 += w
        xt = x[t]
        beta_prev[t], alfa_prev[t] = b, a
        e = y[t] - (b * xt + a)                    # erro de previsão
        ph1 = p11 * xt + p12                       # P h
        ph2 = p12 * xt + p22
        q = xt * ph1 + ph2 + ve                    # variância prevista
        k1, k2 = ph1 / q, ph2 / q                  # ganho de Kalman
        b += k1 * e                                # atualização com y_t
        a += k2 * e
        p11 -= k1 * ph1
        p12 -= k1 * ph2
        p22 -= k2 * ph2
        erro[t], desvio[t] = e, math.sqrt(q)
    return beta_prev, alfa_prev, erro, desvio


def estimar(log_y, log_x, beta0, alfa0, ve0, aquecimento=20):
    """delta e Ve por máxima verossimilhança dos erros de previsão.

    Usa só a janela recebida (a formação). Busca em log10, com delta entre
    1e-9 e 1e-2 e Ve entre 1e-3 e 10 vezes a variância inicial.
    """
    def nll(theta):
        delta, ve = 10 ** theta[0], 10 ** theta[1]
        _, _, e, s = filtrar(log_y, log_x, delta, ve, beta0, alfa0)
        e, s = e[aquecimento:], s[aquecimento:]
        return np.sum(np.log(s ** 2) + (e / s) ** 2) / 2

    lv = math.log10(ve0)
    limites = [(-9, -2), (lv - 3, lv + 1)]
    melhor = min((minimize(nll, x0, method="L-BFGS-B", bounds=limites)
                  for x0 in ([-6, lv], [-4, lv - 1])), key=lambda r: r.fun)
    return 10 ** melhor.x[0], 10 ** melhor.x[1]
