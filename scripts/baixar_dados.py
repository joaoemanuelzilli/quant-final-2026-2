"""Baixa uma única vez os dados brutos e os grava em dados/bruto/.

Roda uma vez; depois disso todos os scripts leem só os arquivos
congelados, para que os números não mudem entre a véspera e o dia da
apresentação (Capítulo 12 do livro do Núcleo).

Fontes
- Yahoo Finance: fechamento, fechamento ajustado por proventos e volume
  das ações do universo, do BOVA11 e do Ibovespa.
- CDI diário: série 12 do SGS (Banco Central). Quando a API do BCB está
  fora do ar (como em 18/10/2026), usa a cópia congelada da mesma série
  no repositório do livro (2010 a 2025) e completa o período seguinte com
  a Selic over diária do Ipeadata menos 0,10 p.p., que é exatamente a
  diferença entre CDI e Selic over em todos os dias de 2019 a 2025.
- Fechamentos oficiais da B3 ajustados (livro do Núcleo), só para
  conferir a fonte gratuita.
"""
import shutil
import sys
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pares.config import ACOES, BRUTO, FIM_DADOS, INICIO_DADOS

LIVRO = Path.home() / "git/Quant/livro/dados"
SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
IPEA = ("http://www.ipeadata.gov.br/api/odata4/"
        "ValoresSerie(SERCODIGO='BM366_TJOVER366')")
FERIADOS_2026 = ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03",
                 "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07",
                 "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25"]


def baixar_yahoo():
    nomes = {f"{a}.SA": a for a in ACOES + ["BOVA11"]} | {"^BVSP": "IBOV"}
    fim = (pd.Timestamp(FIM_DADOS) + pd.Timedelta(days=1)).date()
    d = yf.download(list(nomes), start=INICIO_DADOS, end=str(fim),
                    auto_adjust=False, progress=False, threads=True)
    for campo, arq in [("Close", "yahoo_fechamento.csv"),
                       ("Adj Close", "yahoo_fechamento_ajustado.csv"),
                       ("Volume", "yahoo_volume.csv")]:
        tab = d[campo].rename(columns=nomes)[list(nomes.values())]
        tab.index.name = "data"
        tab.to_csv(BRUTO / arq, float_format="%.6f")
        print(arq, tab.shape, tab.index[0].date(), tab.index[-1].date())


def cdi_sgs():
    """Série 12 do SGS em blocos de até dez anos, em fração ao dia."""
    partes = []
    for a, b in [("01/01/2010", "31/12/2017"), ("01/01/2018", "16/10/2026")]:
        r = requests.get(SGS, params={"formato": "json", "dataInicial": a,
                                      "dataFinal": b}, timeout=60)
        partes.append(pd.DataFrame(r.json()))     # falha se não vier JSON
    cdi = pd.concat(partes)
    cdi.index = pd.to_datetime(cdi.pop("data"), format="%d/%m/%Y")
    return (cdi["valor"].astype(float) / 100).rename("cdi"), "SGS 12 (BCB)"


def cdi_reserva():
    """Cópia congelada do SGS 12 no livro + Selic over do Ipeadata."""
    livro = pd.read_csv(LIVRO / "c12_cdi.csv", index_col=0,
                        parse_dates=True)["cdi"]
    v = pd.DataFrame(requests.get(IPEA, timeout=120).json()["value"])
    selic = pd.Series(v["VALVALOR"].to_numpy(),
                      pd.to_datetime(v["VALDATA"].str[:10])).dropna()
    selic.to_frame("selic_over_aa").rename_axis("data").to_csv(
        BRUTO / "ipea_selic_over.csv")
    novo = selic[selic.index > livro.index[-1]]
    # o Ipeadata repete a taxa em fins de semana e feriados; o CDI só
    # existe em dias úteis bancários (calendário ANBIMA de 2026)
    util = (novo.index.dayofweek < 5) & ~novo.index.isin(
        pd.to_datetime(FERIADOS_2026))
    novo = novo[util]
    novo = ((1 + (novo - 0.10) / 100) ** (1 / 252) - 1).rename("cdi")
    fonte = pd.Series("SGS 12 (cópia do livro)", livro.index)
    fonte = pd.concat([fonte, pd.Series("Ipeadata Selic over - 0,10 p.p.",
                                        novo.index)])
    return pd.concat([livro, novo]), fonte


def baixar_cdi():
    try:
        cdi, fonte = cdi_sgs()
    except Exception as erro:                        # API do BCB fora do ar
        print("SGS indisponível:", type(erro).__name__, "- usando reserva")
        cdi, fonte = cdi_reserva()
    cdi = cdi.loc[INICIO_DADOS:FIM_DADOS]
    tab = pd.DataFrame({"cdi": cdi, "fonte": fonte.reindex(cdi.index)
                        if isinstance(fonte, pd.Series) else fonte})
    tab.index.name = "data"
    tab.to_csv(BRUTO / "cdi.csv")
    print("cdi.csv", len(tab), tab.index[0].date(), tab.index[-1].date())
    print(tab["fonte"].value_counts().to_string())


def copiar_b3_livro():
    destino = BRUTO / "livro_b3_precos_ajustados.csv"
    shutil.copy(LIVRO / "precos_ajustados.csv", destino)
    print("conferência:", destino.name)


if __name__ == "__main__":
    BRUTO.mkdir(parents=True, exist_ok=True)
    baixar_yahoo()
    baixar_cdi()
    copiar_b3_livro()
