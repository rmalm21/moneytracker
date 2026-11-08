'use client';
/**
 * 9.2 Chat grup in a Ruang Bersama (the chat panel's "Grup" tab). Rules: lib/space-chat.ts and firestore.rules.
 * 9.3 "@" suggests the assistant and the members (a tagged member is notified), a message can be answered with a
 * quote (tap → Balas, or swipe someone's message left or right as in WhatsApp), and your messages show who read them.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AtSign, Check, CheckCheck, Copy, CornerUpLeft, MessagesSquare, Receipt, SendHorizontal, Trash2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { ChatMark } from './chat-mark';
import { Button } from './ui/button';
import { rupiah } from '@/lib/accounting';
import {
  askedAssistant, deleteMessage, GROUP_KEEP_DAYS, GROUP_MAX, lastRead, markRead, markReadForAll, mentionQuery, mentionsIn, postAnswer, quoteOf,
  readersOf, sendText, setViewingGroup, shareTx, splitMentions, subscribeGroup, subscribeReads, suggestionFits, tidyGroup, unreadCount,
  type GroupLine, type GroupMessage,
} from '@/lib/space-chat';
import type { LedgerTx } from '@/lib/types';

export type GroupAnswer = { text: string; title?: string; hero?: { label: string; value: string }; lines?: GroupLine[] };
const ms = (m: GroupMessage) => m.at?.toMillis?.() || Date.now();
const dayKey = (t: number) => new Date(t).toDateString();
const clock = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const list3 = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}`;

/** Who is writing: the person's own name (not the space's). */
function useMe() {
  const { account, personalProfile } = useApp();
  return useMemo(() => account ? { uid: account.uid, name: personalProfile?.displayName || account.displayName || (account.email || '').split('@')[0] || 'Anggota' } : null,
    [account, personalProfile?.displayName]);
}

/** The space's group messages and read marks (live), how many are unread, and "read now" (this device and for the others). */
export function useGroup(spaceId: string | undefined) {
  const me = useMe(), uid = me?.uid;
  const [list, setList] = useState<GroupMessage[]>([]), [reads, setReads] = useState<Record<string, number>>({}), [readAt, setReadAt] = useState(0);
  const writing = useRef(false);
  useEffect(() => {
    setList([]); setReads({}); if (!spaceId || !uid) return;
    setReadAt(lastRead(uid, spaceId));
    const stopList = subscribeGroup(spaceId, setList), stopReads = subscribeReads(spaceId, setReads);
    return () => { stopList(); stopReads(); };
  }, [spaceId, uid]);
  const read = () => {
    if (!spaceId || !me || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
    const at = Math.max(Date.now(), ...list.map(ms)); markRead(me.uid, spaceId, at); setReadAt(at);
    // The others see "dibaca" once this person has seen their newest message (one small write, only when needed).
    const newest = Math.max(0, ...list.filter(m => m.by !== me.uid && m.at).map(ms));
    if (newest > (reads[me.uid] || 0) && !writing.current) { writing.current = true; void markReadForAll(spaceId, me).catch(() => {}).finally(() => { writing.current = false; }); }
  };
  return { list, reads, unread: uid ? unreadCount(list, uid, Math.max(readAt, reads[uid] || 0)) : 0, read };
}

/** Swipe a message sideways (touch) to answer it, as in WhatsApp. */
function useSwipe(onReply: () => void, enabled: boolean) {
  const row = useRef<HTMLDivElement>(null), slide = useRef<HTMLDivElement>(null), moved = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; on: boolean } | null>(null);
  const show = (dx: number, animate: boolean) => {
    const s = slide.current, r = row.current; if (!s || !r) return;
    s.style.transition = animate ? 'transform .2s ease' : 'none'; s.style.transform = dx ? `translateX(${dx}px)` : '';
    r.style.setProperty('--swipe', String(Math.min(1, Math.abs(dx) / 52))); r.dataset.dir = dx < 0 ? 'left' : dx > 0 ? 'right' : '';
  };
  const handlers = enabled ? {
    onPointerDown: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false }; moved.current = false; },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current; if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
        if (Math.abs(dx) < 10) return;
        d.on = true; moved.current = true; try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* the pointer already ended */ }
      }
      d.dx = Math.max(-72, Math.min(72, dx)); show(d.dx, false);
    },
    onPointerUp: () => { const d = drag.current; drag.current = null; if (!d?.on) return; if (Math.abs(d.dx) >= 52) { onReply(); navigator.vibrate?.(8); } show(0, true); },
    onPointerCancel: () => { drag.current = null; show(0, true); },
  } : {};
  return { row, slide, moved, handlers };
}

type Others = { uid: string; name: string }[];
type RowProps = {
  m: GroupMessage; me: { uid: string; name: string }; run: boolean; armed: boolean; seen: string | null;
  readers: string[]; others: Others; names: string[]; onArm: () => void; onReply: () => void; onDelete: () => void; onCopy: () => void;
  onJump: (id: string) => void; onOpenTx: (tx: { id: string; date: string }) => void;
};
function GroupRow({ m, me, run, armed, seen, readers, others, names, onArm, onReply, onDelete, onCopy, onJump, onOpenTx }: RowProps) {
  const mine = m.by === me.uid && m.kind !== 'bot', at = ms(m);
  const { row, slide, moved, handlers } = useSwipe(onReply, !mine);
  const tagMe = (t: string) => [me.name, first(me.name)].some(n => t.slice(1).toLocaleLowerCase('id-ID') === n.toLocaleLowerCase('id-ID'));
  const readAll = others.length > 0 && readers.length >= others.length;
  const readName = (id: string) => others.find(o => o.uid === id)?.name || 'Anggota';
  return <div ref={row} data-id={m.id} className={`gc-row ${mine ? 'is-mine' : m.kind === 'bot' ? 'is-bot' : 'is-other'} ${run ? 'is-run' : ''} ${m.mentions?.includes(me.uid) ? 'is-tagged' : ''}`} {...handlers}>
    {!mine && <span className="gc-swipe-ico is-l" aria-hidden="true"><CornerUpLeft size={16}/></span>}
    <div className="gc-slide" ref={slide}>
      {m.kind === 'bot' ? <span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span> : !mine && <span className={`gc-avatar ${run ? 'is-blank' : ''}`} aria-hidden="true">{(m.byName || '?')[0].toUpperCase()}</span>}
      <div className="gc-msg" onClick={() => { if (moved.current) { moved.current = false; return; } onArm(); }}>
        {!mine && !run && <span className="gc-name">{m.kind === 'bot' ? `Asisten · untuk ${m.bot?.askedBy || 'anggota'}` : m.byName}</span>}
        {m.replyTo && <button type="button" className="gc-quote" onClick={e => { e.stopPropagation(); onJump(m.replyTo!.id); }}>
          <b>{m.replyTo.by === me.uid && m.replyTo.kind !== 'bot' ? 'Kamu' : m.replyTo.byName}</b><span>{m.replyTo.text || 'Pesan'}</span>
        </button>}
        {m.kind === 'tx' && m.tx && <button type="button" className="gc-tx" onClick={e => { e.stopPropagation(); onOpenTx(m.tx!); }}><Receipt size={16}/><span><b>{m.tx.title}</b><small>{m.tx.category ? `${m.tx.category} · ` : ''}{m.tx.date.slice(8)}/{m.tx.date.slice(5, 7)}</small></span><strong className={m.tx.type === 'income' ? 'amount-positive' : m.tx.type === 'expense' ? 'amount-negative' : ''}>{m.tx.type === 'income' ? '+' : m.tx.type === 'expense' ? '−' : ''}{rupiah(m.tx.amount)}</strong></button>}
        {m.kind === 'bot' && m.bot?.question && <small className="gc-asked">“{m.bot.question}”</small>}
        {m.text && <div className="gc-bubble">{splitMentions(m.text, names).map((p, i) => p.tag ? <b key={i} className={`gc-tag ${tagMe(p.text) ? 'is-me' : ''}`}>{p.text}</b> : <Fragment key={i}>{p.text}</Fragment>)}</div>}
        {m.kind === 'bot' && (m.bot?.hero || m.bot?.lines?.length) && <div className="gc-figures">{m.bot.hero && <div className="gc-hero"><small>{m.bot.hero.label}</small><b>{m.bot.hero.value}</b></div>}{m.bot.lines?.map(l => <div key={l.label} className="gc-line"><span>{l.label}</span><b>{l.value}</b></div>)}</div>}
        <span className="gc-meta"><time className="cm-time">{clock(at)}</time>{mine && <span className={`gc-ticks ${readAll ? 'is-read' : readers.length ? 'is-some' : ''}`} aria-label={readAll ? 'Dibaca' : readers.length ? `Dibaca ${list3(readers.map(readName))}` : 'Terkirim'}>{readers.length ? <CheckCheck size={14}/> : <Check size={14}/>}</span>}</span>
        {seen && !armed && <small className="gc-seen">{seen}</small>}
        {armed && <div className="gc-actions" onClick={e => e.stopPropagation()}>
          {mine && <small className="gc-readinfo">{others.length === 0 ? 'Belum ada anggota lain.' : readAll ? (others.length === 1 ? `Dibaca ${others[0].name}` : 'Dibaca semua anggota') : readers.length ? `Dibaca ${list3(readers.map(readName))} · belum: ${list3(others.filter(o => !readers.includes(o.uid)).map(o => o.name))}` : `Belum dibaca ${list3(others.map(o => o.name))}`}</small>}
          <button type="button" onClick={onReply}><CornerUpLeft size={14}/> Balas</button>
          {m.text && <button type="button" onClick={onCopy}><Copy size={14}/> Salin</button>}
          {m.by === me.uid && <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={14}/> Hapus untuk semua</button>}
        </div>}
      </div>
    </div>
    {!mine && <span className="gc-swipe-ico is-r" aria-hidden="true"><CornerUpLeft size={16}/></span>}
  </div>;
}

export function GroupChat({ list, reads, read, ask, onOpenTx }: { list: GroupMessage[]; reads: Record<string, number>; read: () => void; ask: (question: string) => Promise<GroupAnswer | null>; onOpenTx: (tx: { id: string; date: string }) => void }) {
  const { space, data } = useApp();
  const me = useMe();
  const [draft, setDraft] = useState(''), [caret, setCaret] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false), [armed, setArmed] = useState(''), [reply, setReply] = useState<GroupMessage | null>(null), [pick, setPick] = useState(0), [hideSugg, setHideSugg] = useState(false);
  const listRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), stick = useRef(true);
  useEffect(() => { if (!space) return; setViewingGroup(space.id); void tidyGroup(space.id); return () => setViewingGroup(''); }, [space?.id]);
  // Read while on screen (and again when the app comes back to the front); stays at the bottom unless scrolled up.
  useEffect(() => { read(); const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => { if (document.visibilityState === 'visible') read(); }; document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on); });
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(''), 2200); return () => window.clearTimeout(t); }, [note]);
  const recent = useMemo(() => data.transactions.filter(t => t.type !== 'adjustment').slice(0, 25), [data.transactions]);
  const others: Others = useMemo(() => (space?.memberIds || []).filter(id => id !== me?.uid).map(id => ({ uid: id, name: space?.members[id]?.name || '' })).filter(o => o.name), [space, me?.uid]);
  const names = useMemo(() => (space?.memberIds || []).map(id => space?.members[id]?.name || '').filter(Boolean), [space]);
  // "@…" being typed: the assistant first, then the members (whose name starts with or contains what was typed).
  const query = hideSugg ? null : mentionQuery(draft, caret);
  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.query, sameFirst = (o: Others[number]) => others.filter(x => first(x.name).toLocaleLowerCase('id-ID') === first(o.name).toLocaleLowerCase('id-ID')).length > 1;
    const all = [{ key: 'asisten', label: 'Asisten', hint: 'Tanya soal uang di ruang ini', insert: 'asisten', bot: true, words: ['asisten', 'assistant', 'bot', 'dompet'] },
      ...others.map(o => ({ key: o.uid, label: o.name, hint: 'Tandai, dia dapat notifikasi', insert: sameFirst(o) ? o.name : first(o.name), bot: false, words: [o.name] }))];
    return all.filter(s => suggestionFits(q, s.words));
  }, [query?.query, query?.start, others]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!space || !me) return null;
  const catName = (t: LedgerTx) => data.categories.find(c => c.id === (t.subcategoryId || t.categoryId))?.name;
  const lastMine = [...list].reverse().find(m => m.by === me.uid && m.kind !== 'bot')?.id;

  function focusAt(pos: number) { window.requestAnimationFrame(() => { const el = inputRef.current; if (!el) return; el.focus(); el.setSelectionRange(pos, pos); setCaret(pos); }); }
  function choose(s: { insert: string }) {
    if (!query) return;
    const before = draft.slice(0, query.start), after = draft.slice(caret).replace(/^\S*/, '');
    const next = `${before}@${s.insert} ${after.replace(/^\s+/, '')}`;
    setDraft(next); setPick(0); focusAt(before.length + s.insert.length + 2);
  }
  function startReply(m: GroupMessage) { setArmed(''); setReply(m); focusAt(draft.length); }
  function jump(id: string) {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) { setNote('Pesan itu sudah tidak ada.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-flash'); window.setTimeout(() => el.classList.remove('is-flash'), 1300);
  }
  async function send() {
    const text = draft.trim(); if (!text || busy) return;
    setBusy(true); setError('');
    try {
      await sendText(space!.id, me!, text, { replyTo: reply ? quoteOf(reply) : null, mentions: mentionsIn(text, others) });
      setDraft(''); setCaret(0); setReply(null); stick.current = true;
      const question = askedAssistant(text);
      if (question !== null) {
        const answer = question ? await ask(question) : { text: 'Halo! Tulis pertanyaannya setelah @asisten, misalnya “@asisten pengeluaran bulan ini berapa?”' };
        if (answer) await postAnswer(space!.id, me!, question || '(sapaan)', answer);
      }
    } catch (e) { setError((e as Error).message || 'Pesan belum terkirim.'); } finally { setBusy(false); }
  }
  async function share(t: LedgerTx) { setSharing(false); try { await shareTx(space!.id, me!, t, catName(t)); stick.current = true; } catch (e) { setError((e as Error).message); } }
  const seenLabel = (m: GroupMessage) => {
    const readers = readersOf(ms(m), me.uid, space.memberIds, reads);
    if (!others.length) return null;
    if (readers.length >= others.length) return others.length === 1 ? 'Dibaca' : 'Dibaca semua';
    return readers.length ? `Dibaca ${list3(readers.map(id => first(others.find(o => o.uid === id)?.name || '')))}` : 'Terkirim';
  };
  return <>
    <div className="gc-list chat-list" ref={listRef} aria-live="polite" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!list.length && <div className="gc-empty"><strong>Grup {space.name}</strong><p>Ngobrol dengan {list3(names)}. Ketik <b>@</b> untuk menandai anggota atau bertanya ke asisten, misalnya “@asisten pengeluaran bulan ini berapa?”. Bagikan transaksi lewat tombol struk. Pesan tersimpan {GROUP_KEEP_DAYS} hari dan hanya terlihat oleh anggota ruang.</p></div>}
      {list.map((m, i) => {
        const at = ms(m), prev = list[i - 1];
        // Several messages in a row from the same person (within 5 minutes) show the name and the initial once.
        const run = Boolean(prev) && prev.by === m.by && prev.kind !== 'bot' && m.kind !== 'bot' && !m.replyTo && dayKey(ms(prev)) === dayKey(at) && at - ms(prev) < 5 * 60e3;
        const mine = m.by === me.uid && m.kind !== 'bot';
        return <Fragment key={m.id}>
          {(i === 0 || dayKey(ms(list[i - 1])) !== dayKey(at)) && <div className="chat-day"><span>{dayKey(at) === dayKey(Date.now()) ? 'Hari ini' : dayKey(at) === dayKey(Date.now() - 864e5) ? 'Kemarin' : new Date(at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span></div>}
          <GroupRow m={m} me={me} run={run} armed={armed === m.id} seen={mine && m.id === lastMine ? seenLabel(m) : null} readers={mine ? readersOf(at, me.uid, space.memberIds, reads) : []}
            others={others} names={names} onArm={() => setArmed(a => a === m.id ? '' : m.id)} onReply={() => startReply(m)} onJump={jump} onOpenTx={onOpenTx}
            onCopy={() => { setArmed(''); void navigator.clipboard?.writeText(m.text).then(() => setNote('Disalin.'), () => setNote('Belum bisa menyalin.')); }}
            onDelete={() => { setArmed(''); void deleteMessage(space.id, m.id).catch(err => setError((err as Error).message)); }}/>
        </Fragment>;
      })}
      {busy && askedAssistant(draft || '') !== null && <div className="cm cm-bot"><span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span><div className="cm-bubble cm-typing" aria-label="Sedang mengetik"><i/><i/><i/></div></div>}
    </div>
    {note && <div className="chat-undo is-copied gc-note" role="status"><Check size={14} aria-hidden="true"/><span>{note}</span></div>}
    {error && <p className="form-error gc-error" role="alert">{error}</p>}
    {sharing && <div className="gc-share" role="dialog" aria-label="Bagikan transaksi">
      <header><strong>Bagikan transaksi ke grup</strong><button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setSharing(false)}><X size={17}/></button></header>
      {!recent.length ? <p className="muted">Belum ada transaksi di {space.name}.</p> : <ul>{recent.map(t => <li key={t.id}><button type="button" onClick={() => void share(t)}><span><b>{t.description || t.merchant || catName(t) || 'Transaksi'}</b><small>{catName(t) || ''} · {t.date.slice(8)}/{t.date.slice(5, 7)}{t.createdByName ? ` · ${t.createdByName}` : ''}</small></span><strong>{rupiah(t.amount)}</strong></button></li>)}</ul>}
    </div>}
    {suggestions.length > 0 && <ul className="gc-suggest" role="listbox" aria-label="Tandai">
      {suggestions.map((s, i) => <li key={s.key} role="option" aria-selected={i === pick}><button type="button" className={i === pick ? 'on' : ''} onPointerDown={e => e.preventDefault()} onClick={() => choose(s)}>
        {s.bot ? <span className="cm-avatar" aria-hidden="true"><ChatMark size={13}/></span> : <span className="gc-avatar" aria-hidden="true">{s.label[0].toUpperCase()}</span>}
        <span><b>{s.bot ? '@asisten' : s.label}</b><small>{s.hint}</small></span>
      </button></li>)}
    </ul>}
    {reply && <div className="gc-replybar"><CornerUpLeft size={15} aria-hidden="true"/><span><b>Membalas {reply.by === me.uid && reply.kind !== 'bot' ? 'pesanmu' : reply.kind === 'bot' ? 'Asisten' : reply.byName}</b><small>{quoteOf(reply).text || 'Pesan'}</small></span><button type="button" className="chat-icon-btn" aria-label="Batal membalas" onClick={() => setReply(null)}><X size={15}/></button></div>}
    <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
      <button type="button" className="chat-icon-btn chat-tpl" aria-label="Bagikan transaksi" title="Bagikan transaksi" onClick={() => setSharing(v => !v)}><Receipt size={17}/></button>
      <button type="button" className="chat-icon-btn chat-tpl" aria-label="Tandai anggota atau asisten" title="Tandai (@)" onClick={() => { const at = inputRef.current?.selectionStart ?? draft.length, pre = draft.slice(0, at), add = pre && !/\s$/.test(pre) ? ' @' : '@'; setDraft(`${pre}${add}${draft.slice(at)}`); setHideSugg(false); focusAt(at + add.length); }}><AtSign size={17}/></button>
      <textarea ref={inputRef} rows={1} value={draft} maxLength={GROUP_MAX} placeholder={`Pesan ke grup ${space.name}…`} aria-label="Tulis pesan ke grup" enterKeyHint="send" autoComplete="off"
        onChange={e => { setDraft(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setHideSugg(false); setPick(0); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(112, e.currentTarget.scrollHeight)}px`; }}
        onSelect={e => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={e => {
          if (suggestions.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setPick(p => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length); return; }
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); choose(suggestions[Math.min(pick, suggestions.length - 1)]); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setHideSugg(true); return; }
          }
          if (e.key === 'Escape' && reply) { e.preventDefault(); e.stopPropagation(); setReply(null); return; }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
        }}/>
      <button type="submit" className="chat-send" aria-label="Kirim" disabled={!draft.trim() || busy}><SendHorizontal size={17}/></button>
    </form>
  </>;
}

/** In a space's transaction: share it to the group to talk about it. */
export function ShareToGroup({ tx, onDone }: { tx: LedgerTx; onDone: (message: string) => void }) {
  const { space, data } = useApp();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  if (!space || !me) return null;
  const category = data.categories.find(c => c.id === (tx.subcategoryId || tx.categoryId))?.name;
  return <Button variant="secondary" className="full" style={{ marginBottom: 10 }} disabled={busy} onClick={async () => {
    setBusy(true);
    try { await shareTx(space.id, me, tx, category); onDone(`Dibagikan ke grup ${space.name}.`); } catch (e) { onDone((e as Error).message || 'Belum bisa dibagikan.'); } finally { setBusy(false); }
  }}><MessagesSquare size={16}/> Bagikan ke grup</Button>;
}
