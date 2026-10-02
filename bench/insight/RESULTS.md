# Insight V2.5 benchmark — hasil

Dijalankan: node bench/insight/run.mjs --write · 21/21 skenario lulus · rekonsiliasi driver 11/11

| Skenario | Jenis | Cek V2.5 | V2.5 | Advisor 4.3 menangkap? | Advisor tenang? | Advisor ms | V2.5 ms |
|---|---|---|---|---|---|---|---|
| stable | false-alarm | found ✓, quiet ✓ | lulus | – | tidak | 4.5 | 8.6 |
| delivery-frequency | change,driver | found ✓, changed ✓, quiet ✓, driver ✓, mech ✓ | lulus | ya | – | 2.7 | 8.2 |
| coffee-ticket | change,driver | found ✓, changed ✓, quiet ✓, driver ✓, mech ✓ | lulus | tidak | – | 2.5 | 7.2 |
| delivery-down | positive | found ✓, changed ✓, quiet ✓, positive ✓ | lulus | ya | – | 3.1 | 6.5 |
| new-user | learning | found ✓, quiet ✓, learning ✓ | lulus | – | – | 0.2 | 0.4 |
| thin-history | learning | found ✓, quiet ✓, learning ✓ | lulus | – | – | 0.6 | 1.1 |
| early-cycle-rent | fairness | found ✓, quiet ✓ | lulus | – | – | 1.7 | 3.7 |
| uncategorized | data-quality | found ✓, quiet ✓, caveat ✓ | lulus | – | – | 3.6 | 7.4 |
| claims-aging | claims | found ✓, quiet ✓ | lulus | tidak dianalisis | – | 3.5 | 8.1 |
| receivable-late | receivable | found ✓, quiet ✓ | lulus | ya | – | 3.2 | 8.2 |
| debt-paydown | debt | found ✓, quiet ✓, positive ✓, eta ✓ | lulus | tidak dianalisis | – | 4.4 | 17.3 |
| goals-pressure | goals | found ✓, quiet ✓ | lulus | ya | – | 6.3 | 15.5 |
| recurring-drift | recurring | found ✓, quiet ✓ | lulus | ya | – | 5.7 | 7.5 |
| unusual-purchase | anomaly | found ✓, quiet ✓ | lulus | ya | – | 3.2 | 8.5 |
| planned-purchase | anomaly,false-alarm | found ✓, quiet ✓ | lulus | – | tidak | 4.6 | 8.3 |
| item-price | prices | found ✓, quiet ✓ | lulus | tidak dianalisis | – | 3.4 | 6.9 |
| income-bonus | income,outlier | found ✓, quiet ✓ | lulus | – | – | 4.3 | 8.0 |
| income-drop | income | found ✓, quiet ✓ | lulus | – | – | 2.7 | 6.5 |
| late-start | coverage | found ✓, quiet ✓ | lulus | – | – | 2.2 | 6.2 |
| budget-pressure | budget,cluster | found ✓, quiet ✓, cluster ✓ | lulus | ya | – | 3.0 | 7.7 |
| split-bill | safety | found ✓, quiet ✓, safety ✓ | lulus | – | – | 4.1 | 8.4 |
