# Insight V2.5 benchmark — hasil

Dijalankan: node bench/insight/run.mjs --write · 21/21 skenario lulus · rekonsiliasi driver 11/11

| Skenario | Jenis | Cek V2.5 | V2.5 | Advisor 4.3 menangkap? | Advisor tenang? | Advisor ms | V2.5 ms |
|---|---|---|---|---|---|---|---|
| stable | false-alarm | found ✓, quiet ✓ | lulus | – | tidak | 7.0 | 9.1 |
| delivery-frequency | change,driver | found ✓, changed ✓, quiet ✓, driver ✓, mech ✓ | lulus | ya | – | 3.4 | 8.0 |
| coffee-ticket | change,driver | found ✓, changed ✓, quiet ✓, driver ✓, mech ✓ | lulus | tidak | – | 2.7 | 7.8 |
| delivery-down | positive | found ✓, changed ✓, quiet ✓, positive ✓ | lulus | ya | – | 2.7 | 7.0 |
| new-user | learning | found ✓, quiet ✓, learning ✓ | lulus | – | – | 0.3 | 0.4 |
| thin-history | learning | found ✓, quiet ✓, learning ✓ | lulus | – | – | 1.1 | 1.3 |
| early-cycle-rent | fairness | found ✓, quiet ✓ | lulus | – | – | 1.8 | 4.5 |
| uncategorized | data-quality | found ✓, quiet ✓, caveat ✓ | lulus | – | – | 3.0 | 6.2 |
| claims-aging | claims | found ✓, quiet ✓ | lulus | tidak dianalisis | – | 2.2 | 8.3 |
| receivable-late | receivable | found ✓, quiet ✓ | lulus | ya | – | 2.7 | 9.0 |
| debt-paydown | debt | found ✓, quiet ✓, positive ✓, eta ✓ | lulus | tidak dianalisis | – | 3.6 | 6.4 |
| goals-pressure | goals | found ✓, quiet ✓ | lulus | ya | – | 2.7 | 7.9 |
| recurring-drift | recurring | found ✓, quiet ✓ | lulus | ya | – | 3.3 | 6.8 |
| unusual-purchase | anomaly | found ✓, quiet ✓ | lulus | ya | – | 3.1 | 7.8 |
| planned-purchase | anomaly,false-alarm | found ✓, quiet ✓ | lulus | – | tidak | 3.6 | 7.3 |
| item-price | prices | found ✓, quiet ✓ | lulus | tidak dianalisis | – | 2.8 | 7.0 |
| income-bonus | income,outlier | found ✓, quiet ✓ | lulus | – | – | 2.5 | 6.2 |
| income-drop | income | found ✓, quiet ✓ | lulus | – | – | 2.4 | 6.1 |
| late-start | coverage | found ✓, quiet ✓ | lulus | – | – | 2.1 | 5.3 |
| budget-pressure | budget,cluster | found ✓, quiet ✓, cluster ✓ | lulus | ya | – | 2.9 | 7.2 |
| split-bill | safety | found ✓, quiet ✓, safety ✓ | lulus | – | – | 3.7 | 7.1 |
