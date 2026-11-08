'use client';
/** 9.2 Chat grup in a Ruang Bersama (the chat panel's "Grup" tab). Rules: lib/space-chat.ts and firestore.rules. */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, MessagesSquare, Receipt, SendHorizontal, Trash2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { ChatMark } from './chat-mark';
import { Button } from './ui/button';
import { rupiah } from '@/lib/accounting';
import { askedAssistant, deleteMessage, GROUP_KEEP_DAYS, GROUP_MAX, lastRead, markRead, postAnswer, sendText, setViewingGroup, shareTx, subscribeGroup, tidyGroup, unreadCount, type GroupLine, type GroupMessage } from '@/lib/space-chat';
import type { LedgerTx } from '@/lib/types';

export type GroupAnswer = { text: string; title?: string; hero?: { label: string; value: string }; lines?: GroupLine[] };
const ms = (m: GroupMessage) => m.at?.toMillis?.() || Date.now();
const dayKey = (t: number) => new Date(t).toDateString();
const clock = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** The space's group messages (live) and how many are unread, for the tab and the chat button. */
export function useGroup(spaceId: string | undefined, uid: string | undefined) {
  const [list, setList] = useState<GroupMessage[]>([]), [readAt, setReadAt] = useState(0);
  useEffect(() => { setList([]); if (!spaceId || !uid) return; setReadAt(lastRead(uid, spaceId)); return subscribeGroup(spaceId, setList); }, [spaceId, uid]);
  const read = () => { if (!spaceId || !uid) return; const at = Math.max(Date.now(), ...list.map(ms)); markRead(uid, spaceId, at); setReadAt(at); };
  return { list, unread: uid ? unreadCount(list, uid, readAt) : 0, read };
}

export function GroupChat({ list, read, ask, onOpenTx }: { list: GroupMessage[]; read: () => void; ask: (question: string) => Promise<GroupAnswer | null>; onOpenTx: (tx: { id: string; date: string }) => void }) {
  const { space, account, personalProfile, data } = useApp();
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sharing, setSharing] = useState(false), [armed, setArmed] = useState('');
  const listRef = useRef<HTMLDivElement>(null), stick = useRef(true);
  const me = account ? { uid: account.uid, name: personalProfile?.displayName || account.displayName || (account.email || '').split('@')[0] || 'Anggota' } : null;
  useEffect(() => { if (!space) return; setViewingGroup(space.id); void tidyGroup(space.id); return () => setViewingGroup(''); }, [space?.id]);
  // Read while on screen; stays at the bottom unless the person scrolled up.
  useEffect(() => { read(); const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => data.transactions.filter(t => t.type !== 'adjustment').slice(0, 25), [data.transactions]);
  if (!space || !me) return null;
  const catName = (t: LedgerTx) => data.categories.find(c => c.id === (t.subcategoryId || t.categoryId))?.name;
  async function send() {
    const text = draft.trim(); if (!text || busy) return;
    setBusy(true); setError('');
    try {
      await sendText(space!.id, me!, text); setDraft(''); stick.current = true;
      const question = askedAssistant(text);
      if (question !== null) {
        const answer = question ? await ask(question) : { text: 'Halo! Tulis pertanyaannya setelah @asisten, misalnya “@asisten uang bersama berapa?”' };
        if (answer) await postAnswer(space!.id, me!, question || '(sapaan)', answer);
      }
    } catch (e) { setError((e as Error).message || 'Pesan belum terkirim.'); } finally { setBusy(false); }
  }
  async function share(t: LedgerTx) { setSharing(false); try { await shareTx(space!.id, me!, t, catName(t)); stick.current = true; } catch (e) { setError((e as Error).message); } }
  const names = space.memberIds.map(id => space.members[id]?.name).filter(Boolean).join(', ');
  return <>
    <div className="gc-list chat-list" ref={listRef} aria-live="polite" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!list.length && <div className="gc-empty"><strong>Grup {space.name}</strong><p>Ngobrol dengan {names}. Bagikan transaksi untuk didiskusikan, atau tanya asisten dengan <b>@asisten</b>, misalnya “@asisten uang bersama berapa?”. Pesan tersimpan {GROUP_KEEP_DAYS} hari dan hanya terlihat oleh anggota ruang.</p></div>}
      {list.map((m, i) => { const at = ms(m), mine = m.by === me.uid && m.kind !== 'bot', prev = list[i - 1];
        // Several messages in a row from the same person (within 5 minutes) show the name and the initial once.
        const run = Boolean(prev) && prev.by === m.by && prev.kind !== 'bot' && m.kind !== 'bot' && dayKey(ms(prev)) === dayKey(at) && at - ms(prev) < 5 * 60e3;
        return <Fragment key={m.id}>
        {(i === 0 || dayKey(ms(list[i - 1])) !== dayKey(at)) && <div className="chat-day"><span>{dayKey(at) === dayKey(Date.now()) ? 'Hari ini' : dayKey(at) === dayKey(Date.now() - 864e5) ? 'Kemarin' : new Date(at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span></div>}
        <div className={`gc-row ${mine ? 'is-mine' : m.kind === 'bot' ? 'is-bot' : 'is-other'} ${run ? 'is-run' : ''}`}>
          {m.kind === 'bot' ? <span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span> : !mine && <span className={`gc-avatar ${run ? 'is-blank' : ''}`} aria-hidden="true">{(m.byName || '?')[0].toUpperCase()}</span>}
          <div className="gc-msg" onClick={() => m.by === me.uid ? setArmed(a => a === m.id ? '' : m.id) : undefined}>
            {!mine && !run && <span className="gc-name">{m.kind === 'bot' ? `Asisten · untuk ${m.bot?.askedBy || 'anggota'}` : m.byName}</span>}
            {m.kind === 'tx' && m.tx && <button type="button" className="gc-tx" onClick={e => { e.stopPropagation(); onOpenTx(m.tx!); }}><Receipt size={16}/><span><b>{m.tx.title}</b><small>{m.tx.category ? `${m.tx.category} · ` : ''}{m.tx.date.slice(8)}/{m.tx.date.slice(5, 7)}</small></span><strong className={m.tx.type === 'income' ? 'amount-positive' : m.tx.type === 'expense' ? 'amount-negative' : ''}>{m.tx.type === 'income' ? '+' : m.tx.type === 'expense' ? '−' : ''}{rupiah(m.tx.amount)}</strong></button>}
            {m.kind === 'bot' && m.bot?.question && <small className="gc-asked">“{m.bot.question}”</small>}
            {m.text && <div className="gc-bubble">{m.text}</div>}
            {m.kind === 'bot' && (m.bot?.hero || m.bot?.lines?.length) && <div className="gc-figures">{m.bot.hero && <div className="gc-hero"><small>{m.bot.hero.label}</small><b>{m.bot.hero.value}</b></div>}{m.bot.lines?.map(l => <div key={l.label} className="gc-line"><span>{l.label}</span><b>{l.value}</b></div>)}</div>}
            <time className="cm-time">{clock(at)}</time>
            {armed === m.id && <button type="button" className="gc-delete" onClick={e => { e.stopPropagation(); setArmed(''); void deleteMessage(space.id, m.id).catch(err => setError((err as Error).message)); }}><Trash2 size={13}/> Hapus untuk semua</button>}
          </div>
        </div>
      </Fragment>; })}
      {busy && askedAssistant(draft || '') !== null && <div className="cm cm-bot"><span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span><div className="cm-bubble cm-typing" aria-label="Sedang mengetik"><i/><i/><i/></div></div>}
    </div>
    {error && <p className="form-error gc-error" role="alert">{error}</p>}
    {sharing && <div className="gc-share" role="dialog" aria-label="Bagikan transaksi">
      <header><strong>Bagikan transaksi ke grup</strong><button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setSharing(false)}><X size={17}/></button></header>
      {!recent.length ? <p className="muted">Belum ada transaksi di {space.name}.</p> : <ul>{recent.map(t => <li key={t.id}><button type="button" onClick={() => void share(t)}><span><b>{t.description || t.merchant || catName(t) || 'Transaksi'}</b><small>{catName(t) || ''} · {t.date.slice(8)}/{t.date.slice(5, 7)}{t.createdByName ? ` · ${t.createdByName}` : ''}</small></span><strong>{rupiah(t.amount)}</strong></button></li>)}</ul>}
    </div>}
    <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
      <button type="button" className="chat-icon-btn chat-tpl" aria-label="Bagikan transaksi" title="Bagikan transaksi" onClick={() => setSharing(v => !v)}><Receipt size={17}/></button>
      <button type="button" className="chat-icon-btn chat-tpl" aria-label="Tanya asisten" title="Tanya asisten" onClick={() => setDraft(d => d.startsWith('@asisten') ? d : `@asisten ${d}`)}><AtSign size={17}/></button>
      <textarea rows={1} value={draft} maxLength={GROUP_MAX} placeholder={`Pesan ke grup ${space.name}…`} aria-label="Tulis pesan ke grup" enterKeyHint="send" autoComplete="off"
        onChange={e => { setDraft(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(112, e.currentTarget.scrollHeight)}px`; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}/>
      <button type="submit" className="chat-send" aria-label="Kirim" disabled={!draft.trim() || busy}><SendHorizontal size={17}/></button>
    </form>
  </>;
}

/** In a space's transaction: share it to the group to talk about it. */
export function ShareToGroup({ tx, onDone }: { tx: LedgerTx; onDone: (message: string) => void }) {
  const { space, account, personalProfile, data } = useApp();
  const [busy, setBusy] = useState(false);
  if (!space || !account) return null;
  const me = { uid: account.uid, name: personalProfile?.displayName || account.displayName || (account.email || '').split('@')[0] || 'Anggota' };
  const category = data.categories.find(c => c.id === (tx.subcategoryId || tx.categoryId))?.name;
  return <Button variant="secondary" className="full" style={{ marginBottom: 10 }} disabled={busy} onClick={async () => {
    setBusy(true);
    try { await shareTx(space.id, me, tx, category); onDone(`Dibagikan ke grup ${space.name}.`); } catch (e) { onDone((e as Error).message || 'Belum bisa dibagikan.'); } finally { setBusy(false); }
  }}><MessagesSquare size={16}/> Bagikan ke grup</Button>;
}
