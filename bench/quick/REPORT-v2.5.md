# Catat otomatis V2.5 — report (app 3.1)

Local, deterministic, no network: `lib/quick-plan.ts` (+ small fixes in `lib/quick-entry.ts`). Results in
`bench/quick/out/` (not committed; rerun with the commands at the end). Today is fixed at Saturday 26 Sep 2026.

## 1. Audit (what existed)
V2 already had: chat-spelling normalization, corrections ("eh", "maksudnya", "bukan X"), clause splitting with
re-joining, references ("dua-duanya", "yang bensin", "sisanya", "yang kedua"), shared values with scope rules, record
checks, per-field states (Terverifikasi / Kemungkinan benar / Perlu dicek / Belum terbaca), one-tap alternatives and
"Kenapa?". Reused as is. Fragile (found by the new set): a full stop was not a clause boundary; "ga jadi" was ignored;
corrections could not target one entry ("yang bensin 75", "parkirnya 4rb"); "tapi makan cash" was dropped; a
consequence ("jadi Aldi utang gue 40rb") became a second receivable; a debt's name word without a debt word
("servis motor") paid that debt; "yang tadi" silently picked the last entry; "saldo 500rb" became spending; "2jt200"
was unread; "masing-masing" was not multiplied; a transfer admin fee was dropped; "kasih pinjem X" was read the wrong
way round; no question was produced, only flags.

## 2. What changed (architecture)
- **Action graph**: `QuickParseResult.relations` — shared_date, shared_wallet, refers_to, correction_of, negates,
  consequence_of, repayment_of, claim_for, transfer_between — each with a note and a confidence state.
- **Cancellation**: "ga jadi / batal / cancel" removes what it points to (the clause itself, "yang parkir", the last
  entry); `cancelled` lists it; nothing is saved for it.
- **Scoped corrections**: "yang bensin 75 ternyata" and "eh parkirnya 4rb" change only that entry (75 → 75.000 only
  when the entry's own amount is in the thousands); "eh bukan, pake mandiri"; "bukan dari Jago".
- **Implicit references / local override**: "tapi makan cash" = "yang makan pakai cash".
- **Dependency, no double money**: a consequence clause merges into the talangan as one receivable (one money
  movement); an expense followed by "jadi dia utang ke gue" becomes the receivable.
- **Record-match safety**: a debt matched only by a name word with other words and no debt word is spending; "yang
  tadi" with several candidates is asked, never picked.
- **Minimal clarification**: every action gets `ask` — its first open field as one short question that keeps what is
  known ("Rp100.000 ke Jago dari dompet mana?", "Utang yang mana: Utang Motor atau Utang Laptop?") with one-tap answers.
- **Smaller rules**: full stop as a boundary, "2jt200"/"2jt5", "masing-masing"/"@" (total shown as computed), "saldo X"
  asks for the wallet, "mau bayar …" is a plan, "kirim X ke <own wallet>" is a transfer, transfer admin fee kept
  separate (`transferFee`), "kasih pinjem X" = lending out, a name in capitals beats the word after the verb, a guessed
  person among other words is marked "Perlu dicek", "Budi 100rb" asks the kind (only for known/capitalized names).
- **Trace**: `trace` (normalization, clauses with roles, corrections, actions, consequences, cancellations,
  questions); the benchmark labels each failure (SEGMENTATION, AMOUNT, DATE, INTENT, REFERENCE/CONTEXT, CORRECTION,
  NEGATION, RELATION, ENTITY MATCH, VALIDATION). In the app: localStorage `dompet-ajaib:quick-debug` = `1`.
- **UI**: "3 aksi · 2 siap · 1 perlu dicek", the question with answer chips on each card (short form in rows),
  "Dibatalkan: …", a default wallet shown as "(bawaan)".

## 3. Results
### Original set (192 sentences): V2 vs V2.5 — no regression
All measures stay at 100% (exact sentences, count, kind, amount, date, wallet, destination, record, category, person,
splitting, references, negatives); false actions 0, missed 0, confidently wrong 0, unneeded questions 0.
Speed 6.1 → 4.5 ms per sentence (Node).

### V2.5 development set (56 sentences: spec 107–127 + paraphrases)
| Measure | V2 | V2.5 |
|---|---:|---:|
| Sentences fully right | 63% | 100% |
| Action count right | 89% | 100% |
| Kind / amount / date / wallet | 96 / 94 / 92 / 83% | 100 / 100 / 100 / 100% |
| Shared context & references | 43% | 100% |
| Corrections & cancellations | 13% | 100% |
| Relations (record / person / direction) | 87% | 100% |
| Right question, only for what is missing | 0% | 100% |
| False / missed actions | 5 / 1 | 0 / 0 |
| **Confidently wrong actions** | **11** | **0** |
| Unneeded questions | 2 | 0 |
| Money counted twice | 1 | 0 |

One truth was set to the app's existing behaviour: "ingetin besok bayar wifi 121rb" is a Rencana (a planned payment
that reminds), never a posted expense.

### Held-out (24 sentences written after tuning, run once — first result)
| Measure | V2 | V2.5 first run |
|---|---:|---:|
| Sentences fully right | 63% | **88%** (21/24) |
| Confidently wrong actions | 4 | **2** |
| Corrections & cancellations | 33% | 67% |
| Relations | 71% | 86% |
| Right question | 0% | 67% |
| Unneeded questions | 1 | 1 |

The three failures: "pake bca, eh bukan, pake mandiri" kept BCA (confidently wrong); "nalangin tiket konser Sinta
750rb" took "Tiket" as the person (confidently wrong); "kirim 75rb ke mandiri" was read as spending (marked for
checking). All three were then fixed with general rules (no sentence-specific code), so this set is now development
data: its 100% after the fixes is **not** a measure of accuracy on new text.

### Speed (Node, warm)
"makan 25rb pake Jago" 0.8 ms · "gaji 6jt" 0.6 ms · a 3-action sentence with a reference 2.4 ms.

## 4. Tests
`tests/quick-plan-v25.test.mjs` (25 tests: spec 107–127, paraphrases, scoped corrections, context leak, "yang tadi",
fee, questions, trace, speed). Whole suite: 293 passing. Production build passes.

## 5. Known limits
- Rules are hand-written; the sets are short, hand-made sentences with a small context.
- A lowercase person name typed next to other nouns ("nalangin tiket konser sinta") is marked "Perlu dicek" rather than
  resolved.
- A spending with no wallet named still uses the default wallet (the app's long-standing behaviour); it is now labelled
  "(bawaan)" in the plan rather than asked.
- Optional per-user alias memory (spec P1/P2) was not added in this release.

## Commands
```
node bench/quick/run.mjs <label> [--fails]          # original set
SET=v25 node bench/quick/run.mjs <label> [--fails]  # V2.5 development set
SET=holdout25 node bench/quick/run.mjs <label>      # held-out (now development data)
SET=v25 node bench/quick/run.mjs --compare v2-baseline v25-final
```
