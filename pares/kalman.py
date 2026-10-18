"""Filtro de Kalman para o hedge ratio dinâmico de um par.

Modelo em espaço de estados (Chan, 2013, cap. 3):
    observação:  ln Y_t = beta_t ln X_t + alfa_t + e_t,   e_t ~ N(0, Ve)
    estado:      [beta_t, alfa_t] = [beta_{t-1}, alfa_{t-1}] + w_t,
                 w_t ~ N(0, W),  W = delta / (1 - delta) * I

O erro de previsão um passo à frente, e_t = ln Y_t - (beta_{t|t-1} ln X_t
+ alfa_{t|t-1}), usa só informação até t-1 para os coeficientes; dividido
pelo desvio previsto sqrt(Q_t), vira o z-score do spread no pregão t.
"""
import numpy as np


def filtrar(log_y, log_x, delta, ve, beta0, alfa0):
    """Roda o filtro e devolve (beta_prev, alfa_prev, erro, desvio_prev).

    beta_prev[t] e alfa_prev[t] são as previsões feitas com dados até t-1;
    erro[t] e desvio_prev[t] formam o z-score do pregão t.
    """
    y = np.asarray(log_y, dtype=float)
    x = np.asarray(log_x, dtype=float)
    n = len(y)
    w = delta / (1 - delta) * np.eye(2)
    theta = np.array([beta0, alfa0], dtype=float)
    p = np.zeros((2, 2))
    beta_prev, alfa_prev = np.empty(n), np.empty(n)
    erro, desvio = np.empty(n), np.empty(n)
    for t in range(n):
        p = p + w                              # previsão do estado
        h = np.array([x[t], 1.0])
        beta_prev[t], alfa_prev[t] = theta
        e = y[t] - h @ theta                   # erro de previsão
        q = h @ p @ h + ve                     # variância prevista
        k = p @ h / q                          # ganho de Kalman
        theta = theta + k * e                  # atualização com y_t
        p = p - np.outer(k, h) @ p
        erro[t], desvio[t] = e, np.sqrt(q)
    return beta_prev, alfa_prev, erro, desvio
