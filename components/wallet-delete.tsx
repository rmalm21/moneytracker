'use client';
import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { AppIcon, identityStyle } from './visual-identity';
import { rupiah } from '@/lib/accounting';
import { archiveWallet, deleteWalletForever } from '@/lib/firestore';
import { walletDeletePlan } from '@/lib/wallet-delete';
import type { Wallet } from '@/lib/types';

/** Hapus dompet: says what happens before anything changes (transactions are always kept); offers archiving instead. */
export function WalletDeleteDialog({ wallet, onClose }: { wallet: Wallet | null; onClose: () => void }) {
  const { data, user, profile } = useApp();
  const { track } = useNotify();
  const [sure, setSure] = useState(false), [seen, setSeen] = useState<string | null>(null);
  if ((wallet?.id || null) !== seen) { setSeen(wallet?.id || null); setSure(false); }
  const plan = useMemo(() => wallet ? walletDeletePlan(wallet, data, data.transactions) : null, [wallet, data]);
  if (!wallet || !plan) return null;
  const blocked = plan.blockers.length > 0;
  const archive = () => { if (!user) return; onClose(); track(archiveWallet(user.uid, wallet.id), { pending: 'Mengarsipkan dompet…', success: `${wallet.name} diarsipkan. Lihat di bagian Dompet diarsipkan.`, failure: 'Dompet belum diarsipkan' }); };
  const remove = () => {
    if (!user) return; onClose();
    track(deleteWalletForever(user.uid, wallet, data, profile), { pending: `Menghapus ${wallet.name}…`, success: plan.kept ? `${wallet.name} dihapus. ${plan.kept} transaksinya tetap tersimpan.` : `${wallet.name} dihapus.`, failure: `${wallet.name} belum terhapus` });
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title={`Hapus ${wallet.name}?`}>
      <div className="wallet-delete">
        <div className="wallet-delete-head" style={identityStyle(wallet.color)}><span className="wallet-row-icon"><AppIcon icon={wallet.icon}/></span><span><strong>{wallet.name}</strong><small>Saldo {rupiah(wallet.cachedBalance)}{plan.kept ? ` · ${plan.kept} transaksi` : ''}</small></span></div>
        {blocked ? <div className="wallet-delete-block" role="alert">
          <strong>Belum bisa dihapus</strong>
          <p>Dompet ini masih dipakai {plan.blockers.join(', ')}. Ganti dompet di jadwalnya atau jeda dulu, supaya tidak ada transaksi baru yang masuk ke dompet yang sudah dihapus.</p>
        </div> : <ul className="wallet-delete-list">
          {plan.kept > 0 ? <li><b>{plan.kept} transaksi tetap tersimpan</b> di riwayat dan laporan, dengan nama dompet “{wallet.name} (dihapus)”. Utang, piutang, dan klaim yang terkait juga tetap utuh.</li>
            : <li>Dompet ini belum punya transaksi, jadi langsung dihapus.</li>}
          <li>Dompetnya hilang dari daftar dompet, pilihan dompet, total saldo, dan arsip.</li>
          {wallet.cachedBalance !== 0 && <li>Saldo {rupiah(wallet.cachedBalance)} tidak lagi dihitung di total saldo dan uang bebas.</li>}
          {plan.plans.length > 0 && <li>{plan.plans.length} rencana transaksi jadi tanpa dompet.</li>}
          {plan.funds.length > 0 && <li>{plan.funds.length} tujuan dana atau kantong tidak lagi memakai dompet ini.</li>}
        </ul>}
        {!blocked && plan.kept > 0 && <label className="check-row wallet-delete-sure"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)}/> Hapus dompet ini. Transaksinya tetap disimpan.</label>}
        <div className="wallet-delete-actions">
          {!wallet.isArchived && <Button type="button" variant="secondary" onClick={archive}><Archive size={16}/> Arsipkan saja</Button>}
          <Button type="button" variant="danger" disabled={blocked || (plan.kept > 0 && !sure)} onClick={remove}><Trash2 size={16}/> Hapus dompet</Button>
        </div>
        {!wallet.isArchived && !blocked && <small className="wallet-delete-tip">Arsip menyembunyikan dompet tapi tetap bisa dipulihkan kapan saja dari bagian Dompet diarsipkan.</small>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** Dompet diarsipkan: where archived wallets live, to restore or delete (deleted wallets are not listed). */
export function ArchivedWallets({ onDelete }: { onDelete: (wallet: Wallet) => void }) {
  const { data, user } = useApp();
  const { track } = useNotify();
  const [open, setOpen] = useState(false);
  const archived = data.wallets.filter(w => w.isArchived && !w.isDeleted);
  if (!archived.length) return null;
  return <section className="wallet-archive">
    <button type="button" className="wallet-archive-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Archive size={16} aria-hidden="true"/><span>Dompet diarsipkan <b>{archived.length}</b></span><ChevronDown size={17} className={open ? 'rotated' : ''} aria-hidden="true"/>
    </button>
    {open && <ul className="wallet-archive-list">{archived.map(w => <li key={w.id} style={identityStyle(w.color)}>
      <span className="wallet-row-icon"><AppIcon icon={w.icon}/></span>
      <span className="wallet-archive-text"><strong>{w.name}</strong><small>Saldo {rupiah(w.cachedBalance)} · tidak dihitung di total</small></span>
      <span className="wallet-archive-actions">
        <Button type="button" variant="secondary" className="small" onClick={() => { if (user) track(archiveWallet(user.uid, w.id, false), { pending: 'Memulihkan…', success: `${w.name} kembali ke daftar dompet.`, failure: 'Belum dipulihkan' }); }}><ArchiveRestore size={15}/> Pulihkan</Button>
        <button type="button" className="wallet-archive-delete" aria-label={`Hapus ${w.name}`} title="Hapus dompet" onClick={() => onDelete(w)}><Trash2 size={16}/></button>
      </span>
    </li>)}</ul>}
  </section>;
}
