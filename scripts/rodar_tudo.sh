#!/usr/bin/env bash
# Refaz todos os resultados e a apresentação, na ordem dos scripts.
# Uso: bash scripts/rodar_tudo.sh   (de dentro da raiz do repositório)
set -euo pipefail
PY=${PY:-python}
rm -rf resultados/cache
for s in l01_dados l02_series l03_treino l04_teste l05_robustez l06_risco l07_slides; do
  echo "== $s"
  "$PY" "scripts/$s.py"
done
"$PY" -m pytest -q tests
if command -v node >/dev/null && [ -d slides/node_modules ]; then
  (cd slides && node build_deck.js)
fi
