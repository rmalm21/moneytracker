# Insight V3 vs V2.5 — hasil

node bench/insight/run-v3.mjs --seeds 10 --write · latensi V3 tanpa cache ±7 ms (448 transaksi)

| Pengguna · tugas | V2.5 | V3 | Catatan |
|---|---|---|---|
| stable-salaried · silence | 10/10 | 10/10 |  |
| stable-salaried · scenario | – | 10/10 |  |
| stable-salaried · brief | 10/10 | 10/10 |  |
| delivery-surge · root | 10/10 | 10/10 |  |
| delivery-surge · impact | – | 10/10 |  |
| delivery-surge · query | – | 10/10 | 10/10 |
| delivery-surge · brief | 10/10 | 10/10 |  |
| variable-income · brief | 10/10 | 10/10 |  |
| variable-income · query | – | 10/10 | 10/10 |
| claim-heavy · pressure:claim | – | 10/10 |  |
| claim-heavy · brief | 10/10 | 10/10 |  |
| claim-heavy · query | – | 10/10 | 10/10 |
| debt-heavy · momentum | – | 10/10 |  |
| debt-heavy · brief | 10/10 | 10/10 |  |
| goal-heavy · pressure:goal | – | 10/10 |  |
| goal-heavy · query | – | 10/10 | 10/10 |
| tight-cash-idle-savings · pressure:liquidity | – | 10/10 |  |
| tight-cash-idle-savings · conflict | 10/10 | 10/10 | jalan uang minus |
| travel-cycle · regime | 0/10 | 10/10 |  |
| large-planned-purchase · planned | 10/10 | 10/10 |  |
| receipt-rich-groceries · cost-index | – | 10/10 | 6.9% |

“–” = V2.5 tidak punya kemampuan itu.
