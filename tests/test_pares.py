"""Testes de sanidade: casos cuja resposta se conhece por outro caminho."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares import config as C                                      # noqa: E402
from pares.kalman import estimar, filtrar                          # noqa: E402
from pares.metricas import drawdown, metricas, sharpe_deflacionado  # noqa: E402
from pares.motor import operacoes_par, simular, zscore_par         # noqa: E402
from pares.series import engle_granger, meia_vida                  # noqa: E402

DIAS = pd.bdate_range("2020-01-01", periods=300)


def par_cointegrado(n=600, beta=0.8, phi=0.9, semente=1):
    rng = np.random.default_rng(semente)
    lx = np.cumsum(rng.normal(0, 0.01, n)) + 3
    u = np.zeros(n)
    for t in range(1, n):
        u[t] = phi * u[t - 1] + rng.normal(0, 0.01)
    return beta * lx + 0.5 + u, lx


def dados_sinteticos(px, cdi=0.0004):
    n = len(next(iter(px.values())))
    px = pd.DataFrame(px, index=DIAS[:n])
    return {"px": px, "ret": px.pct_change(), "cdi": pd.Series(cdi, px.index)}


def test_meia_vida_recupera_phi():
    rng = np.random.default_rng(0)
    u = np.zeros(20000)
    for t in range(1, len(u)):
        u[t] = 0.9 * u[t - 1] + rng.normal()
    assert meia_vida(u) == pytest.approx(-np.log(2) / np.log(0.9), rel=0.05)
    assert meia_vida(np.cumsum(rng.normal(size=5000)) * 0 + np.arange(5000)) == np.inf


def test_engle_granger_separa_cointegrado_de_independente():
    ly, lx = par_cointegrado()
    eg = engle_granger(ly, lx)
    assert eg["p"] < 0.01
    assert eg["beta"] == pytest.approx(0.8, abs=0.1)
    rng = np.random.default_rng(5)
    rejeicoes = sum(engle_granger(np.cumsum(rng.normal(size=500)),
                                  np.cumsum(rng.normal(size=500)))["p"] < 0.05
                    for _ in range(40))
    assert rejeicoes <= 6          # ~5% de falsos positivos, com folga


def test_kalman_recupera_beta_constante():
    ly, lx = par_cointegrado(n=2000)
    beta, alfa, erro, desvio = filtrar(ly, lx, 1e-5, 0.01 ** 2, 0.0, 0.0)
    assert beta[-1] == pytest.approx(0.8, abs=0.1)
    z = erro[500:] / desvio[500:]
    assert abs(z.mean()) < 0.2 and 0.5 < z.std() < 2.0


def test_kalman_por_maxima_verossimilhanca_padroniza_o_z():
    ly, lx = par_cointegrado(n=600, semente=4)
    delta, ve = estimar(ly[:252], lx[:252], 0.8, 0.5, 0.02 ** 2)
    assert 1e-9 <= delta <= 1e-2 and ve > 0
    _, _, erro, desvio = filtrar(ly, lx, delta, ve, 0.8, 0.5)
    z = erro[20:] / desvio[20:]
    assert 0.8 < z[:232].std() < 1.2       # na própria formação
    assert 0.6 < z[232:].std() < 1.6       # fora dela, sem reestimar


def test_maquina_de_estados():
    z = pd.Series([0, -2.5, -1.0, 0.3, 0, 2.6, 1.0, -0.1, 0, 0], DIAS[:10])
    beta = pd.Series(1.0, z.index)
    ops = operacoes_par(z, beta, entrada=2.0, atraso=1)
    # compra em t=1 executa em 2; volta em 3 executa em 4; vende em 5 -> 6;
    # volta em 7 -> 8
    assert ops == [(2, 4, 1, 1.0, "reversão"), (6, 8, -1, 1.0, "reversão")]


def test_stop_bloqueia_e_fim_do_semestre_fecha():
    z = pd.Series([0, -2.1, -4.5, -2.5, -3.0, 0.5, 0, 0], DIAS[:8])
    ops = operacoes_par(z, pd.Series(1.0, z.index), entrada=2.0, atraso=1)
    assert ops == [(2, 3, 1, 1.0, "stop")]           # sem reentrada depois
    z = pd.Series([0, 0, 0, -2.2, -2.0, -1.5], DIAS[:6])
    ops = operacoes_par(z, pd.Series(1.0, z.index), entrada=2.0, atraso=1)
    assert ops == [(4, 5, 1, 1.0, "fim do semestre")]
    z = pd.Series([0, 0, 0, 0, -2.2, -2.0], DIAS[:6])  # abriria no último dia
    assert operacoes_par(z, pd.Series(1.0, z.index), 2.0, atraso=1) == []


def test_sem_operacoes_rende_o_cdi():
    d = dados_sinteticos({"A": np.linspace(10, 12, 50), "B": np.linspace(5, 4, 50)})
    vazio = pd.DataFrame(columns=["y", "x", "direcao", "beta", "entrada", "saida"])
    diario, _ = simular(d, vazio, (DIAS[0], DIAS[49]))
    # mesma convenção do livro: o período rende o CDI de todos os seus pregões
    assert (1 + diario["ret"]).prod() == pytest.approx(1.0004 ** 50)


def test_operacao_unica_bate_com_a_conta_a_mao():
    pa = np.array([10.0, 10, 10, 11, 12, 12])
    pb = np.array([20.0, 20, 20, 20, 19, 19])
    d = dados_sinteticos({"A": pa, "B": pb}, cdi=0.0)
    ops = pd.DataFrame([{"y": "A", "x": "B", "direcao": 1, "beta": 1.0,
                         "entrada": DIAS[2], "saida": DIAS[4], "pregoes": 2,
                         "motivo": "reversão"}])
    diario, res = simular(d, ops, (DIAS[0], DIAS[5]), custo=0.001,
                          aluguel=0.0, bruto=0.2)
    # comprado 0,1 em A (+20%) e vendido 0,1 em B (-5%): ganho 0,025;
    # custo de entrada 0,2 x 0,1% e de saída sobre 0,12 + 0,095
    esperado = 0.1 * 0.2 + 0.1 * 0.05 - 0.001 * 0.2 - 0.001 * (0.12 + 0.095)
    assert (1 + diario["ret"]).prod() - 1 == pytest.approx(esperado)
    assert res["retorno"].iloc[0] == pytest.approx(esperado / 0.2)


def test_aluguel_e_custo_maior_nunca_ajudam():
    rng = np.random.default_rng(3)
    ly, lx = par_cointegrado(n=300, semente=3)
    d = dados_sinteticos({"A": np.exp(ly), "B": np.exp(lx)})
    ops = pd.DataFrame([{"y": "A", "x": "B", "direcao": int(rng.choice([-1, 1])),
                         "beta": 0.8, "entrada": DIAS[i], "saida": DIAS[i + 15],
                         "pregoes": 15, "motivo": "reversão"}
                        for i in range(10, 280, 30)])
    final = {}
    for custo, aluguel in [(0, 0), (0.001, 0), (0.001, 0.02), (0.005, 0.08)]:
        diario, _ = simular(d, ops, (DIAS[0], DIAS[299]), custo=custo,
                            aluguel=aluguel)
        final[(custo, aluguel)] = (1 + diario["ret"]).prod()
    valores = list(final.values())
    assert all(a > b for a, b in zip(valores, valores[1:]))


def test_futuro_nao_muda_o_passado():
    """O z-score até uma data não muda quando se cortam os dados depois dela."""
    ly, lx = par_cointegrado(n=300)
    completo = dados_sinteticos({"A": np.exp(ly), "B": np.exp(lx)})
    corte = DIAS[200]
    cortado = {k: v.loc[:corte] for k, v in completo.items()}
    par = pd.Series({"y": "A", "x": "B", "beta": 0.8, "alfa": 0.5, "desvio": 0.02})
    for hedge in ["mqo", "mqo_movel", "kalman_1e-4", "kalman_mv"]:
        z1, b1 = zscore_par(completo, par, DIAS[150], DIAS[299], hedge, DIAS[0])
        z2, b2 = zscore_par(cortado, par, DIAS[150], corte, hedge, DIAS[0])
        pd.testing.assert_series_equal(z1.loc[:corte], z2)
        # o beta usado na ordem do dia t depende só de dados até t
        pd.testing.assert_series_equal(b1.loc[:DIAS[199]], b2.loc[:DIAS[199]])


def test_drawdown_conta_o_capital_inicial():
    ret = pd.Series([-0.1, 0.05, 0.02], DIAS[:3])
    assert drawdown(ret).iloc[0] == pytest.approx(-0.1)
    m = metricas(ret, pd.Series(0.0, ret.index))
    assert m["Drawdown máx."] == pytest.approx(-0.1)


def test_sharpe_deflacionado_cai_com_mais_variantes():
    rng = np.random.default_rng(9)
    x = pd.Series(rng.normal(0.0004, 0.01, 2000))
    p3, _ = sharpe_deflacionado(x, [0.3, 0.5, 0.7])
    p9, _ = sharpe_deflacionado(x, np.linspace(0.0, 1.0, 9))
    assert 0 < p9 < p3 < 1


def test_parametros_do_pre_registro():
    assert C.ATRASO == 1 and C.CUSTO == 0.001 and C.ALUGUEL == 0.02
    assert len(C.GRADE_ENTRADA) * len(C.GRADE_HEDGE) == 15
    assert C.TESTE[0] == "2020-01-01" and C.TREINO[1] == "2019-12-31"


def test_dados_reais_corrigidos():
    """Cisão da XPart corrigida e preço nominal sem ajuste por grupamentos."""
    from pares.dados import carregar
    d = carregar()
    assert d["ret"].at[pd.Timestamp("2021-10-04"), "ITUB4"] == pytest.approx(-0.0052, abs=0.001)
    # MGLU3 fez grupamento de 10 para 1 em 27/05/2024: antes dele, o preço
    # na tela era um décimo do que o Yahoo mostra
    antes = d["nominal"].at[pd.Timestamp("2024-05-24"), "MGLU3"]
    depois = d["nominal"].at[pd.Timestamp("2024-05-27"), "MGLU3"]
    assert depois / antes == pytest.approx(10, rel=0.15)
