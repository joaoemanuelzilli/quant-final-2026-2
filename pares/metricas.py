"""Métricas de desempenho e de incerteza (Caps. 5, 7 e 12 do livro)."""
import numpy as np
import pandas as pd
from scipy import stats

GAMMA = 0.5772156649          # constante de Euler-Mascheroni


def drawdown(ret):
    """Queda da cota em relação ao maior valor já atingido (pico >= 1)."""
    cota = (1 + ret).cumprod()
    return cota / cota.cummax().clip(lower=1.0) - 1


def episodio_drawdown(ret):
    """Profundidade, data do vale, queda e recuperação (em pregões)."""
    dd = drawdown(ret)
    vale = dd.idxmin()
    pico = dd.loc[:vale][dd.loc[:vale] == 0].index
    queda = dd.loc[pico[-1]:vale].size - 1 if len(pico) else dd.loc[:vale].size
    apos = dd.loc[vale:]
    volta = apos[apos == 0].index
    rec = apos.loc[:volta[0]].size - 1 if len(volta) else np.nan
    return dd.min(), vale, queda, rec


def metricas(ret, cdi):
    """Métricas obrigatórias do enunciado e complementares, por retorno diário."""
    ret = ret.dropna()
    cdi = cdi.reindex(ret.index).fillna(0.0)
    cota = (1 + ret).cumprod()
    anos = len(ret) / 252
    excesso = ret - cdi
    abaixo = np.sqrt((np.minimum(excesso, 0) ** 2).mean())
    dd, vale, queda, rec = episodio_drawdown(ret)
    ra = cota.iloc[-1] ** (1 / anos) - 1
    sharpe = excesso.mean() / excesso.std() * np.sqrt(252)
    return pd.Series({
        "Retorno acumulado": cota.iloc[-1] - 1,
        "Retorno a.a.": ra,
        "Volatilidade a.a.": ret.std() * np.sqrt(252),
        "Sharpe": sharpe,
        "Sortino": excesso.mean() / abaixo * np.sqrt(252) if abaixo > 0 else np.nan,
        "Drawdown máx.": dd,
        "Queda (pregões)": queda,
        "Recuperação (pregões)": rec,
        "Calmar": ra / abs(dd) if dd < 0 else np.nan,
        "Excesso a.a. sobre o CDI": (cota.iloc[-1] / (1 + cdi).prod()) ** (1 / anos) - 1,
        "Erro-padrão do Sharpe": erro_padrao_sharpe(excesso),
    })


def mensal(ret):
    return (1 + ret).groupby(ret.index.to_period("M")).prod() - 1


def excesso_mensal(ret, cdi):
    """Excesso mensal sobre o CDI, razão de informação e estatística t."""
    a = mensal(ret) - mensal(cdi.reindex(ret.index).fillna(0.0))
    ri = a.mean() / a.std() * np.sqrt(12)
    t = a.mean() / a.std() * np.sqrt(len(a))
    return a, ri, t


def erro_padrao_sharpe(excesso_diario):
    """Erro-padrão do Sharpe anualizado (Lo, 2002, retornos independentes)."""
    x = excesso_diario.dropna()
    sr = x.mean() / x.std()
    return np.sqrt((1 + 0.5 * sr ** 2) / len(x)) * np.sqrt(252)


def maximo_esperado(n, desvio):
    """Máximo esperado de n Sharpes sem habilidade (Bailey e López de Prado)."""
    if n <= 1:
        return 0.0
    return desvio * ((1 - GAMMA) * stats.norm.ppf(1 - 1 / n)
                     + GAMMA * stats.norm.ppf(1 - 1 / (n * np.e)))


def sharpe_deflacionado(excesso_diario, sharpes_variantes):
    """Probabilidade de o Sharpe verdadeiro superar o máximo do acaso.

    Sharpes por pregão; o limiar SR* é o máximo esperado de N tentativas com
    a dispersão observada entre as variantes (Cap. 7 do livro).
    """
    x = excesso_diario.dropna()
    sr = x.mean() / x.std()
    variantes = np.asarray(sharpes_variantes) / np.sqrt(252)
    sr0 = maximo_esperado(len(variantes), variantes.std(ddof=1))
    g3, g4 = stats.skew(x), stats.kurtosis(x, fisher=False)
    den = np.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr ** 2)
    return stats.norm.cdf((sr - sr0) * np.sqrt(len(x) - 1) / den), sr0 * np.sqrt(252)


def bootstrap_sharpe(excesso_diario, n=5000, bloco=21, semente=42):
    """Distribuição do Sharpe anualizado por bootstrap em blocos de 21 pregões."""
    x = excesso_diario.dropna().to_numpy()
    rng = np.random.default_rng(semente)
    m = len(x)
    k = int(np.ceil(m / bloco))
    saida = np.empty(n)
    for i in range(n):
        inicios = rng.integers(0, m - bloco + 1, k)
        amostra = np.concatenate([x[s:s + bloco] for s in inicios])[:m]
        saida[i] = amostra.mean() / amostra.std(ddof=1) * np.sqrt(252)
    return saida


def beta_mercado(ret, cdi, mercado):
    """Beta diário do excesso da carteira sobre o excesso do mercado (HAC)."""
    import statsmodels.api as sm
    df = pd.concat([ret - cdi, mercado - cdi], axis=1, join="inner").dropna()
    df.columns = ["carteira", "mercado"]
    modelo = sm.OLS(df["carteira"], sm.add_constant(df["mercado"]))
    res = modelo.fit(cov_type="HAC", cov_kwds={"maxlags": 5})
    return {"beta": res.params["mercado"], "beta_ep": res.bse["mercado"],
            "alfa_aa": res.params["const"] * 252,
            "alfa_t": res.tvalues["const"],
            "correlacao": df["carteira"].corr(df["mercado"])}


def resumo_operacoes(ops):
    """Número de operações, taxa de acerto, payoff e duração."""
    r = ops["retorno"].dropna()
    ganhos, perdas = r[r > 0], r[r <= 0]
    return pd.Series({
        "Operações": len(r),
        "Taxa de acerto": (r > 0).mean() if len(r) else np.nan,
        "Ganho médio": ganhos.mean(),
        "Perda média": perdas.mean(),
        "Payoff": ganhos.mean() / -perdas.mean() if len(perdas) else np.nan,
        "Fator de lucro": ganhos.sum() / -perdas.sum() if perdas.sum() else np.nan,
        "Duração mediana (pregões)": ops["pregoes"].median(),
        "Stops": (ops["motivo"] == "stop").sum(),
    })
