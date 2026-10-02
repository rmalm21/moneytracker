# Benchmark Catat otomatis

A repeatable benchmark for the quick-entry box ("Catat otomatis"). It runs in plain Node (the parser is pure), in a few
milliseconds per sentence, with a fixed context: five wallets, a small category tree, two debts, one receivable, one
claim, two funds, one wish and one budget. Today is fixed at Saturday 26 September 2026.

```bash
node bench/quick/run.mjs v2 --fails              # the current engine (lib/quick-plan.ts)
node bench/quick/run.mjs v1 path/to/quick-entry.ts
node bench/quick/run.mjs --compare v1 v2
```

To measure the first engine, take `lib/quick-entry.ts` and `lib/categorize.ts` from commit `4a85e7e` into one folder
(`git show 4a85e7e:lib/quick-entry.ts > /tmp/v1/quick-entry.ts`, same for `categorize.ts`) and pass that path.

## The set

`fixtures.mjs` has 192 sentences in two sets:

- **Set utama** (147): the section-23 sentences that must keep working, clean entries, slang and chat spelling,
  typos, dates (past, future, relative, "pas gajian"), wallets, places, people, debts, receivables, claims, funds, wish
  list, budgets, schedules, plans, reminders, menus, negative cases, several actions in one message, shared context,
  references, corrections, conflicts and missing facts.
- **Set uji terpisah** (45): written after the engine was built and not looked at while tuning it. See RESULTS.md for
  what that means for its numbers.

Each sentence lists the actions a careful person expects. Only the fields written in the truth are checked. `null`
means "must not be guessed"; `review` lists fields the preview must mark for the person.

## Measures

Sentences fully right, action count, intent, amount, date, wallet, destination wallet, linked record, category,
person, sentence splitting, shared context and references, negative cases left alone, false actions, missed actions,
doubts that were marked, and **actions that are wrong while the preview shows them as fine** (the number that matters
most: it should stay at 0).

## Audit of the first engine (before 2.0)

`lib/quick-entry.ts`:

- `QuickKind` (21 kinds) and `QuickGroup` (the chips) with `QUICK_LABELS`, `groupOf` and `QUICK_MENUS` for "buka …".
- `parseQuickText(input, ctx, mode)` reads one sentence into one `QuickResult`: kind, amount, date, a transaction
  `preset` (type, wallet, destination, record ids, description, merchant, category) and the extras of the other menus
  (budget, goal, wallet, category, schedule, menu, reminder, why).
- Money: `amountWords` (word numbers and slang), `findAmounts` / `mainAmount` (a number with a unit first; dates and
  counts are skipped). Dates: `readDate` (relative words, day + month, d/m, "tgl N", weekdays, "N hari lalu"),
  `scheduleOf` for repeats. Wallets: `walletsIn` (whole words, tunai/cash aliases). Records: `bestMatch` on name words
  (generic words weigh less; ties give nothing). Categories: `lib/categorize.ts` (`suggestCategory`, `flowOf`) plus
  `namedCategory`, `budgetCategory`, `sceneCategory` and `hintedCategory`.
- Kind decision: `menuKind()` for the other menus, then `txKind()` for money movements; spending that repeats becomes
  a schedule, spending still to come becomes a plan, a reminder about a record becomes a note.
- `parseQuickBatch` split only when every piece had an amount, allowed only spending, income, transfers and budgets,
  and shared one date and one wallet.
- `components/quick-entry.tsx` showed one preview (or a list for a batch), a `sibling` map for "Bukan ini?", a
  `missing` check per kind and the save of each menu.

What the benchmark found in it: one reading per message (mixed messages lost actions), no corrections, no references,
a transfer without a source took the main wallet silently, "cicilan" alone attached a payment to another debt, "1.5jt"
read as 15 million, "kemaren"/"trf"/"go pay"/"350rbu" were not understood, "akhir bulan" and "pas gajian" were ignored
("pas gajian" even turned a payment into income), room and account numbers became amounts, and conflicts (two amounts,
two wallets, two dates) were resolved silently.

## Catat otomatis 2.0

`lib/quick-plan.ts` keeps `parseQuickText` as the reader of one clause and adds, around it: normalization of chat
spelling, corrections ("eh", "maksudnya", "bukan …"), clause splitting that joins back what cannot stand alone,
references ("dua-duanya", "yang bensin", "sisanya", "yang kedua"), values shared across clauses with scope rules,
record checks, conflict detection, per-field states (Terverifikasi, Kemungkinan benar, Perlu dicek, Belum terbaca),
one-tap alternatives and short reasons. The precedence rules are written at the top of that file.
`parseQuickText` and `parseQuickBatch` keep their behaviour and their tests.

## Catat otomatis V3 (app 4.0)

Dual-semantic engine (Financial Grammar + NLP.js, consensus, Bug Catcher). Sets `fixtures-v30dev.mjs` (development)
and `fixtures-v30heldout.mjs` (first held-out, first result frozen in `heldout-first/`), runner `run-v30.mjs`
(modes v25 · grammar · nlp · v3), engine-value script `nlp-value.mjs`. Full report: `REPORT-v3.md`.
