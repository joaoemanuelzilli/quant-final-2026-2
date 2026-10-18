"""Constantes do projeto: universo, períodos e parâmetros pré-registrados.

Tudo o que está aqui foi fixado no PRE_REGISTRO.md antes da rodada de
teste. Mudar qualquer valor depois dela transforma o teste em treino.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DADOS = RAIZ / "dados"
BRUTO = DADOS / "bruto"
RESULTADOS = RAIZ / "resultados"
CACHE = RESULTADOS / "cache"

# Universo: ações líquidas da B3 agrupadas por setor. Pares só se formam
# dentro do mesmo grupo (ligação econômica antes de qualquer estatística).
SETORES = {
    "Bancos": ["ITUB4", "ITUB3", "BBDC4", "BBDC3", "BBAS3", "SANB11",
               "ITSA4", "BPAC11", "ABCB4", "BRSR6"],
    "Petróleo e gás": ["PETR4", "PETR3", "PRIO3", "UGPA3", "CSAN3",
                       "VBBR3", "RECV3"],
    "Mineração e siderurgia": ["VALE3", "BRAP4", "GGBR4", "GOAU4", "USIM5",
                               "CSNA3", "CMIN3"],
    "Energia elétrica": ["AXIA3", "CMIG4", "CMIG3", "CPLE3", "EGIE3",
                         "TAEE11", "ISAE4", "ENGI11", "EQTL3", "CPFE3",
                         "ALUP11", "ENEV3"],
    "Saneamento": ["SBSP3", "SAPR4", "SAPR11", "CSMG3"],
    "Papel e celulose": ["SUZB3", "KLBN11", "KLBN4"],
    "Varejo": ["LREN3", "MGLU3", "AMER3", "BHIA3", "PCAR3", "ASAI3"],
    "Construção civil": ["CYRE3", "MRVE3", "EZTC3", "EVEN3", "DIRR3",
                         "GFSA3", "CURY3"],
    "Telecomunicações": ["VIVT3", "TIMS3"],
    "Saúde": ["RADL3", "HYPE3", "FLRY3"],
    "Shoppings": ["MULT3", "IGTI11"],
    "Educação": ["COGN3", "YDUQ3"],
    "Seguros": ["BBSE3", "PSSA3", "CXSE3"],
    "Transporte e logística": ["MOTV3", "ECOR3", "RAIL3"],
    "Frigoríficos": ["BEEF3", "MBRF3"],
}
ACOES = [a for grupo in SETORES.values() for a in grupo]
SETOR_DE = {a: s for s, grupo in SETORES.items() for a in grupo}
BENCHMARKS = ["BOVA11", "IBOV"]

# Períodos. A formação usa os 252 pregões anteriores a cada semestre; os
# semestres de negociação do treino vão do 2º semestre de 2011 (o primeiro
# com 252 pregões de histórico) a 2019, e os do teste, de 2020 até o último
# pregão congelado.
INICIO_DADOS = "2010-01-01"
FIM_DADOS = "2026-10-16"
TREINO = ("2011-07-01", "2019-12-31")
TESTE = ("2020-01-01", FIM_DADOS)

# Formação (seleção de pares)
JANELA_FORMACAO = 252          # pregões
VOLUME_MINIMO = 10e6           # mediana do volume financeiro diário, R$
PRECO_MINIMO = 5.0             # fechamento sem ajuste no fim da formação, R$
COBERTURA_MINIMA = 0.95        # fração de pregões com preço na formação
PVALOR_MAXIMO = 0.05           # Engle-Granger
MEIA_VIDA = (2, 63)            # pregões
N_PARES = 10                   # pares por semestre
MAX_PARES_POR_ACAO = 2
MAX_PARES_POR_SETOR = 3

# Negociação
SAIDA_Z = 0.0                  # fecha quando o z-score cruza a média
STOP_EXTRA = 2.0               # stop em |z| >= entrada + 2
ATRASO = 1                     # sinal no fechamento t, ordem no fechamento t+1
CUSTO = 0.001                  # 0,10% do valor negociado, por ponta
ALUGUEL = 0.02                 # 2% a.a. sobre o valor da ponta vendida
BRUTO_POR_PAR = 2 / N_PARES    # exposição bruta de um par (comprado + vendido)

# Grade pré-registrada: 3 x 3 = 9 variantes, escolhidas pelo maior Sharpe
# líquido no treino.
GRADE_ENTRADA = [1.5, 2.0, 2.5]
GRADE_HEDGE = ["mqo", "kalman_1e-5", "kalman_1e-4"]
SEMENTE = 42
