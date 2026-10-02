# Catat otomatis V3.0 — report (app 4.0)

Dual-semantic engine: the deterministic Financial Grammar (Engine A) + NLP.js (Engine B), combined by a role-weighted
consensus and challenged by a Financial Bug Catcher. Everything runs on the device; no text leaves it, no cloud model.

## 1. Architecture

```
text → normalization → corrections → clauses → Engine A per clause (lib/quick-entry.ts)
       └ entity spans on a token row (lib/catat/entities.ts): amount / configured wallet / date / connector / content
       └ Bug Catcher (lib/catat/bug-catcher.ts) → fields, questions, entity graph (lib/quick-plan.ts)
     → Engine B: NLP.js on the message and each clause (lib/catat/nlp-engine.ts)
     → consensus per role (lib/catat/v3.ts) → Bug Catcher again → confidence → one question → action plan
```

The UI shows Engine A's plan instantly while typing; the V3 consensus replaces it ~200 ms later for the same text
(NLP.js is a lazy chunk, loaded only when Catat otomatis is used). If NLP.js fails, Engine A's plan stands.

## 2. Financial Grammar changes (Engine A)

- **Entity boundaries** (P0): the merchant was found by one regex after cutting the amount out, so the word after the
  amount slid into it ("B1 Piot Krom"). Now each token is tagged (amount, configured wallet, date, connector, place
  opener "di/@/at", content) and spans are chosen on that row. Amount, wallet, date and connectors end a merchant span;
  the description is the text with the chosen spans blanked out by offset (never string replacement).
- **Protected wallets**: a configured wallet is a hard boundary; a greedy candidate that would swallow it is rejected and
  kept in the trace ("B1 Piot Krom — menelan dompet terdaftar").
- **Merchant without "di"**: only a known place after the item ("kopi fore", "roti indomaret"); an unknown word stays in
  the description ("kopi tubruk" is not "Kopi" at "Tubruk"); a known name first ("grab waktu liburan") is the item.
- **Person / to / from**: "kirim/transfer ke X" where X is not a wallet → spending to X (not a transfer); "bayar X",
  "dapet dari X" → X as recipient/sender, marked to check unless X is in the records; honorifics skipped ("kak tio" →
  Tio, "ke ibu" → Ibu); time words are not names ("makan siang tono" → Tono).
- **Corrections / negations of entities**: "di b1, eh di piot", "bukan di b1, di piot", "talangin budi eh aldi",
  "bukan bagas, dimas".
- **Plain two-digit amounts** ("bensin 80 krom"): read only next to a wallet or a paying verb, always marked to check
  with the thousands as a one-tap choice ("iphone 15" stays nothing).
- **Structured persistence**: the person of spending/income is saved in a new structured field `counterparty`
  (LedgerTx), never flattened into notes. Merchant and description keep their own fields.

## 3. NLP.js integration (Engine B)

- Packages: `@nlpjs/core`, `@nlpjs/nlp`, `@nlpjs/lang-id` (local; no network).
- **Model strategy**: trained once at build time (`node scripts/build-nlp-model.mjs`), serialized into
  `lib/catat/nlp-model.ts` (128 KB) and imported; the device never trains. Corpus: `lib/catat/nlp-corpus.ts`
  (14 intents, hand-written casual Indonesian) + the single-action sentences of the original benchmark "set utama".
  The V3 dev and held-out sets are not in the corpus.
- **Dynamic entities**: the person's wallets (with aliases), known places (built-in, history, confirmed merchants) and
  people from the records are registered as NER options at run time, re-registered when they change; nothing personal
  is in the source or the model. Fuzzy matching handles typos ("mandri" → Mandiri, "famili mart" → Family Mart).
- **Abstraction**: `SemanticEngineResult { engineId, intentCandidates[], entityCandidates[] (type, value, rawText,
  start, end, confidence), ms }`; downstream code never touches NLP.js structures.
- **NLP.js never commits**: it returns evidence; actions are produced by Engine A and validated by the Bug Catcher.

## 4. Consensus (role-specific authority, not voting)

| Role | Authority |
|---|---|
| amount, date, transfer/debt direction, corrections, references | Engine A only |
| intent | A decides; B agreeing upgrades "likely" → "verified"; B disagreeing escalates only if A was unsure, B ≥ 0.9, and it is expense vs income |
| wallet | exact configured match by A wins; B may add a **typo** match A missed, as "Kemungkinan benar" |
| merchant | B may respell/split a known place A missed or merge a fragment; otherwise A |
| person | B knows only record people; may fill an empty person after ke/dari/bayar |
| respelling | B finds a configured wallet/known place written with ≤ 1 edit per word; A re-reads the corrected message and validates it |

## 5. Bug Catcher

Checks every action (before display and again after consensus): KNOWN_WALLET_SWALLOWED_BY_MERCHANT,
MERCHANT_DUPLICATED_IN_DESCRIPTION, UNASSIGNED_KNOWN_WALLET, AMOUNT_INSIDE_ENTITY, DATE_INSIDE_DESCRIPTION,
WALLET_AS_PERSON, ROLE_COLLISION, ENTITY_FRAGMENTATION. Repairs only remove contradictions (never invent amounts,
wallets not in the text, people or directions); what it cannot repair marks the field "Perlu dicek". Tested with
deliberately injected bad parses (tests/catat-v3.test.mjs).

## 6. Benchmarks

Sets (all kept): original 192 · V2.5 dev 56 · V2.5 held-out 24 (already inspected, so development data) ·
**v30-dev 58** (built from the real failures and the V2.5 held-out weak classes) · **v30-heldout-first 50**
(written after V3 was built, run once). Modes: A = V2.5 (frozen in `bench/quick/baseline-v25/`), B = V3 grammar only,
C = NLP.js alone, D = V3 combined.

### 6.1 v30-heldout — FIRST RUN (unseen; preserved in `bench/quick/heldout-first/`)

| Measure | V2.5 | V3 grammar only | NLP.js only | V3 combined |
|---|---:|---:|---:|---:|
| Kalimat benar seluruhnya | 52% | 86% | 14% | 92% |
| Jumlah aksi benar | 100% | 100% | 90% | 100% |
| Tepat: kind | 96% (52/54) | 98% (53/54) | 80% (39/49) | 98% (53/54) |
| Tepat: amount | 100% (53/53) | 100% (53/53) | 98% (47/48) | 100% (53/53) |
| Tepat: date | 100% (3/3) | 100% (3/3) | 33% (1/3) | 100% (3/3) |
| Tepat: wallet | 96% (44/46) | 96% (44/46) | 93% (38/41) | 100% (46/46) |
| Tepat: to | 83% (5/6) | 83% (5/6) | 67% (4/6) | 83% (5/6) |
| Tepat: link | 75% (3/4) | 100% (4/4) | 0% (0/4) | 100% (4/4) |
| Tepat: person | 29% (2/7) | 71% (5/7) | 0% (0/7) | 71% (5/7) |
| Tepat: description | 82% (14/17) | 94% (16/17) | 0% (0/17) | 100% (17/17) |
| Tepat: merchant | 27% (6/22) | 91% (20/22) | 40% (8/20) | 95% (21/22) |
| Batas entitas tepat (kalimat bertanda boundary) | 11% | 100% | 0% | 100% |
| To/from tepat (kalimat bertanda to/from) | 50% | 88% | 25% | 88% |
| Koreksi tepat | 67% | 100% | 17% | 100% |
| Rujukan tepat | 100% | 100% | 0% | 100% |
| Pemisahan tepat | 100% | 100% | 0% | 100% |
| Aksi palsu / terlewat | 0 / 0 | 0 / 0 | 0 / 5 | 0 / 0 |
| Keraguan ditandai | 100% | 100% | 0% | 100% |
| Aksi salah tapi yakin | 2 | 2 | 18 | 0 |
| Entitas salah tapi yakin | 12 | 2 | 26 | 1 |
| Relasi salah tapi yakin | 2 | 2 | 15 | 0 |
| Pertanyaan tepat | 100% | 100% | 0% | 100% |
| Tanya yang tidak perlu | 0 | 0 | 0 | 0 |
| Uang tercatat dobel | 0 | 0 | 0 | 0 |
| ms/sentence (P95) | 12.07 (4.15) | 12.23 (10.63) | 3.5 (6.09) | 4.83 (8.84) |

First-run failures of V3 combined: "susu di famili mart" (typo of a known place not respelled), "trf … ke mandri"
(typo of a wallet read as a person; marked to check, not confident), "pinjem dari kak tio" (honorific as the name,
marked to check), "nalangin makan siang tono" (time word as the name, marked to check). NLP.js fixed 3 sentences the
grammar missed (wallet/merchant typos) and caused 0 regressions.

### 6.2 After fixing those four classes (general rules, no sentence-specific code)

From here the held-out set is development data: its numbers below are **not** a measure on unseen text.

### v30dev
| Ukuran | v25 | grammar | nlp | v3 |
|---|---:|---:|---:|---:|
| Kalimat benar seluruhnya | 60% | 100% | 9% | 100% |
| Jumlah aksi benar | 98% | 100% | 91% | 100% |
| Tepat: kind | 98% (62/63) | 100% (64/64) | 88% (51/58) | 100% (64/64) |
| Tepat: amount | 100% (62/62) | 100% (62/62) | 98% (55/56) | 100% (62/62) |
| Tepat: date | 100% (6/6) | 100% (6/6) | 33% (2/6) | 100% (6/6) |
| Tepat: wallet | 100% (42/42) | 100% (43/43) | 88% (36/41) | 100% (43/43) |
| Tepat: to | 100% (9/9) | 100% (9/9) | 67% (6/9) | 100% (9/9) |
| Tepat: link | 100% (2/2) | 100% (2/2) | 0% (0/2) | 100% (2/2) |
| Tepat: person | 58% (7/12) | 100% (12/12) | 17% (2/12) | 100% (12/12) |
| Tepat: description | 88% (30/34) | 100% (34/34) | 0% (0/32) | 100% (34/34) |
| Tepat: merchant | 54% (20/37) | 100% (37/37) | 42% (14/33) | 100% (37/37) |
| Batas entitas tepat (kalimat bertanda boundary) | 20% | 100% | 0% | 100% |
| To/from tepat (kalimat bertanda to/from) | 73% | 100% | 36% | 100% |
| Koreksi tepat | 33% | 100% | 0% | 100% |
| Rujukan tepat | 50% | 100% | 0% | 100% |
| Pemisahan tepat | 100% | 100% | 0% | 100% |
| Aksi palsu / terlewat | 0 / 1 | 0 / 0 | 0 / 6 | 0 / 0 |
| Keraguan ditandai | 100% | 100% | 0% | 100% |
| Aksi salah tapi yakin | 0 | 0 | 17 | 0 |
| Entitas salah tapi yakin | 18 | 0 | 43 | 0 |
| Relasi salah tapi yakin | 1 | 0 | 17 | 0 |
| Pertanyaan tepat | 100% | 100% | 0% | 100% |
| Tanya yang tidak perlu | 0 | 2 | 0 | 2 |
| Uang tercatat dobel | 0 | 0 | 0 | 0 |
| Tepat: category | – | 100% (1/1) | 0% (0/1) | 100% (1/1) |
| ms/kalimat (P95) | 9.85 (5.24) | 10 (7.66) | 3.5 (7.78) | 7.72 (14.97) |

### v30heldout
| Ukuran | v25 | grammar | nlp | v3 |
|---|---:|---:|---:|---:|
| Kalimat benar seluruhnya | 52% | 90% | 14% | 100% |
| Jumlah aksi benar | 100% | 100% | 90% | 100% |
| Tepat: kind | 96% (52/54) | 98% (53/54) | 80% (39/49) | 100% (54/54) |
| Tepat: amount | 100% (53/53) | 100% (53/53) | 98% (47/48) | 100% (53/53) |
| Tepat: date | 100% (3/3) | 100% (3/3) | 33% (1/3) | 100% (3/3) |
| Tepat: wallet | 96% (44/46) | 96% (44/46) | 93% (38/41) | 100% (46/46) |
| Tepat: to | 83% (5/6) | 83% (5/6) | 67% (4/6) | 100% (6/6) |
| Tepat: link | 75% (3/4) | 100% (4/4) | 0% (0/4) | 100% (4/4) |
| Tepat: person | 29% (2/7) | 100% (7/7) | 0% (0/7) | 100% (7/7) |
| Tepat: description | 82% (14/17) | 94% (16/17) | 0% (0/17) | 100% (17/17) |
| Tepat: merchant | 27% (6/22) | 91% (20/22) | 40% (8/20) | 100% (22/22) |
| Batas entitas tepat (kalimat bertanda boundary) | 11% | 100% | 0% | 100% |
| To/from tepat (kalimat bertanda to/from) | 50% | 88% | 25% | 100% |
| Koreksi tepat | 67% | 100% | 17% | 100% |
| Rujukan tepat | 100% | 100% | 0% | 100% |
| Pemisahan tepat | 100% | 100% | 0% | 100% |
| Aksi palsu / terlewat | 0 / 0 | 0 / 0 | 0 / 5 | 0 / 0 |
| Keraguan ditandai | 100% | 100% | 0% | 100% |
| Aksi salah tapi yakin | 2 | 2 | 18 | 0 |
| Entitas salah tapi yakin | 12 | 2 | 26 | 0 |
| Relasi salah tapi yakin | 2 | 2 | 15 | 0 |
| Pertanyaan tepat | 100% | 100% | 0% | 100% |
| Tanya yang tidak perlu | 0 | 2 | 0 | 2 |
| Uang tercatat dobel | 0 | 0 | 0 | 0 |
| ms/kalimat (P95) | 12.45 (7.16) | 12.9 (6.26) | 3.45 (5.17) | 8.5 (16.21) |

### 6.3 Older sets with V3 combined (no regression)

| Set | Grammar only | V3 combined | Confident-wrong actions |
|---|---:|---:|---:|
| Original (192) | 100% | 100% | 0 |
| V2.5 dev (56) | 100% | 100% | 0 |
| V2.5 held-out (24) | 100% | 100% | 0 |

The V2.5 scorer (`bench/quick/run.mjs v2`) also stays at 100% on all three.

## 7. Value of the second engine (all sets, `node bench/quick/nlp-value.mjs`)

- Grammar failures rescued by NLP.js: **5** (all held-out: "roti indomart", "susu di famili mart", "bensin 40rb mandri",
  "pulsa 50rb pake jenus", "trf 300rb dr jago ke mandri"). Before respelling, the first held-out run already had 3.
- Regressions caused by NLP.js: **0** (one found during development — "beli kopi 30rb promo gopay" — fixed by making
  exact wallet words the grammar's call only).
- Intent: both engines agreed on 364 of 430 actions; NLP.js disagreed 66 times and was rejected each time (the grammar
  was right in all of them; 0 extra questions).
- Wallet: 172 agreements, 3 rescues (+ respellings), 0 rejected exact matches overridden.
- Merchant: 24 agreements, 34 grammar merchants NLP.js did not know (grammar kept), 3 rescues.
- Both engines failing: 0 sentences after the fixes (4 in the first held-out run).
- NLP.js alone (mode C) is not usable as an accountant: 9–14% whole-sentence exact, 43/26 confident-wrong entities,
  and it cannot tell "budi minjemin aku" from "aku minjemin budi" (same words) — direction stays with the grammar.

## 8. Safety

- Confident-wrong actions / entities / relations, V3 combined: **0 / 0 / 0** on every set (first held-out run: 0 / 1 / 0).
- Duplicate money movements: 0. Phantom actions: 0. Missed actions: 0.
- Unnecessary questions: 2 per V3 set, both deliberate: a person read after "bayar"/"dari" who is not in the records
  is marked to check (it could be a thing, e.g. "bayar laundry"); NLP.js added 0 questions.

## 9. Performance

- Grammar: ~5–13 ms per sentence in Node (P95 ≤ 8 ms on the v30 sets after warm-up). V3 combined: P95 ≈ 15–16 ms.
- NLP.js: model 128 KB (serialized), load ≈ 10 ms once, ≈ 1–3 ms per clause. Browser: two lazy chunks, ≈ 96 KB gzip,
  not part of the first load (Beranda first-load JS 687 KB vs 679 KB before; the 8 KB is the grammar's entity layer).
- Typing is never blocked: the grammar plan renders from a deferred value; V3 runs after a 180 ms pause.

## 10. Tests

`npm test`: 361 pass (19 new V3 tests: real-failure regressions, required tests 79–93, Bug Catcher with injected bad
parses, metamorphic and paraphrase tests, invariants, consensus safety). Production build passes.

## 11. Known limits

- The no-"di" merchant split needs a known place (built-in chains, the person's history or confirmed merchants);
  unknown shorthand like "susu b1 piot 7rb" keeps "Susu B1 Piot" as the description.
- A person after "bayar"/"dari" outside the records is always asked to be checked.
- NLP.js respelling covers configured wallets and known places only, one typo per word.
- Development numbers (v30-dev, held-out after fixes) are 100% by construction; the honest unseen measure is §6.1.

## Commands

```bash
SET=v30heldout node bench/quick/run-v30.mjs v25|grammar|nlp|v3 [--fails]
SET=v30dev     node bench/quick/run-v30.mjs v3
node bench/quick/nlp-value.mjs
node scripts/build-nlp-model.mjs     # rebuild the NLP.js model after changing the corpus
```
