# Catat otomatis V3.3 — Contextual Financial Reasoning report (app 4.3)

V3.3 answers what existing financial state changes because of a sentence — and refuses to assume every sentence
creates a new transaction. Language stays local and deterministic (no cloud AI, no personal language learning);
execution stays in the existing domain services. V3.2 is frozen in `bench/quick/baseline-v32/`.

## 1. Architecture changes

```
text ─▶ stateful routing (lib/catat/history.ts readCommand)  ── UPDATE / DELETE / CANCEL / QUERY / RECUR / STOP ──▶ one operation card
     ─▶ group reading (lib/catat/group.ts readGroup)           ── "budi sama aldi masing2 ngutang 10k" ──▶ one record each
     ─▶ V3.2 pipeline (segments, relations, temporal, entities) per clause
          + composition (lib/catat/composition.ts): discount / tax / service / shipping / cashback / unit price
          + settlement against the open record, safe matching, plan → actual, duplicate warning, Split Bill bridge
     ─▶ reason(): links inside the message ("dia bayar"), ambiguous "dia", "sisanya …" plans, bulk confirmation
     ─▶ Financial Mutation Plan (lib/catat/mutation.ts) for every action ─▶ V3.3 Bug Catcher ─▶ consequence preview
     ─▶ commit through the domain services: upsertTransaction / deleteTransaction / createReceivable / saveSplitBill /
        savePlan / saveRecord('recurring') — atomic Firestore transactions, idempotent ids, stale-state checks
```

**One source of truth.** Catat otomatis decides *what the user means*; the ledger decides *how it is executed*:
- `lib/firestore.ts upsertTransaction` already updates a receivable / debt / claim and its payment in one Firestore
  transaction and refuses a negative balance.
- `createReceivable` / `createClaim` are one cash event each.
- `saveSplitBill` commits the payment and the others' receivables together.
- `plannedId` posts a plan.

Domain extensions (small, reused by the forms too):
- `PlannedTransaction.time` and `Recurring.time`;
- `Recurring.pendingChange` (a new amount from a date) and `Recurring.endDate` (stop), honoured by `createDueDrafts`;
- `upsertTransaction(…, { opId, expect })`, `deleteTransaction(…, { amount })`;
- `saveSplitBill(…, { newId })`.

## 2. Operation model

`OperationType` is one of: CREATE, UPDATE, DELETE, CANCEL, SETTLE, PARTIAL_SETTLE, TRANSFER, SPLIT, LINK, UNLINK, SCHEDULE,
RECUR, STOP_RECURRING, QUERY, INSPECT, CONFIRM.

Each action carries `result.operation` with:
- the target (record id, label, evidence) and the candidates;
- the field changes;
- the remaining balance before and after;
- the in-message link;
- `expect` (the state the preview was computed from);
- the query answer or the recurring change.

New action kinds:
- `tx_update` (Ubah transaksi);
- `tx_delete` (Hapus transaksi);
- `query` (Pertanyaan, never saved);
- `recurring_change` (Ubah jadwal rutin).

## 3. FinancialContext strategy (read-only, bounded)

`QuickContext` gains `recent` (entries of the last 14 days, at most 200, with their creation time), `plans`,
`recurring` and `nowMs`; receivables, debts and claims were already there.

- The context is built by the caller from data already on the device (the Firestore local cache), so stateful reasoning
  also works offline.
- Nothing is written while reading.
- **Fast path:** a plain sentence runs no history lookup. The command reader is a handful of regular expressions, and the
  resolver only runs when an edit / delete / cancel verb is present.

## 4. Historical resolver

`resolveTransactions` scores each recent editable entry on:
- the words (description, merchant, category, counterparty, aliases such as cotti → Cotti Coffee);
- the wallet ("dari jago");
- the type ("transfer");
- the amount said ("yang 20k", "bukan 20");
- the day ("tadi", "kemarin");
- the order ("terakhir", "pertama").

Words that match nothing lower the score. A record is chosen only when it is ≥ 1.5 points ahead of the next one;
otherwise the close candidates are offered ("Yang mana: Kopi · Cotti Coffee Rp19.000 (hari ini 13:12) atau Kopi · Fore
Rp18.000 (hari ini 08:10)?") and nothing changes. "Kenapa?": "Kopi · Cotti Coffee Rp19.000 (hari ini 13:12) dipilih
karena cocok dengan kata “kopi”, merchant Cotti Coffee, waktu “tadi” (hari ini)."

## 5. Mutation plan

`planMutation(action, ctx, all)` returns a `FinancialMutationPlan`:
- `moneyMovements` (per wallet);
- `relationshipChanges` (before → after, status new / partial / settled);
- `creates`, `updates`, `deletes`, `schedules`, `recurringChanges`;
- `confirmations`;
- `complex` (whether to show the preview).

It is recomputed on the card from the amount being edited, so the preview never goes stale while editing.

## 6–9. Settlement, remaining balance, overpayment

- **Partial payment.** "atuy bayar 5k" (Atuy owes Rp12.000) → PARTIAL_SETTLE: +Rp5.000, Piutang Atuy Rp12.000 →
  Rp7.000. It is one payment linked to the record, never a new receivable and never an unlinked income. Verified in the
  browser + emulator: `remainingAmount 7000, status partial`, one payment.
- **Full payment.** "atuy bayar 12k" / "atuy lunasin" → SETTLE (0).
- **Fractions.** "setengah / separuh / sepertiga / seperempat" are worked out from the balance **now**, only when the
  record is unique, and the commit re-checks that balance (`expect`).
- **Remainder words.** "sisanya / sisa / selebihnya / yang kurang" + a time → a plan for the remaining balance
  *after* this payment ("atuy bayar 5k sisanya besok" → Rencana *Sisa piutang Atuy* Rp7.000 besok), never the
  original amount.
- **Overpayment.** "atuy bayar 15k" → PAYMENT_EXCEEDS_REMAINING_BALANCE: "Piutang Atuy tersisa Rp12.000, tapi pembayaran
  yang kamu tulis Rp15.000." The amount is marked to check, Rp12.000 is offered, and the balance never goes below zero
  (the ledger refuses it too).
- **Claims.** Claim payouts behave the same way (CLAIM_PAYMENT_EXCEEDS_REMAINING).
- **Safe matching.** A person with two open records ("dina bayar 20k": Dina (Bensin), Dina (Makan)) is always asked,
  never linked silently. This was found by the dev benchmark and fixed.

## 10. Pronouns and coreference

- "atuy ngutang 20k terus dia bayar 5k" → the payment settles the receivable created in the same message
  (Rp20.000 → Rp15.000), not Atuy's older one. On save it waits for that receivable's id (chained commit). Verified:
  Budi 20.000 → 15.000.
- "atuy ngutang 20k budi ngutang 10k terus dia bayar 5k" → "Atuy atau Budi yang bayar Rp5.000?", with no guess.

## 11–16. Arithmetic, amount roles, discounts, fees, cashback, transfer fee

- **Unit prices.** "3 kopi 18k satu" / "3 kopi @18k" / "2 tiket 50k per orang" / "masing2" → quantity × unit price.
- **No over-multiplying.** "3 kopi 18k" stays Rp18.000 (total), with Rp54.000 offered as the other reading.
- **Amount roles.** MAIN_AMOUNT, UNIT_PRICE, DISCOUNT, TAX, SERVICE, SHIPPING, FEE, TIP, CASHBACK. A charge never becomes
  a second action (the segmenter refuses that cut too).
- **Discount and service.** "makan 100k diskon 20k service 5k jago" → one expense of Rp85.000, stored with a structured
  receipt (subtotal 100.000, discount 20.000, service 5.000, total 85.000), never in the notes.
- **Cashback received.** "bensin 100k cashback 10k gopay" → it costs Rp90.000.
- **Cashback promised.** "… nanti dapet cashback 10k" → Rp100.000, and the cashback is not counted as money.
- **Transfer fee.** "tf 100k jago ke mandiri admin 2500" → Jago −Rp102.500, Mandiri +Rp100.000, fee Rp2.500 in
  `transferFee` (TRANSFER_DESTINATION_RECEIVED_FEE / TRANSFER_PRINCIPAL_MISMATCH guard it). A property test
  reconciles this with the ledger's `effects()`.

## 17–19. Groups, Split Bill, claims

- **Each person.** "budi sama aldi masing2 ngutang 10k" → Budi 10.000 + Aldi 10.000.
- **A total.** "budi sama aldi total ngutang 20k" → never 20.000 each; split 10.000 + 10.000 is *offered* and marked to
  check.
- **Split Bill.**
  - "gue bayar makan 150k bagi rata bertiga gue atuy budi" → Split Bill. Shares come from `computeSplit` (the Split
    Bill engine), so they always add up to the total. Saved through `saveSplitBill`: one cash transaction, with the
    receivables of Atuy and Budi linked to the bill.
  - Without "bagi rata / bertiga / patungan / split", the split is only offered.
  - "Kenapa?": "Bagi rata dipilih karena kamu menulis “bagi rata” dan menyebut kamu, Atuy, dan Budi."
- **Lending on someone's behalf.** "kmrn gue talangin atuy makan 50k pake jago" → one outflow, receivable Atuy
  Rp50.000, purpose Makan, dated yesterday.
- **Claims.** "makan kantor 100k jago nanti direimburse" → one claim (`createClaim`: one cash event). "claim makan cair
  60k" → Rp100.000 → Rp40.000.

## 20–21. Plans and recurring

- **Plans with a time.** "besok bayar wifi 121k jam 7 malam" → plan tomorrow 19:00, and the time is now persisted.
- **Plan → actual.** "wifi tadi udah gue bayar" / "wifi 121k udah dibayar" → the WiFi plan is posted (`plannedId`).
  There is no plan + actual double count.
- **New schedule.** "wifi 121k tiap tgl 24 jam 7 malam" → monthly, day 24, from 24 Okt, 19:00. This fixed a V3.1
  regression where the clock moved the schedule date.
- **Change from a date.** "mulai bulan depan spotify jadi 35k" → `pendingChange` from 1 Nov; earlier entries stay
  Rp30.000. Verified in the emulator.
- **Stop.** "bulan depan stop spotify" → `endDate` 1 Nov.

## 22–23. Duplicates and plain numbers

- **Duplicates.** The same type, amount, wallet and words recorded ≤ 10 minutes ago → "Transaksi mirip baru saja dicatat
  … Tetap catat?". It is a warning only, never a deletion or rejection.
- **Plain numbers.** "kopi 20 jago bensin 80 krom" → two actions, Rp20.000? and Rp80.000?, both marked to check, with a
  one-tap "Anggap 20 = Rp20.000 dan 80 = Rp80.000? [Ya]". Two-digit numbers only ("parkir 750" stays Rp750). No rule is
  learned from it.

## 24. Consequence preview

A plain spending stays a plain card. Complex actions show **Yang berubah** (money per wallet, balances
before → after, plans, schedule changes, the composition formula); rows show "Piutang Atuy → sisa Rp7.000".
Deleting needs two taps ("Hapus…" → "Ya, hapus"), and several records say "N transaksi akan dihapus."

## 25–27. Atomic commit, idempotency, stale state

- **Atomic.** Partial and full settlements, claim payouts, edits, plan posting and Split Bills each commit in one
  Firestore transaction (existing ledger behaviour).
- **Idempotent.** Each confirmation carries an `opId`: a repeated save finds the document and changes nothing
  (`upsertTransaction`, `saveSplitBill`).
- **Stale state.** "lunas / setengah" re-check the balance inside the transaction (`expect` → StaleStateError "Sisanya
  sudah berubah (sekarang Rp7.000)…"); edits and deletes re-check the entry's amount.

## 28. Bug Catcher additions

PAYMENT_EXCEEDS_REMAINING_BALANCE, CLAIM_PAYMENT_EXCEEDS_REMAINING, DUPLICATE_MONEY_MOVEMENT, MISSING_RELATIONSHIP_UPDATE,
WRONG_HISTORICAL_TARGET, AMBIGUOUS_HISTORICAL_TARGET, UPDATE_PARSED_AS_CREATE, DELETE_PARSED_AS_CREATE,
QUERY_PARSED_AS_CREATE, TRANSFER_FEE_MISAPPLIED, TRANSFER_PRINCIPAL_MISMATCH, TRANSFER_DESTINATION_RECEIVED_FEE,
GROSS_NET_MISMATCH, DISCOUNT_DOUBLE_COUNT, CASHBACK_PREMATURELY_CREDITED, SPLIT_TOTAL_MISMATCH, PARTIAL_SETTLEMENT_OVERFLOW,
PLAN_ACTUAL_DUPLICATE, RECURRING_HISTORY_REWRITE, STALE_STATE_MUTATION, UPDATE_COMMAND_CREATED_NEW_TRANSACTION.

UPDATE / DELETE / QUERY parsed as CREATE cannot occur, because commands are read before the create path.

## 29. Regression (V3.3 combined engine, after all fixes)

| Set | Kalimat benar | Aksi salah-yakin | Relasi salah-yakin | Jam salah-yakin | Tanggal salah-yakin | Uang dobel |
|---|---:|---:|---:|---:|---:|---:|
| v32dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v32heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v31dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v31heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v30dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v30heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v25 | 100% | 0 | 0 | 0 | 0 | 0 |
| holdout25 | 100% | 0 | 0 | 0 | 0 | 0 |
| orig | 100% | 0 | 0 | 0 | 0 | 0 |

Four V3.2 truths changed **on purpose** because V3.3 changes the behaviour the spec asks for:
- v32-dev m06 and v32-heldout h30: tax and service are charges of the same purchase;
- n01 and h36: the payment settles the receivable created in the same message.

One V3.0 test now expects the suggested Rp80.000 (still marked to check) instead of Rp80. The frozen first runs in
`heldout-first/` are untouched.

## 30. V3.3 development set (v33-dev, 72 state cases — tuned on)

| Ukuran | v32 | v33 |
| --- | ---: | ---: |
| Kalimat benar seluruhnya | 19% | 100% |
| Jenis operasi tepat | 39% | 100% |
| Perubahan state tepat | 40% | 100% |
| Target historis tepat | 33% | 100% |
| Tepat: Pelunasan sebagian | 0% | 100% |
| Tepat: Pelunasan penuh | 0% | 100% |
| Tepat: Sisa saldo | 0% | 100% |
| Tepat: Deteksi bayar lebih | 0% | 100% |
| Tepat: Rujukan (dia / dalam pesan) | 0% | 100% |
| Tepat: Ubah transaksi | 0% | 100% |
| Tepat: Hapus / batal | 0% | 100% |
| Tepat: Ambigu → tanya | 0% | 100% |
| Tepat: Pertanyaan (tanpa mutasi) | 0% | 100% |
| Tepat: Aritmetika | 60% | 100% |
| Tepat: Diskon | 0% | 100% |
| Tepat: Biaya / service | 40% | 100% |
| Tepat: Cashback | 0% | 100% |
| Tepat: Transfer + admin | 100% | 100% |
| Tepat: Grup | 0% | 100% |
| Tepat: Split Bill | 25% | 100% |
| Tepat: Talangan | 33% | 100% |
| Tepat: Klaim | 25% | 100% |
| Tepat: Rencana | 33% | 100% |
| Tepat: Jadwal rutin | 0% | 100% |
| Tepat: Peringatan duplikat | 50% | 100% |
| Tepat: Nominal tanpa satuan aman | 0% | 100% |
| Tepat: Kalimat sederhana | 100% | 100% |
| Presisi peringatan duplikat | – | 100% |
| Peringatan duplikat palsu | 0 | 0 |
| Mutasi salah tapi yakin | 17 | 0 |
| Target salah tapi yakin | 2 | 0 |
| Uang tercatat dobel | 1 | 0 |
| Saldo relasi negatif | 3 | 0 |
| Aksi palsu | 1 | 0 |
| Aksi terlewat | 14 | 0 |

Waktu per kalimat: v32 15.98 ms (P95 19.11) · v33 16.84 ms (P95 18.42)

## 31. Held-out — first run (v33-heldout-first, 43 state cases, frozen in `heldout-first/v33-v33heldout-*.json`)

Written before running; new people (Rian, Nisa, Dodi), new merchants and new phrasing, each with its own starting state.

| Ukuran | v32 | v33 |
| --- | ---: | ---: |
| Kalimat benar seluruhnya | 23% | 95% |
| Jenis operasi tepat | 35% | 98% |
| Perubahan state tepat | 40% | 95% |
| Target historis tepat | 33% | 100% |
| Tepat: Pelunasan sebagian | 0% | 100% |
| Tepat: Pelunasan penuh | 0% | 100% |
| Tepat: Sisa saldo | 0% | 100% |
| Tepat: Deteksi bayar lebih | 0% | 100% |
| Tepat: Rujukan (dia / dalam pesan) | 0% | 100% |
| Tepat: Ubah transaksi | 0% | 100% |
| Tepat: Hapus / batal | 0% | 100% |
| Tepat: Ambigu → tanya | 50% | 100% |
| Tepat: Pertanyaan (tanpa mutasi) | 0% | 67% |
| Tepat: Aritmetika | 67% | 100% |
| Tepat: Diskon | 0% | 50% |
| Tepat: Biaya / service | 50% | 50% |
| Tepat: Cashback | 0% | 100% |
| Tepat: Transfer + admin | 100% | 100% |
| Tepat: Grup | 0% | 100% |
| Tepat: Split Bill | 0% | 100% |
| Tepat: Talangan | 50% | 100% |
| Tepat: Klaim | 50% | 100% |
| Tepat: Rencana | 33% | 100% |
| Tepat: Jadwal rutin | 0% | 100% |
| Tepat: Peringatan duplikat | 50% | 100% |
| Tepat: Nominal tanpa satuan aman | 0% | 100% |
| Tepat: Kalimat sederhana | 100% | 100% |
| Presisi peringatan duplikat | – | 100% |
| Peringatan duplikat palsu | 0 | 0 |
| Mutasi salah tapi yakin | 7 | 1 |
| Target salah tapi yakin | 2 | 0 |
| Uang tercatat dobel | 1 | 1 |
| Saldo relasi negatif | 1 | 0 |
| Aksi palsu | 1 | 1 |
| Aksi terlewat | 8 | 0 |

Waktu per kalimat: v32 24.04 ms (P95 30.19) · v33 21.71 ms (P95 24.01)

The first run had two real failures:
- **e25** "makan malam 250rb voucher 50rb pajak 20rb gopay" was cut into two actions, because "voucher" was not a charge
  word for the segmenter. This was the one confident-wrong mutation and the duplicate money.
- **e18** "rian masih punya utang berapa ke gue" was answered from the debt side.

Both were fixed after the run (the set is now development data); after the fixes v33-dev and v33-heldout are 100%,
with confident-wrong mutation 0 and duplicate money 0.

## 32–33. Safety

| Target | v33-dev | v33-heldout first run | after fixes |
|---|---:|---:|---:|
| Confident-wrong mutation | 0 | **1** (e25) | 0 |
| Confident-wrong historical target | 0 | 0 | 0 |
| Duplicate money movement | 0 | **1** (e25) | 0 |
| Negative relationship balance | 0 | 0 | 0 |
| Phantom action | 0 | **1** (e25) | 0 |

## 34–37. Tests, latency, typecheck, build

`npm test`: **418 pass, 0 fail**. That includes 24 new V3.3 tests: required §81–103 and property tests §104–111
(money conservation against `effects()`, balances ≥ 0 for every amount 1k–30k, split shares = total, UPDATE / DELETE
create nothing, QUERY mutates nothing, one inflow per repayment).

Latency (Node, average / P95 over repeated runs):

| Kalimat | grammar | V3 penuh (+ NLP.js) |
|---|---:|---:|
| `makan 25k jago` | 1.14 / P95 1.77 ms | 5.04 / P95 6.59 ms |
| `atuy bayar 5k sisanya besok` | 1.13 / P95 1.63 ms | 6.13 / P95 6.83 ms |
| `ubah kopi cotti tadi jadi 25k` | 0.22 / P95 0.30 ms | 3.27 / P95 4.57 ms |
| `gue bayar makan 150k bagi rata bertiga gue atuy budi` | 1.24 / P95 1.63 ms | 10.98 / P95 11.48 ms |

Typecheck clean; production build passes (release ritual).

Browser smoke test at 390 px (emulator), all saved through the real domain services, no console errors:
- partial payment;
- edit;
- in-message create + pay;
- Split Bill;
- recurring change;
- two-tap delete.

## 38. Remaining limitations

- **Mixed messages.** A message that both edits an old entry and creates a new one ("hapus parkir tadi terus kopi 20k")
  is read as the command only.
- **Not atomic.** A payment of a receivable created in the same message is saved right after it (chained, idempotent),
  not in the same Firestore transaction.
- **Split Bill.** It is equal shares only (items and percentages stay in the Split Bill menu); "dia" after choosing who
  paid still needs the record picked when it is not saved yet.
- **Not modelled.** Percentage charges ("pajak 10%") and cashback paid into another wallet.
- **Plain transfers.** These keep the offline batch path, so their idempotency relies on the card closing after save
  rather than on an `opId`.
- **Held-out.** The held-out set was written by the engine's author; real typing will surface new cases.
