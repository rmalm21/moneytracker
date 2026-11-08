'use client';
/** 9.0 Laporan → in a Ruang Bersama: each member's contribution in the period (lib/space-report.ts). */
import { useApp } from './app-provider';
import { rupiah } from '@/lib/accounting';
import { contributions } from '@/lib/space-report';
import { targetShares } from '@/lib/space-profile';
import type { LedgerTx } from '@/lib/types';

export function SpaceContributions({ items }: { items: LedgerTx[] }) {
  const { space, account } = useApp();
  if (!space) return null;
  const names = { ...Object.fromEntries(Object.entries(space.formerMembers || {}).map(([uid, f]) => [uid, `${f.name} (sudah keluar)`])), ...Object.fromEntries(Object.entries(space.members).map(([uid, m]) => [uid, m.name])) };
  const { lines, total, sharedSpend } = contributions(items, names);
  const shown = lines.filter(l => space.memberIds.includes(l.uid) || l.contributed || l.recorded);
  const target = targetShares(space);
  return <section className="panel sp-report" aria-label="Kontribusi anggota">
    <div className="panel-title"><h2>Kontribusi anggota</h2><small className="muted">Pengeluaran bersama periode ini {rupiah(sharedSpend)}</small></div>
    <p className="muted">Uang pribadi tiap orang yang masuk ke {space.name}: setoran (dikurangi yang diambil), yang dibayar pakai uang pribadi untuk bersama, dan bagiannya di patungan.</p>
    <ul>{shown.map(l => { const pct = total ? Math.round(Math.max(0, l.contributed) / total * 100) : 0; return <li key={l.uid}>
      <div className="sp-report-head"><strong>{l.uid === account?.uid ? `${l.name} (kamu)` : l.name}</strong><span><b>{rupiah(l.contributed)}</b>{total > 0 && <small> · {pct}%</small>}</span></div>
      <div className="sp-report-bar" aria-hidden="true"><i style={{ width: `${pct}%` }}/></div>
      {total > 0 && target[l.uid] !== undefined && (() => { const aim = Math.round(total * target[l.uid] / 100), diff = Math.max(0, l.contributed) - aim; return <small className={`sp-aim ${Math.abs(diff) < total * 0.02 ? 'is-even' : diff > 0 ? 'is-over' : 'is-under'}`}>Target {target[l.uid]}% ({rupiah(aim)}) · {Math.abs(diff) < total * 0.02 ? 'sesuai target' : diff > 0 ? `lebih ${rupiah(diff)}` : `kurang ${rupiah(-diff)}`}</small>; })()}
      <small className="muted">{[l.deposited && `Setor ${rupiah(l.deposited)}`, l.withdrew && `Ambil ${rupiah(l.withdrew)}`, l.paidTogether && `Bayar untuk bersama ${rupiah(l.paidTogether)}`, l.splitShare && `Bagian patungan ${rupiah(l.splitShare)}`, l.splitPaid && `Menalangi patungan ${rupiah(l.splitPaid)}`, `Mencatat ${l.recorded} transaksi`].filter(Boolean).join(' · ')}</small>
    </li>; })}</ul>
  </section>;
}
