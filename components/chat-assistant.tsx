'use client';
/**
 * 7.6 Asisten chat: a small round button above the bottom bar opens a chat with the on-device assistant
 * (lib/chat/engine.ts). Every reply sits in the same bubble: text, figures, and the cards of Catat otomatis (records,
 * answers, changes) inside it. Five looks, four ways of talking, templates that fold away, history on this device for
 * 7 days (or 14 days / 1 month), ten messages at a time.
 * 7.7: answers are cards (a big figure, figure tiles, bars, numbered steps) coloured by what they are, and messages can be
 * picked (long press, right click, or from the settings) to copy or delete, with "Urungkan" for a few seconds.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Banknote, BookOpen, Gamepad2, Brain, Calculator, CalendarClock, ChartPie, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronUp, Copy, HeartHandshake, LayoutGrid, Lightbulb, ListChecks, MessageCircle, MessageCircleQuestion, PenLine, PiggyBank, SendHorizontal, ShoppingBag, SlidersHorizontal, Smile, Sparkles, StickyNote, Tag, Target, Trash2, Undo2, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { QuickEntryBox } from './quick-entry';
import { chatReply, templatesFor, type ChatContext, type ChatMemory, type ChatReply, type SayCard, type TemplateGroup } from '@/lib/chat/engine';
import { inspect } from '@/lib/chat/inspect';
import { suggestFor, type Suggestion, type SuggestIcon } from '@/lib/chat/suggest';
import { VOICES } from '@/lib/chat/voice';
import { CHAT_STYLES, DEFAULT_SETTINGS, KEEP_OPTIONS, PAGE, clearChat, learnPhrase, loadChat, loadSettings, page, saveChat, saveSettings, type ChatMessage, type ChatSettings, type ChatStatus, type ChatStyle } from '@/lib/chat/store';
import { dateInTimeZone, timeInTimeZone, todayInTimeZone } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

const uid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clock = (at: number) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const dayKey = (at: number) => new Date(at).toLocaleDateString('en-CA');
const STATUS_TEXT: Partial<Record<ChatStatus, string>> = { dismissed: 'Tidak jadi dicatat.', replaced: 'Diganti dengan yang di bawah.', form: 'Dilanjutkan di formulir.' };
/** Each template group: its icon and colour. */
const GROUP_LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  catat: { icon: PenLine, tone: 'teal' }, patungan: { icon: Users, tone: 'violet' }, kategori: { icon: ChartPie, tone: 'amber' }, hitung: { icon: Calculator, tone: 'blue' },
  tanya: { icon: MessageCircleQuestion, tone: 'pink' }, saran: { icon: Lightbulb, tone: 'green' }, ngobrol: { icon: Smile, tone: 'violet' }, menu: { icon: LayoutGrid, tone: 'teal' }, main: { icon: Gamepad2, tone: 'amber' }, fitur: { icon: BookOpen, tone: 'blue' }, ubah: { icon: Undo2, tone: 'slate' }, rencana: { icon: CalendarClock, tone: 'orange' },
};
/** 7.9 Each suggestion above the message box: its icon and colour. */
const SUGGEST_LOOK: Record<SuggestIcon, { icon: LucideIcon; tone: string }> = {
  date: { icon: CalendarClock, tone: 'orange' }, wallet: { icon: Wallet, tone: 'teal' }, amount: { icon: Banknote, tone: 'teal' }, note: { icon: StickyNote, tone: 'amber' }, category: { icon: Tag, tone: 'amber' },
  cancel: { icon: X, tone: 'slate' }, undo: { icon: Undo2, tone: 'slate' }, record: { icon: PenLine, tone: 'teal' }, ask: { icon: MessageCircleQuestion, tone: 'pink' }, calc: { icon: Calculator, tone: 'blue' },
  chart: { icon: ChartPie, tone: 'green' }, budget: { icon: PiggyBank, tone: 'green' }, payday: { icon: CalendarClock, tone: 'orange' }, tips: { icon: Lightbulb, tone: 'amber' }, fun: { icon: Smile, tone: 'violet' },
  yes: { icon: Check, tone: 'green' }, no: { icon: X, tone: 'slate' }, help: { icon: Sparkles, tone: 'slate' },
};
/** Each answer card: its icon and colour. */
const CARD_LOOK: Record<SayCard, { icon: LucideIcon; tone: string }> = {
  summary: { icon: ChartPie, tone: 'teal' }, afford: { icon: ShoppingBag, tone: 'violet' }, tips: { icon: Lightbulb, tone: 'amber' }, calc: { icon: Calculator, tone: 'blue' },
  budget: { icon: PiggyBank, tone: 'green' }, payday: { icon: CalendarClock, tone: 'orange' }, mood: { icon: HeartHandshake, tone: 'pink' }, goal: { icon: Target, tone: 'green' },
  help: { icon: Sparkles, tone: 'slate' }, talk: { icon: MessageCircle, tone: 'slate' },
};
/** A message as plain text (copying). */
const plainText = (m: ChatMessage) => m.role === 'user' ? m.text : [m.text, m.reply?.kind === 'plan' ? m.status === 'saved' ? m.summary : `“${m.reply.text}”` : ''].filter(Boolean).join(' ');

/** The assistant's mark: a speech bubble with a spark, drawn for the round button. */
function ChatMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3.2c-4.9 0-8.8 3.4-8.8 7.7 0 2.3 1.1 4.3 2.9 5.7l-.6 3.2c-.1.5.4.9.9.6l3.4-1.8c.7.2 1.4.2 2.2.2 4.9 0 8.8-3.4 8.8-7.7S16.9 3.2 12 3.2Z" fill="currentColor" opacity=".22"/>
    <path d="M12 3.2c-4.9 0-8.8 3.4-8.8 7.7 0 2.3 1.1 4.3 2.9 5.7l-.6 3.2c-.1.5.4.9.9.6l3.4-1.8c.7.2 1.4.2 2.2.2 4.9 0 8.8-3.4 8.8-7.7S16.9 3.2 12 3.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M12 7.4c.3 1.6 1.1 2.4 2.7 2.7-1.6.3-2.4 1.1-2.7 2.7-.3-1.6-1.1-2.4-2.7-2.7 1.6-.3 2.4-1.1 2.7-2.7Z" fill="currentColor"/>
    <circle cx="16.4" cy="13.2" r="1" fill="currentColor"/>
  </svg>;
}

export function ChatLauncher({ openTx, navigate }: { openTx: (preset?: Partial<LedgerTx>) => void; navigate: (key: string, target?: string) => void }) {
  const { user, data, profile, cycle } = useApp();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([]), [memory, setMemory] = useState<ChatMemory>({});
  const [loaded, setLoaded] = useState(false), [shown, setShown] = useState(PAGE), [draft, setDraft] = useState(''), [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<null | 'templates' | 'settings' | 'style'>(null), [confirmClear, setConfirmClear] = useState(false);
  // Picking messages to copy or delete, and what was just deleted (for "Urungkan").
  const [picked, setPicked] = useState<Set<string> | null>(null), [undo, setUndo] = useState<{ removed: ChatMessage[]; memory: ChatMemory } | null>(null), [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), timer = useRef<number | undefined>(undefined), sheetRef = useRef(sheet), busy = useRef(false);
  const pickRef = useRef(picked), hold = useRef<{ x: number; y: number; t: number } | null>(null), swallow = useRef(false);
  sheetRef.current = sheet; pickRef.current = picked;

  // History and settings of this account, on this device.
  useEffect(() => {
    if (!user) { setLoaded(false); return; }
    const s = loadSettings(user.uid), h = loadChat(user.uid, s.keepDays);
    setSettings(s); setMessages(h.messages); setMemory(h.memory); setLoaded(true);
  }, [user]);
  useEffect(() => { if (user && loaded) saveChat(user.uid, messages, memory, settings.keepDays); }, [user, loaded, messages, memory, settings.keepDays]);
  const changeSettings = useCallback((patch: Partial<ChatSettings>) => setSettings(s => { const next = { ...s, ...patch }; if (user) saveSettings(user.uid, next); return next; }), [user]);

  const today = todayInTimeZone(profile?.timeZone);
  const quick = useMemo(() => ({ wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, budgets: data.budgets, salaryDay: profile?.salaryCycleStartDay, now: timeInTimeZone(profile?.timeZone), plans: data.plannedTransactions, recurring: data.recurring, nowMs: Date.now(), ask: { transactions: data.transactions, wallets: data.wallets, budgets: data.budgets } }), [data, today, profile?.salaryCycleStartDay, profile?.timeZone]);
  const templates = useMemo(() => templatesFor(data.wallets), [data.wallets]);
  const classify = useCallback(async (text: string) => (await import('@/lib/chat/model')).classifyChat(text), []);
  const chatCtx = useMemo<ChatContext>(() => ({ data, today, salaryDay: profile?.salaryCycleStartDay || 24, cycle: { start: cycle.start, end: cycle.end }, quick, inspect: text => inspect(text, quick), classify, name: (profile?.displayName || profile?.username || '').split(' ')[0], hour: dateInTimeZone(new Date(), profile?.timeZone).getHours(), voice: settings.voice, learned: settings.learned }), [data, today, profile, cycle.start, cycle.end, quick, classify, settings.voice, settings.learned]);

  // Opening: the latest ten, the model warmed up, the style asked once.
  useEffect(() => {
    if (!open) return;
    setShown(PAGE); setSheet(s => s || (settings.picked ? null : 'style'));
    if (!settings.seen) changeSettings({ seen: true });
    void import('@/lib/chat/model').then(m => m.loadChatModel()).catch(() => {});
    // The message box is focused only with a mouse or trackpad: on a phone the keyboard waits for a tap.
    const t = window.setTimeout(() => { if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true }); }, 220);
    // Escape closes what is on top: a sheet first, then the chat (a form opened from the chat handles its own Escape).
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape' || document.querySelector('.modal-overlay')) return; if (pickRef.current) setPicked(null); else if (sheetRef.current) setSheet(null); else setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // The latest message stays in view: cards that finish drawing later (Catat otomatis) grow the list, so it keeps to the
  // bottom until the person scrolls up.
  const stick = useRef(true);
  useEffect(() => {
    const el = listRef.current; if (!el || !open) return;
    stick.current = true; el.scrollTop = el.scrollHeight;
    const keep = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    for (const child of Array.from(el.children)) keep.observe(child);
    return () => keep.disconnect();
  }, [messages.length, typing, open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!open) { setPicked(null); setUndo(null); } }, [open]);
  useEffect(() => { if (!undo) return; const t = window.setTimeout(() => setUndo(null), 6000); return () => window.clearTimeout(t); }, [undo]);
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(t); }, [copied]);
  const modal = open && ['lembar', 'penuh', 'samping'].includes(settings.style);
  useEffect(() => { document.documentElement.classList.toggle('chat-locked', modal); return () => document.documentElement.classList.remove('chat-locked'); }, [modal]);

  const mark = useCallback((id: string, status: ChatStatus, summary?: string) => setMessages(list => list.map(m => m.id === id ? { ...m, status, ...(summary ? { summary } : {}) } : m)), []);
  async function send(text: string) {
    const t = text.trim();
    if (!t || busy.current) return;
    busy.current = true;
    setDraft(''); if (inputRef.current) inputRef.current.style.height = '';
    const userMsg: ChatMessage = { id: uid(), at: Date.now(), role: 'user', text: t };
    setMessages(list => [...list, userMsg]); setTyping(true);
    const started = Date.now();
    const result = await chatReply(t, memory, chatCtx).catch(() => null);
    if (!result) { busy.current = false; setTyping(false); return; }
    if (result.setVoice) changeSettings({ voice: result.setVoice });
    if (result.learn) changeSettings({ learned: learnPhrase(settings.learned, result.learn.phrase, result.learn.as) });
    // A change or a cancel takes the place of the card waiting to be saved.
    const waiting = memory.plan?.status === 'pending' ? memory.plan.text : null;
    const replaced = result.dismiss ? 'dismissed' : (result.intent === 'edit' || result.intent === 'fill') && result.reply.kind === 'plan' && !result.reply.text.startsWith('ubah transaksi') ? 'replaced' : null;
    if (replaced && waiting) setMessages(list => list.map(m => m.role === 'bot' && m.status === 'pending' && m.reply?.kind === 'plan' && m.reply.text === waiting ? { ...m, status: replaced as ChatStatus } : m));
    setMemory(result.memory);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setMessages(list => [...list, { id: uid(), at: Date.now(), role: 'bot', text: result.reply.kind === 'say' ? result.reply.text : result.reply.intro || '', reply: result.reply, ...(result.reply.kind === 'plan' ? { status: 'pending' as const } : {}), ...(result.intent === 'question' || result.intent === 'followup' ? { asked: true } : {}) }]);
      setTyping(false); busy.current = false;
    }, Math.max(0, 280 + Math.min(420, t.length * 5) - (Date.now() - started)));
  }
  function saved(id: string, planText: string, summary: string) {
    mark(id, 'saved', summary);
    setMemory(m => m.plan?.text === planText ? { ...m, plan: { ...m.plan, status: 'saved' } } : m);
  }
  function submit(e: FormEvent) { e.preventDefault(); void send(draft); }

  // Picking: a long press or a right click starts it on that message; then a tap adds or removes one.
  function startPick(id: string) { setPicked(new Set([id])); setSheet(null); setUndo(null); try { navigator.vibrate?.(10); } catch { /* not supported */ } }
  const togglePick = (id: string) => setPicked(set => { if (!set) return set; const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  function removePicked() {
    if (!picked?.size) return;
    const removed = messages.filter(m => picked.has(m.id)), left = messages.filter(m => !picked.has(m.id));
    // A card waiting to be saved goes with its message: the conversation no longer refers to it.
    const plan = memory.plan, gone = plan?.status === 'pending' && !left.some(m => m.status === 'pending' && m.reply?.kind === 'plan' && m.reply.text === plan.text);
    setUndo({ removed, memory });
    setMessages(left); setMemory(!left.length ? {} : gone ? { ...memory, plan: { ...plan!, status: 'dismissed' }, asking: undefined } : memory); setPicked(null);
  }
  function undoRemove() { if (!undo) return; setMessages(list => [...list, ...undo.removed].sort((a, b) => a.at - b.at)); setMemory(undo.memory); setUndo(null); }
  async function copyPicked() {
    const text = messages.filter(m => picked?.has(m.id)).map(m => `${m.role === 'user' ? 'Kamu' : 'Asisten'}: ${plainText(m)}`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard blocked */ }
    setPicked(null);
  }
  const rowProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (pickRef.current || e.pointerType === 'mouse' && e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, textarea, select, label')) return;
      hold.current = { x: e.clientX, y: e.clientY, t: window.setTimeout(() => { hold.current = null; swallow.current = true; startPick(id); }, 480) };
    },
    onPointerMove: (e: React.PointerEvent) => { const h = hold.current; if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.t); hold.current = null; } },
    onPointerUp: () => { if (hold.current) { window.clearTimeout(hold.current.t); hold.current = null; } },
    onPointerCancel: () => { if (hold.current) { window.clearTimeout(hold.current.t); hold.current = null; } },
    onContextMenu: (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select')) return; e.preventDefault(); if (pickRef.current) togglePick(id); else startPick(id); },
    onClickCapture: (e: React.MouseEvent) => { if (swallow.current) { swallow.current = false; e.preventDefault(); e.stopPropagation(); return; } if (pickRef.current) { e.preventDefault(); e.stopPropagation(); togglePick(id); } },
  });
  function go(key: string, target?: string) { setOpen(false); navigate(key, target); }

  // 7.9 What to suggest above the message box: what fits this moment, with a clear label (lib/chat/suggest.ts).
  const lastReply = useMemo(() => [...messages].reverse().find(m => m.role === 'bot')?.reply, [messages]);
  const suggestions = useMemo(() => suggestFor(memory, chatCtx, lastReply), [memory, chatCtx, lastReply]);
  /** A suggestion sends its message, or puts the start of one in the message box to finish. */
  function pickSuggestion(s: Suggestion) {
    if (s.text) { void send(s.text); return; }
    const el = inputRef.current, text = s.fill ?? '';
    setDraft(text);
    window.requestAnimationFrame(() => { if (!el) return; el.focus(); el.setSelectionRange(text.length, text.length); el.style.height = 'auto'; el.style.height = `${Math.min(112, el.scrollHeight)}px`; });
  }

  const { visible, more, hidden } = page(messages, shown);
  const style = settings.style;
  const keepLabel = KEEP_OPTIONS.find(k => k.days === settings.keepDays)?.label || '7 hari';
  const learnedCount = Object.keys(settings.learned).length;
  if (!user) return null;

  return <>
    <button type="button" className={`chat-fab ${open ? 'is-open' : ''} ${settings.seen ? '' : 'is-new'}`} aria-label={open ? 'Tutup asisten chat' : 'Buka asisten chat'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {open ? <X size={20}/> : <ChatMark/>}
    </button>
    {open && <>
      {(style === 'lembar' || style === 'samping') && <div className="chat-scrim" onClick={() => setOpen(false)} aria-hidden="true"/>}
      <section className={`chat-panel is-${style}`} role="dialog" aria-modal={modal} aria-label="Asisten chat">
        {picked ? <header className="chat-head is-picking">
          {style === 'lembar' && <span className="chat-grab" aria-hidden="true"/>}
          <button type="button" className="chat-icon-btn" aria-label="Selesai memilih" onClick={() => setPicked(null)}><X size={19}/></button>
          <span className="chat-title"><strong>{picked.size} pesan dipilih</strong><small>Ketuk pesan untuk memilih atau melepas</small></span>
          <button type="button" className="chat-icon-btn" aria-label="Pilih semua pesan" title="Pilih semua" onClick={() => setPicked(new Set(messages.map(m => m.id)))}><CheckCheck size={18}/></button>
        </header> : <header className="chat-head">
          {style === 'lembar' && <span className="chat-grab" aria-hidden="true"/>}
          {style === 'penuh' && <button type="button" className="chat-icon-btn" aria-label="Kembali" onClick={() => setOpen(false)}><ChevronLeft size={20}/></button>}
          <span className="chat-avatar" aria-hidden="true"><ChatMark size={19}/></span>
          <span className="chat-title"><strong>Asisten Dompet</strong><small title={`Riwayat disimpan ${keepLabel} di HP ini`}><i className="chat-dot" aria-hidden="true"/>Di HP-mu · {VOICES.find(x => x.key === settings.voice)?.name} · {keepLabel}</small></span>
          <button type="button" className="chat-icon-btn" aria-label="Contoh dan template" onClick={() => setSheet(s => s === 'templates' ? null : 'templates')}><LayoutGrid size={18}/></button>
          <button type="button" className="chat-icon-btn" aria-label="Pengaturan chat" onClick={() => setSheet(s => s === 'settings' ? null : 'settings')}><SlidersHorizontal size={18}/></button>
          {style !== 'penuh' && <button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setOpen(false)}><X size={19}/></button>}
        </header>}

        <div className={`chat-list ${picked ? 'is-picking' : ''}`} ref={listRef} aria-live="polite" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {more && <button type="button" className="chat-more" onClick={() => setShown(n => n + PAGE)}><ChevronUp size={14}/> Muat lebih banyak <small>({hidden} pesan lagi)</small></button>}
          {!messages.length && <Welcome name={chatCtx.name} groups={templates} onPick={send}/>}
          {visible.map((m, i) => <Fragment key={m.id}>
            {(i === 0 || dayKey(visible[i - 1].at) !== dayKey(m.at)) && <div className="chat-day"><span>{dayKey(m.at) === dayKey(Date.now()) ? 'Hari ini' : dayKey(m.at) === dayKey(Date.now() - 864e5) ? 'Kemarin' : new Date(m.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span></div>}
            <div className={`cm-row is-${m.role} ${picked?.has(m.id) ? 'is-picked' : ''}`} {...rowProps(m.id)} aria-selected={picked ? picked.has(m.id) : undefined}>
              {picked && <span className="cm-check" aria-hidden="true">{picked.has(m.id) && <Check size={13} strokeWidth={3}/>}</span>}
              {m.role === 'user'
                ? <div className="cm cm-user"><div className="cm-bubble">{m.text}</div><time className="cm-time">{clock(m.at)}</time></div>
                : <BotMessage m={m} onChip={send} onOpenForm={preset => { mark(m.id, 'form'); openTx(preset); }} onNavigate={go} onSaved={(planText, summary) => saved(m.id, planText, summary)} onDismiss={() => { mark(m.id, 'dismissed'); setMemory(x => x.plan?.status === 'pending' && m.reply?.kind === 'plan' && x.plan.text === m.reply.text ? { ...x, plan: { ...x.plan, status: 'dismissed' } } : x); }}/>}
            </div>
          </Fragment>)}
          {typing && <div className="cm cm-bot"><span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span><div className="cm-bubble cm-typing" aria-label="Sedang mengetik"><i/><i/><i/></div></div>}
        </div>

        {undo && !picked && <div className="chat-undo" role="status"><Trash2 size={14} aria-hidden="true"/><span>{undo.removed.length} pesan dihapus</span><button type="button" onClick={undoRemove}>Urungkan</button></div>}
        {copied && !picked && <div className="chat-undo is-copied" role="status"><Check size={14} aria-hidden="true"/><span>Disalin</span></div>}
        {picked ? <div className="chat-pickbar">
          <button type="button" className="chat-pick-btn" disabled={!picked.size} onClick={() => void copyPicked()}><Copy size={16}/> Salin</button>
          <button type="button" className="chat-pick-btn is-danger" disabled={!picked.size} onClick={removePicked}><Trash2 size={16}/> Hapus{picked.size ? ` ${picked.size} pesan` : ''}</button>
        </div> : <>
        {messages.length > 0 && suggestions.length > 0 && (settings.tray
          ? <div className="chat-tray" role="group" aria-label="Saran pesan">
              <div className="chat-tray-scroll">{suggestions.map(s => { const Look = SUGGEST_LOOK[s.icon]; return <button type="button" key={s.label} className={`chat-suggest tone-${Look.tone} ${s.fill !== undefined ? 'is-fill' : ''}`} title={s.text ? `Kirim “${s.text}”` : 'Lanjutkan di kotak pesan'} onClick={() => pickSuggestion(s)}><Look.icon size={14} aria-hidden="true"/><span>{s.label}</span></button>; })}</div>
              <button type="button" className="chat-tray-toggle" aria-label="Ciutkan saran" onClick={() => changeSettings({ tray: false })}><ChevronDown size={16}/></button>
            </div>
          : <button type="button" className="chat-tray-open" onClick={() => changeSettings({ tray: true })}><Sparkles size={13}/> Saran <ChevronUp size={14}/></button>)}

        <form className="chat-compose" onSubmit={submit}>
          <button type="button" className="chat-icon-btn chat-tpl" aria-label="Contoh dan template" onClick={() => setSheet(s => s === 'templates' ? null : 'templates')}><LayoutGrid size={17}/></button>
          <textarea ref={inputRef} rows={1} value={draft} placeholder="Catat, tanya, atau hitung…" aria-label="Tulis pesan untuk asisten" enterKeyHint="send" autoComplete="off"
            onChange={e => { setDraft(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(112, e.currentTarget.scrollHeight)}px`; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}/>
          <button type="submit" className="chat-send" aria-label="Kirim" disabled={!draft.trim() || typing}><SendHorizontal size={17}/></button>
        </form>
        </>}

        {sheet && <div className="chat-sheet-wrap" onClick={e => { if (e.target === e.currentTarget && settings.picked) setSheet(null); }}>
          <div className="chat-sheet" role="group" aria-label={sheet === 'templates' ? 'Contoh dan template' : sheet === 'settings' ? 'Pengaturan chat' : 'Pilih tampilan chat'}>
            {sheet === 'templates' && <>
              <SheetHead title="Contoh & template" onClose={() => setSheet(null)}/>
              <p className="chat-sheet-lead">Ketuk untuk mengirim. Semuanya bisa ditulis dengan bahasamu sendiri.</p>
              <TemplateAccordion groups={templates} onPick={text => { setSheet(null); void send(text); }}/>
            </>}
            {sheet === 'settings' && <>
              <SheetHead title="Pengaturan chat" onClose={() => setSheet(null)}/>
              <h4 className="chat-sheet-sub">Gaya bahasa</h4>
              <div className="chat-voices" role="radiogroup" aria-label="Gaya bahasa">{VOICES.map(x => <button type="button" key={x.key} role="radio" aria-checked={settings.voice === x.key} className={`chat-voice ${settings.voice === x.key ? 'is-on' : ''}`} onClick={() => changeSettings({ voice: x.key })}><b>{x.name}</b><small>“{x.sample}”</small></button>)}</div>
              <h4 className="chat-sheet-sub">Tampilan</h4>
              <StylePicker value={style} onChange={s => changeSettings({ style: s, picked: true })}/>
              <h4 className="chat-sheet-sub">Simpan riwayat</h4>
              <div className="chat-seg" role="radiogroup" aria-label="Simpan riwayat">{KEEP_OPTIONS.map(k => <button type="button" key={k.days} role="radio" aria-checked={settings.keepDays === k.days} className={settings.keepDays === k.days ? 'is-on' : ''} onClick={() => changeSettings({ keepDays: k.days })}>{k.label}</button>)}</div>
              <p className="chat-sheet-note">Riwayat hanya disimpan di HP ini dan terhapus otomatis setelah {keepLabel}. Tidak ada yang diunggah.</p>
              <div className="chat-learned"><Brain size={16} aria-hidden="true"/><span><b>Belajar dari kamu</b><small>{learnedCount ? `${learnedCount} ungkapan sudah kuingat di HP ini.` : 'Ajari aku dengan “kalau aku bilang boncos artinya boros”, atau ketuk “Ajari aku” saat aku belum paham.'}</small></span>{learnedCount > 1 && <button type="button" className="chat-chip" onClick={() => changeSettings({ learned: {} })}>Lupakan semua</button>}</div>
              {learnedCount > 0 && <ul className="chat-learned-list">{Object.entries(settings.learned).reverse().map(([phrase, as]) => <li key={phrase}><span><b>“{phrase}”</b><small>→ {as}</small></span><button type="button" className="chat-icon-btn" aria-label={`Lupakan “${phrase}”`} onClick={() => { const next = { ...settings.learned }; delete next[phrase]; changeSettings({ learned: next }); }}><X size={15}/></button></li>)}</ul>}
              <h4 className="chat-sheet-sub">Hapus pesan</h4>
              <p className="chat-sheet-note">Tekan lama sebuah pesan (atau klik kanan) untuk memilih beberapa, lalu Salin atau Hapus. Catatan keuangan tidak ikut terhapus.</p>
              <button type="button" className="chat-chip chat-pick-start" disabled={!messages.length} onClick={() => { setSheet(null); setPicked(new Set()); }}><ListChecks size={14}/> Pilih pesan</button>
              {!confirmClear ? <button type="button" className="chat-danger" onClick={() => setConfirmClear(true)} disabled={!messages.length}><Trash2 size={15}/> Hapus semua percakapan</button>
                : <div className="chat-confirm"><span>Hapus {messages.length} pesan? Catatan keuangan tidak ikut terhapus.</span><button type="button" className="chat-danger" onClick={() => { if (user) clearChat(user.uid); setMessages([]); setMemory({}); setConfirmClear(false); setSheet(null); }}>Hapus</button><button type="button" className="chat-chip" onClick={() => setConfirmClear(false)}>Batal</button></div>}
            </>}
            {sheet === 'style' && <>
              <SheetHead title="Pilih tampilan chat"/>
              <p className="chat-sheet-lead">Ada lima gaya. Pilih yang paling nyaman. Bisa diganti kapan saja lewat tombol pengaturan.</p>
              <StylePicker value={style} onChange={s => changeSettings({ style: s })}/>
              <button type="button" className="chat-primary" onClick={() => { changeSettings({ picked: true }); setSheet(null); }}>Pakai {CHAT_STYLES.find(s => s.key === style)?.name}</button>
            </>}
          </div>
        </div>}
      </section>
    </>}
  </>;
}

function SheetHead({ title, onClose }: { title: string; onClose?: () => void }) {
  return <div className="chat-sheet-head"><strong>{title}</strong>{onClose && <button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={onClose}><X size={18}/></button>}</div>;
}

function Welcome({ name, groups, onPick }: { name?: string; groups: TemplateGroup[]; onPick: (text: string) => void }) {
  const [folded, setFolded] = useState(false);
  return <div className="chat-welcome">
    <div className="chat-hello"><span className="chat-hello-mark" aria-hidden="true"><ChatMark size={26}/></span><b>Halo{name ? `, ${name}` : ''}!</b><span>Aku bisa mencatat, menjawab pertanyaan soal uangmu, menghitung, dan memberi ringkasan. Semua dibaca di HP-mu.</span></div>
    <div className="chat-start-head"><span>Coba mulai dari sini</span><button type="button" className="chat-fold" aria-expanded={!folded} onClick={() => setFolded(v => !v)}>{folded ? <>Tampilkan <ChevronDown size={14}/></> : <>Ciutkan <ChevronUp size={14}/></>}</button></div>
    {!folded && <div className="chat-start">{groups.map(g => { const Look = GROUP_LOOK[g.key]; return <button type="button" key={g.key} className={`chat-start-card tone-${Look.tone}`} onClick={() => onPick(g.items[0])}><span className="chat-tile" aria-hidden="true"><Look.icon size={16}/></span><b>{g.title}</b><span>“{g.items[0]}”</span></button>; })}</div>}
  </div>;
}

function TemplateAccordion({ groups, onPick }: { groups: TemplateGroup[]; onPick: (text: string) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(groups[0].key);
  return <div className="chat-acc">{groups.map(g => {
    const Look = GROUP_LOOK[g.key], on = openKey === g.key;
    return <section key={g.key} className={`chat-acc-item tone-${Look.tone} ${on ? 'is-open' : ''}`}>
      <button type="button" className="chat-acc-head" aria-expanded={on} onClick={() => setOpenKey(on ? null : g.key)}>
        <span className="chat-tile" aria-hidden="true"><Look.icon size={16}/></span>
        <span className="chat-acc-title"><b>{g.title}</b><small>{g.hint}</small></span>
        <span className="chat-acc-count">{g.items.length}</span>
        <ChevronDown size={16} className="chat-acc-chev" aria-hidden="true"/>
      </button>
      {on && <ul className="chat-acc-list">{g.items.map(item => <li key={item}><button type="button" onClick={() => onPick(item)}><span>{item}</span><ArrowUpRight size={15} aria-hidden="true"/></button></li>)}</ul>}
    </section>;
  })}</div>;
}

function BotMessage({ m, onChip, onOpenForm, onNavigate, onSaved, onDismiss }: { m: ChatMessage; onChip: (text: string) => void; onOpenForm: (preset: Partial<LedgerTx>) => void; onNavigate: (key: string, target?: string) => void; onSaved: (planText: string, summary: string) => void; onDismiss: () => void }) {
  const r = m.reply as ChatReply | undefined;
  if (!r) return null;
  const chips = (list?: string[]): ReactNode => list?.length ? <div className="chat-chips">{list.map(c => <button type="button" key={c} className="chat-chip" onClick={() => onChip(c)}>{c}</button>)}</div> : null;
  const shell = (body: ReactNode, rich = false, tone = '') => <div className={`cm cm-bot ${rich ? 'is-rich' : ''}`}><span className="cm-avatar" aria-hidden="true"><ChatMark size={14}/></span><div className={`cm-bubble ${rich ? 'cm-rich' : ''} ${tone}`}>{body}</div><time className="cm-time">{clock(m.at)}</time></div>;
  if (r.kind === 'say') {
    const look = r.card ? CARD_LOOK[r.card] : undefined, calc = r.card === 'calc' && r.hero;
    const rich = Boolean(r.hero || r.stats?.length || r.bars?.length || r.steps?.length || r.lines?.length);
    const open = r.open && <button type="button" className="chat-open" onClick={() => onNavigate(r.open!.view)}><ArrowUpRight size={14} aria-hidden="true"/><span>{r.open.label}</span></button>;
    const lines = r.lines && <dl className={`cm-lines ${r.lines.every(l => /^\d+$/.test(l.label)) ? 'is-list' : ''}`}>{r.lines.map(l => <div key={l.label + l.value} className={l.tone ? `is-${l.tone}` : ''}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>;
    if (!rich || !look) return shell(<>
      {r.title && <b className="cm-kicker">{r.title}</b>}
      <p>{r.text}</p>
      {lines}
      {r.note && <small className="cm-note">{r.note}</small>}
      {open}
      {chips(r.chips)}
    </>, Boolean(r.lines), r.tone ? `is-${r.tone}` : '');
    const badge = r.tone === 'warn' ? 'Perlu perhatian' : r.tone === 'good' ? 'Aman' : '';
    return shell(<>
      <div className="cc-head"><span className="cc-icon" aria-hidden="true"><look.icon size={16}/></span><b className="cc-kicker">{r.title}</b>{badge && <span className={`cc-badge is-${r.tone}`}>{badge}</span>}</div>
      {calc ? <div className="cc-calc"><small>{r.hero!.label}</small><strong>= {r.hero!.value}</strong></div>
        : r.hero && <div className={`cc-hero ${r.hero.tone ? `is-${r.hero.tone}` : ''}`}><small>{r.hero.label}</small><strong>{r.hero.value}</strong>{r.hero.note && <span>{r.hero.note}</span>}</div>}
      {!calc && r.text && <p className="cc-text">{r.text}</p>}
      {r.stats && r.stats.length > 0 && <div className={`cc-stats n${Math.min(3, r.stats.length)}`}>{r.stats.map(x => <div key={x.label} className={`cc-stat ${x.tone ? `is-${x.tone}` : ''}`}><small>{x.label}</small><b>{x.value}</b></div>)}</div>}
      {r.bars && r.bars.length > 0 && <ul className="cc-bars">{r.bars.map(b => <li key={b.label} className={b.tone ? `is-${b.tone}` : ''}><span className="cc-bar-label">{b.label}</span><b>{b.value}</b><i className="cc-track" aria-hidden="true"><i style={{ width: `${Math.max(3, Math.min(100, b.ratio * 100))}%` }}/></i>{b.note && <small>{b.note}</small>}</li>)}</ul>}
      {r.steps && r.steps.length > 0 && <ol className="cc-steps">{r.steps.map((x, i) => <li key={i}><span className="cc-num" aria-hidden="true">{i + 1}</span><span>{x}</span></li>)}</ol>}
      {lines}
      {r.note && <small className="cm-note">{r.note}</small>}
      {open}
      {chips(r.chips)}
    </>, true, `cm-card tone-${look.tone} ${r.tone ? `is-${r.tone}` : ''}`);
  }
  // A card from Catat otomatis, inside the same bubble as what the assistant says about it.
  return shell(<>
    {r.intro && <p>{r.intro}</p>}
    {m.status === 'pending' && chips(r.chips)}
    {m.status === 'pending'
      ? <div className="cm-panel"><QuickEntryBox key={m.id} fixedText={r.text} onOpenForm={onOpenForm} onNavigate={onNavigate} onSaved={summary => onSaved(r.text, summary)} onAsk={onChip}/></div>
      : <div className={`cm-status is-${m.status}`}>{m.status === 'saved' ? <><Check size={15} aria-hidden="true"/><span>{m.summary || 'Tersimpan.'}</span></> : <span>{STATUS_TEXT[m.status || 'dismissed']}</span>}</div>}
    {m.status === 'pending' && !m.asked && <button type="button" className="cm-dismiss" onClick={onDismiss}>Tidak jadi</button>}
    {m.status === 'saved' && <div className="chat-chips"><button type="button" className="chat-chip is-quiet" onClick={() => onChip('batalin yang tadi')}><Undo2 size={13} aria-hidden="true"/> Batalkan</button></div>}
  </>, m.status === 'pending');
}

function StylePicker({ value, onChange }: { value: ChatStyle; onChange: (style: ChatStyle) => void }) {
  return <div className="chat-styles" role="radiogroup" aria-label="Tampilan chat">{CHAT_STYLES.map((s, i) => <button type="button" key={s.key} role="radio" aria-checked={value === s.key} className={`chat-style ${value === s.key ? 'is-on' : ''}`} onClick={() => onChange(s.key)}>
    <span className={`csp-mini is-${s.key}`} aria-hidden="true"><i className="csp-panel"><i className="csp-b1"/><i className="csp-b2"/><i className="csp-b3"/></i></span>
    <span className="chat-style-text"><b>{i + 1}. {s.name}</b><small>{s.note}</small></span>
    {value === s.key && <Check size={16} className="chat-style-check" aria-hidden="true"/>}
  </button>)}</div>;
}
