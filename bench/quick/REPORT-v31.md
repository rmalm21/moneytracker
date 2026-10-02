# Catat otomatis V3.1 — Temporal Intelligence report (app 4.1)

V3.1 adds **when** to V3.0's what / where / which wallet / who. Everything stays local and deterministic for time:
NLP.js never does clock arithmetic. V3.0 is frozen in `bench/quick/baseline-v30/` for the comparison.

## 1. Temporal architecture

```
clause → time discovery (lib/catat/temporal.ts: findTimes) ─┐
       → amounts skip time spans (findAmounts)               ├─ span ownership (lib/catat/entities.ts: owned[])
       → date phrases + time spans protected for the merchant┘   → description built last, from what is left
       → date resolved and locked (readDate, corrections) → resolveTime (nearest plausible timestamp)
       → temporal Bug Catcher → fields / options / "Kenapa?" / trace → Action Graph (shared date re-places clocks)
```

## 2. Parser components (lib/catat/temporal.ts)

- `readNumberWords`: one normalizer for satu … sembilan, sepuluh, sebelas, "dua belas", "lima belas", "dua puluh
  lima", seperempat, setengah.
- `findTimes`: discovery after **jam / jm / pukul / pkl / pk** (also glued: "jam2"), a colon clock without a marker
  ("12:10"), and "setengah 3" / "set 3 sore" with a daypart. "jam tangan", "jam dinding" are not times (no clock after).
- Clock grammar (`clockAt`): 24h colon, dot, space ("12 10"), compact HHMM after a marker ("1200", "0730"),
  "lewat / lwt / lebih" ("12 lewat 10"), "kurang / krg" ("3 kurang seperempat" = 2:45), half hours, plain hour.
  Invalid clocks (12:75, 25:00, 2599) are rejected, never normalized.
- `applyDaypart`: pagi / siang / sore / malam / subuh.
- `resolveTime`: smart 12-hour inference (below).

## 3–6. Formats and Indonesian half-hour semantics

| Written | Base clock | Notes |
|---|---|---|
| setengah satu / set 1 / set satu / setngh 1 / stengah 1 | 12:30 | half an hour **before** one |
| setengah dua / set 2 | 01:30 | |
| setengah tiga / set 3 | 02:30 | |
| set 12 | 11:30 | |
| jam 12 lewat 10 / lwt 10 / 12 10 / 12.10 / 12:10 | 12:10 | |
| jam 1200 / pukul 1945 | 12:00 / 19:45 | compact only after a marker |
| jam tiga lewat lima sore | 15:05 | |
| jam set 3 sore | 14:30 | half first, then daypart |

Dates: hari ini, tadi, barusan, kemarin / kemaren / kmrn / kmrin / kmren, besok, lusa; **tgl 2 / tgl2 / tanggal 2 /
tanggal2 / tnggl 2 / tnggal 2** (normalized to "tgl 2"); 2/10, 02/10, 2-10, 2/10/2026, 02/10/26, 02-10-2026;
2 oktober, 2 okt, 02 oktober 2026. "2.10" is **not** read as a date (it collides with "jam 12.10" and money).

## 7–10. Smart AM/PM, nearest plausible timestamp, past/future, midnight

1. Words fix the clock when there is a daypart, a 24-hour value (13–23, 0, a leading zero) — no inference.
2. Otherwise both clocks (h, h+12) are candidates on the possible dates: the **named date only** when the text named
   one (it is locked first and never moved: "kemarin jam 1" stays yesterday); otherwise today and, across midnight,
   yesterday (past) or tomorrow (future).
3. Today (or an unnamed date): completed events take the **latest candidate not later than now + 30 min** (score =
   minutes ago; a small-hours clock hours ago and the previous day cost extra). Future language ("nanti", "ntar",
   "entar", "besok", "lusa", plans, reminders) takes the **next** candidate instead.
4. A named other day ("kemarin", "tgl 2", "besok") has no reference clock: the hour people usually spend wins
   (01:00–04:59 is unlikely; otherwise closest to midday); when both readings are everyday hours ("kemarin jam 8")
   it is **marked to check with both as one-tap choices**, never a confident guess.
5. Status: verified (words fixed it) · likely (clear winner) · check (margin < 4 h, small-hours far from now,
   crossing midnight without "tadi/barusan/semalam", or a fixed clock still to come today).
6. A daypart said elsewhere in the clause ("kemaren sore … jam set 6") applies to a clock without one.

Examples at 15:00: jam 1 → 13:00, jam 7 → 07:00, set 2 → 13:30, set 3 → 14:30, 3 lewat 10 → 15:10. At 08:00:
jam 7 → 07:00, set 8 → 07:30. At 20:00: jam 7 → 19:00. At 00:30: "tadi makan jam 11" → yesterday 23:00 (likely),
"tadi makan jam 12" → 00:00, "hari ini jam 11" stays today and is marked to check.

**Day-only policy** (unchanged product behaviour): "tgl N" is this month; for a completed entry a day still to come
this month means last month ("tgl 20" on the 15th → 20 Sep); for plans it is this month.

## 11–12. Time / money / date disambiguation

Numbers inside a time span are never money (`findAmounts` skips them): "kopi 19k jam 1200" → Rp19.000 + 12:00;
"kopi 12000 jago" → Rp12.000, no time; "beli air 1200" → Rp1.200; "jam 7 20k" → 07:00 + Rp20.000 (a unit after the
number makes it money); "beli 2 kopi 20k jam 7" keeps the quantity; "tgl 2 beli susu 7k" → day 2 + Rp7.000.

## 13–14. Corrections, negations, multiple actions

"jam 1 eh jam 2", "jam 3 sore eh jam set 3 sore", "kemarin … eh hari ini", "tgl 2, eh tgl 3" (time and date are
correction types of their own), "bukan jam 1, jam 2", "bukan kemarin, hari ini", "bukan tgl 2, tgl 3". Each action
keeps its own time ("kopi jam 10 terus makan jam 1" → 10:00 / 13:00); a shared date re-places each clock on it; a
time said first ("jam 8 beli kopi sama roti") covers parts joined by "sama/dan", never by "terus".

## 15. Bug Catcher additions

TEMPORAL_SPAN_LEAKED_INTO_DESCRIPTION / _MERCHANT / _PERSON (repaired by rebuilding the field without the consumed
span), MONEY_MISCLASSIFIED_AS_TIME (a time without any time phrase is dropped), INVALID_CLOCK_TIME,
EXPLICIT_TIME_IGNORED (marks the time to check). The primary fix is span ownership: date and time spans are
`owned` by their fields and blanked by offset before the description is built (no string replacement).

## 16–17. Persistence and UI

The time is `preset.time` (local "HH:MM") with the date: saved as the transaction's `time`; with no time in the
text the app keeps using the moment of saving (unchanged). The reference clock is the person's time zone
(`timeInTimeZone`), refreshed each minute while typing. The card shows "Kemarin · 14:30"; a time to check is
highlighted with its readings as chips; "Ubah" opens the full form with date and time. "Kenapa?" explains, e.g.
"14:30 dibaca dari “jam set 3 sore”", "13:00 dipilih dari “jam 1” karena transaksi dicatat sekitar jam 15:00 dan
13:00 adalah waktu sebelumnya yang paling masuk akal". Developer trace lists every candidate with its reason.

## 18. V3.0 regression (V3.0 frozen vs V3.1)


### v30dev
| Ukuran | V3.0 | V3.1 |
|---|---:|---:|
| Kalimat benar seluruhnya | 100% | 100% |
| Tepat: amount | 100% (62/62) | 100% (62/62) |
| Tepat: wallet | 100% (43/43) | 100% (43/43) |
| Tepat: person | 100% (12/12) | 100% (12/12) |
| Tepat: merchant | 100% (37/37) | 100% (37/37) |
| Tepat: description | 100% (34/34) | 100% (34/34) |
| Tepat: date | 100% (6/6) | 100% (6/6) |
| Batas entitas tepat (kalimat bertanda boundary) | 100% | 100% |
| To/from tepat (kalimat bertanda to/from) | 100% | 100% |
| Aksi salah tapi yakin | 0 | 0 |
| Entitas salah tapi yakin | 0 | 0 |
| Relasi salah tapi yakin | 0 | 0 |
| Jam salah tapi yakin | 0 | 0 |
| Tanggal salah tapi yakin | 0 | 0 |
| Tanya yang tidak perlu | 2 | 2 |
| ms (P95) | 7.47 (14.89) | 8.56 (16.75) |

### v30heldout
| Ukuran | V3.0 | V3.1 |
|---|---:|---:|
| Kalimat benar seluruhnya | 100% | 100% |
| Tepat: amount | 100% (53/53) | 100% (53/53) |
| Tepat: wallet | 100% (46/46) | 100% (46/46) |
| Tepat: person | 100% (7/7) | 100% (7/7) |
| Tepat: merchant | 100% (22/22) | 100% (22/22) |
| Tepat: description | 100% (17/17) | 100% (17/17) |
| Tepat: date | 100% (3/3) | 100% (3/3) |
| Batas entitas tepat (kalimat bertanda boundary) | 100% | 100% |
| To/from tepat (kalimat bertanda to/from) | 100% | 100% |
| Aksi salah tapi yakin | 0 | 0 |
| Entitas salah tapi yakin | 0 | 0 |
| Relasi salah tapi yakin | 0 | 0 |
| Jam salah tapi yakin | 0 | 0 |
| Tanggal salah tapi yakin | 0 | 0 |
| Tanya yang tidak perlu | 2 | 2 |
| ms (P95) | 9.29 (18.94) | 10.5 (19.27) |

### v31dev
| Ukuran | V3.0 | V3.1 |
|---|---:|---:|
| Kalimat benar seluruhnya | 33% | 100% |
| Tepat: amount | 100% (93/93) | 100% (97/97) |
| Tepat: wallet | 100% (1/1) | 100% (1/1) |
| Tepat: person | 100% (1/1) | 100% (1/1) |
| Tepat: merchant | 38% (3/8) | 100% (9/9) |
| Tepat: description | 20% (2/10) | 100% (11/11) |
| Tepat: date | 87% (26/30) | 100% (32/32) |
| Tepat: time | 34% (26/76) | 100% (78/78) |
| Batas entitas tepat (kalimat bertanda boundary) | 9% | 100% |
| To/from tepat (kalimat bertanda to/from) | – | – |
| Aksi salah tapi yakin | 3 | 0 |
| Entitas salah tapi yakin | 9 | 0 |
| Relasi salah tapi yakin | 0 | 0 |
| Jam salah tapi yakin | 50 | 0 |
| Tanggal salah tapi yakin | 3 | 0 |
| Tanya yang tidak perlu | 1 | 0 |
| ms (P95) | 7.23 (13.69) | 7.67 (13.19) |
Original 192 / V2.5 dev 56 / V2.5 held-out 24: 100% / 100% / 100% with V3.1, 0 confident-wrong (V2.5 scorer too).
No entity, wallet, person, relation or amount measure went down.

## 19. v31-dev (development, 92 sentences)

V3.0 33% → V3.1 100% whole-sentence exact; time 34% → 100%; confident-wrong time 50 → 0 (table above).

## 20. v31-heldout-first — FIRST RUN (45 unseen casual sentences; frozen in `bench/quick/heldout-first/`)

| Measure | V3.0 | V3.1 grammar only | V3.1 combined |
|---|---:|---:|---:|
| Kalimat benar seluruhnya | 40% | 100% | 100% |
| Jumlah aksi benar | 98% | 100% | 100% |
| Tepat: kind | 100% (47/47) | 100% (48/48) | 100% (48/48) |
| Tepat: amount | 100% (47/47) | 100% (48/48) | 100% (48/48) |
| Tepat: date | 88% (14/16) | 100% (16/16) | 100% (16/16) |
| Tepat: time | 49% (20/41) | 100% (42/42) | 100% (42/42) |
| Tepat: wallet | 100% (4/4) | 100% (4/4) | 100% (4/4) |
| Tepat: to | 100% (1/1) | 100% (1/1) | 100% (1/1) |
| Tepat: person | 100% (1/1) | 100% (1/1) | 100% (1/1) |
| Tepat: description | 20% (1/5) | 100% (5/5) | 100% (5/5) |
| Tepat: merchant | 100% (5/5) | 100% (5/5) | 100% (5/5) |
| Batas entitas tepat (kalimat bertanda boundary) | 17% | 100% | 100% |
| Koreksi tepat | 33% | 100% | 100% |
| Pemisahan tepat | 100% | 100% | 100% |
| Aksi palsu / terlewat | 0 / 1 | 0 / 0 | 0 / 0 |
| Keraguan ditandai | 0% | 100% | 100% |
| Aksi salah tapi yakin | 1 | 0 | 0 |
| Entitas salah tapi yakin | 3 | 0 | 0 |
| Relasi salah tapi yakin | 0 | 0 | 0 |
| Jam salah tapi yakin | 21 | 0 | 0 |
| Tanggal salah tapi yakin | 1 | 0 | 0 |
| Tepat [ampm] | 18% | 100% | 100% |
| Tepat [half] | 0% | 100% | 100% |
| Tepat [lewat] | 0% | 100% | 100% |
| Tepat [daypart] | 14% | 100% | 100% |
| Tepat [format] | 67% | 100% | 100% |
| Tepat [words] | 0% | 100% | 100% |
| Tepat [date] | 54% | 100% | 100% |
| Tepat [absolute] | 100% | 100% | 100% |
| Tepat [money] | 83% | 100% | 100% |
| Tepat [future] | 0% | 100% | 100% |
| Tepat [midnight] | 0% | 100% | 100% |
| Tepat [context] | 67% | 100% | 100% |
| Tanya yang tidak perlu | 1 | 2 | 2 |
| Uang tercatat dobel | 0 | 0 | 0 |
| ms/sentence (P95) | 8.73 (13.73) | 15.17 (6.15) | 8.67 (13.13) |

After the first run one general rule was added (a daypart elsewhere in the clause, "kemaren sore … jam set 6", which
had been marked to check needlessly). From then on this set is development data.

## 21–22. Safety and questions

Confident-wrong time = **0** and confident-wrong date = **0** on every set. Unnecessary temporal questions: 0 on
v31-dev; 2 in the first held-out run ("kemaren sore … jam set 6", fixed after; "tgl 10 … jam 10.30", kept on
purpose: 10:30 and 22:30 are both everyday hours on a named past day).

## 23. Performance

Fast paths need no inference (24h, daypart, dates). Grammar ≈ 6–9 ms per sentence in Node (P95 ≈ 3–6 ms warm);
V3 combined P95 ≈ 13–19 ms. No NLP.js call for time.

## 24–25. Tests and build

`npm test`: 381 pass (20 new V3.1 tests: real failure, required tests §79–95, Bug Catcher injections, metamorphic,
property tests over 5 sentences × 10 time phrases, invalid clocks). Typecheck and production build pass; browser
smoke test at 390 px with no console errors.

## 26. Known remaining ambiguities

- A named past/future day with an everyday hour either way ("kemarin jam 8", "besok jam 8") is asked, by design.
- "jam 7 malam" written at 15:00 is moved to yesterday and asked (it has not happened yet today).
- "2.10" is not a date; "jam 4" with no context at 15:00 is read 04:00 and asked (small hours far from now).
- Plans keep the time in the preview; the plan record itself has no time field yet.

## Commands

```bash
SET=v31heldout node bench/quick/run-v30.mjs v30|grammar|v3 [--fails]
SET=v31dev     node bench/quick/run-v30.mjs v3
node --test tests/catat-v31.test.mjs
```
