import test from 'node:test';
import assert from 'node:assert/strict';
import { dateFormat, localeDate, localeNumber, localeTime, numberFormat } from '../lib/intl-cache.ts';

// 9.9.1 The reused formatters must give exactly the text the old one-off calls gave.
const days = [];
for (let ms = Date.UTC(2023, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 37 * 3600e3 + 17 * 60e3) days.push(new Date(ms));
days.push(new Date(2026, 11, 31, 23, 59), new Date(2024, 1, 29, 0, 0), new Date('2026-11-12T12:00:00'));

test('localeDate gives the same text as toLocaleDateString', () => {
  const cases = [
    ['id-ID', { day: 'numeric', month: 'long', year: 'numeric' }], ['id-ID', { month: 'short' }], ['id-ID', { month: 'long', year: 'numeric' }],
    ['id-ID', { day: 'numeric', month: 'short' }], ['id-ID', { weekday: 'long', day: 'numeric', month: 'long' }], ['id-ID', { day: 'numeric', month: 'short', year: 'numeric' }],
    ['en-CA', {}],
  ];
  for (const [locale, options] of cases) for (const d of days) assert.equal(localeDate(d, locale, options), d.toLocaleDateString(locale, options));
  assert.equal(localeDate(new Date('nope'), 'id-ID', { month: 'short' }), new Date('nope').toLocaleDateString('id-ID', { month: 'short' }));
  assert.equal(localeDate(new Date(NaN), 'en-CA', {}), new Date(NaN).toLocaleDateString('en-CA'));
});

test('localeTime gives the same text as toLocaleTimeString', () => {
  for (const d of days) assert.equal(localeTime(d, 'id-ID', { hour: '2-digit', minute: '2-digit' }), d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  assert.equal(localeTime(new Date(NaN), 'id-ID', { hour: '2-digit', minute: '2-digit' }), new Date(NaN).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
});

test('dateFormat with a time zone gives the same text as a new formatter', () => {
  for (const timeZone of ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC']) for (const d of days) {
    for (const [locale, options] of [['en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }], ['en-GB', { timeZone, hour: '2-digit', hour12: false }], ['en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }]]) {
      assert.equal(dateFormat(locale, options).format(d), new Intl.DateTimeFormat(locale, options).format(d));
      assert.deepEqual(dateFormat(locale, options).formatToParts(d), new Intl.DateTimeFormat(locale, options).formatToParts(d));
    }
  }
  assert.throws(() => dateFormat('en-CA', { timeZone: 'Not/AZone' }), RangeError);
});

test('localeNumber gives the same text as toLocaleString', () => {
  const values = [0, -0, 1, -1, 7.25, 12.5, 999, 1000, 45_000, -87_000, 1_234_567, 12_487_392.6, 1e9 + 1, 0.05, 6.94, NaN, Infinity];
  for (const v of values) {
    assert.equal(localeNumber(v, 'id-ID'), v.toLocaleString('id-ID'));
    for (const maximumFractionDigits of [0, 1, 2]) assert.equal(localeNumber(v, 'id-ID', { maximumFractionDigits }), v.toLocaleString('id-ID', { maximumFractionDigits }));
  }
});

test('the same language and options reuse one formatter', () => {
  assert.equal(dateFormat('id-ID', { month: 'short' }), dateFormat('id-ID', { month: 'short' }));
  assert.notEqual(dateFormat('id-ID', { month: 'short' }), dateFormat('id-ID', { month: 'long' }));
  assert.equal(numberFormat('id-ID'), numberFormat('id-ID', {}));
});
