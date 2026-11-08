'use client';
/**
 * 9.0 Pribadi ↔ Bersama: the switch in the header. Pribadi is the person's own records (only they see them); a
 * Ruang Bersama is shared with its members. Switching shows the other records everywhere and says which mode it is.
 */
import { useState } from 'react';
import { Check, ChevronDown, Lock, Settings2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Emoji } from './emoji';
import type { Space } from '@/lib/spaces';
import type { LedgerTx } from '@/lib/types';

const lastKey = (uid: string) => `dompet-ajaib:last-space:${uid}`;
function lastSpace(uid: string) { try { return localStorage.getItem(lastKey(uid)) || ''; } catch { return ''; } }

export function SpaceSwitch({ onManage }: { onManage?: () => void }) {
  const { space, spaces, switchTo, account } = useApp();
  const { push } = useNotify();
  const [picking, setPicking] = useState(false);
  if (!account || !spaces.length) return null;
  const remembered = spaces.find(s => s.id === lastSpace(account.uid)) || spaces[0];
  const shown = space || remembered;
  function go(next: Space | null) {
    setPicking(false);
    if ((next?.id || '') === (space?.id || '')) return;
    switchTo(next?.id || null);
    if (next) try { localStorage.setItem(lastKey(account!.uid), next.id); } catch { /* only a convenience */ }
    push(next
      ? { id: 'mode', title: `Sekarang di mode Bersama · ${next.name}`, body: `Yang kamu catat masuk ke ruang ini dan terlihat oleh ${next.memberIds.length > 1 ? `${next.memberIds.length - 1} anggota lain` : 'anggota yang nanti bergabung'}.`, kind: 'info', history: false }
      : { id: 'mode', title: 'Sekarang di mode Pribadi', body: 'Catatan pribadimu. Hanya kamu yang bisa melihatnya.', kind: 'info', history: false });
  }
  return <>
    <div className={`sp-switch ${space ? 'is-shared' : ''}`} role="group" aria-label="Catatan yang ditampilkan">
      <button type="button" className={space ? '' : 'on'} aria-pressed={!space} onClick={() => go(null)} title="Catatan pribadimu"><Lock size={13} aria-hidden="true"/><span>Pribadi</span></button>
      <button type="button" className={space ? 'on' : ''} aria-pressed={Boolean(space)} onClick={() => space ? (spaces.length > 1 && setPicking(true)) : go(remembered)} title={`Ruang Bersama: ${shown.name}`}>
        <Emoji e={shown.emoji || '🏠'}/><span className="sp-name">{shown.name}</span>{spaces.length > 1 && <ChevronDown size={13} aria-hidden="true"/>}
      </button>
    </div>
    <Dialog open={picking} onOpenChange={setPicking}><DialogContent title="Pilih catatan">
      <div className="sp-pick">
        <button type="button" className={`sp-pick-row ${space ? '' : 'on'}`} onClick={() => go(null)}><span className="sp-pick-icon"><Lock size={16}/></span><span className="sp-pick-text"><strong>Pribadi</strong><small>Hanya kamu yang bisa melihat</small></span>{!space && <Check size={18}/>}</button>
        {spaces.map(s => <button type="button" key={s.id} className={`sp-pick-row ${space?.id === s.id ? 'on' : ''}`} onClick={() => go(s)}><span className="sp-pick-icon"><Emoji e={s.emoji || '🏠'}/></span><span className="sp-pick-text"><strong>{s.name}</strong><small>{s.memberIds.length} anggota · {Object.values(s.members).map(m => m.name).slice(0, 3).join(', ')}</small></span>{space?.id === s.id && <Check size={18}/>}</button>)}
        {onManage && <button type="button" className="sp-pick-manage" onClick={() => { setPicking(false); onManage(); }}><Settings2 size={16}/> Kelola Dompet Bersama</button>}
      </div>
    </DialogContent></Dialog>
  </>;
}

/** In the transaction form: where what is being recorded goes. */
export function RecordedTo({ tx }: { tx?: LedgerTx }) {
  const { space } = useApp();
  if (!space) return null;
  if (tx) return <p className="sp-recorded"><Emoji e={space.emoji || '🏠'}/> <span>Di <b>{space.name}</b>{tx.createdByName ? ` · dicatat ${tx.createdByName}` : ''}{tx.updatedByName && tx.updatedBy !== tx.createdBy ? ` · terakhir diubah ${tx.updatedByName}` : ''}</span></p>;
  return <p className="sp-recorded"><Emoji e={space.emoji || '🏠'}/> <span>Dicatat ke <b>{space.name}</b> · terlihat oleh semua anggota</span></p>;
}
