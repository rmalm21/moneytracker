'use client';
/**
 * 7.6 Asisten chat: a small round button above the bottom bar opens a chat with the on-device assistant
 * (lib/chat/engine.ts). Records and questions are shown as the same cards as Catat otomatis, inside the bot's bubble;
 * the rest (summaries, calculations, tips) as text. Five looks to choose from; history stays on this device for 7 days
 * (or 14 days / 1 month), ten messages at a time.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronLeft, LayoutGrid, MessageCircle, SendHorizontal, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { QuickEntryBox } from './quick-entry';
import { chatReply, TEMPLATES, type ChatContext, type ChatMemory, type ChatReply, type Reading } from '@/lib/chat/engine';
import { CHAT_STYLES, DEFAULT_SETTINGS, KEEP_OPTIONS, PAGE, clearChat, loadChat, loadSettings, page, saveChat, saveSettings, type ChatMessage, type ChatSettings, type ChatStatus, type ChatStyle } from '@/lib/chat/store';
import { parseQuickPlan } from '@/lib/quick-plan';
import { mayAsk } from '@/lib/catat/ask';
import { dateInTimeZone, timeInTimeZone, todayInTimeZone } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

const uid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clock = (at: number) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const dayKey = (at: number) => new Date(at).toLocaleDateString('en-CA');
const STATUS_TEXT: Partial<Record<ChatStatus, string>> = { dismissed: 'Tidak jadi dicatat.', replaced: 'Diganti dengan yang di bawah.', form: 'Dilanjutkan di formulir.' };

export function ChatLauncher({ openTx, navigate }: { openTx: (preset?: Partial<LedgerTx>) => void; navigate: (key: string, target?: string) => void }) {
  const { user, data, profile, cycle } = useApp();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([]), [memory, setMemory] = useState<ChatMemory>({});
  const [loaded, setLoaded] = useState(false), [shown, setShown] = useState(PAGE), [draft, setDraft] = useState(''), [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<null | 'templates' | 'settings' | 'style'>(null), [confirmClear, setConfirmClear] = useState(false);
  const listRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), timer = useRef<number | undefined>(undefined), sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  // History and settings of this account, on this device.
  useEffect(() => {
    if (!user) { setLoaded(false); return; }
    const s = loadSettings(user.uid), h = loadChat(user.uid, s.keepDays);
    setSettings(s); setMessages(h.messages); setMemory(h.memory); setLoaded(true);
  }, [user]);
  useEffect(() => { if (user && loaded) saveChat(user.uid, messages, memory, settings.keepDays); }, [user, loaded, messages, memory, settings.keepDays]);
  const changeSettings = (patch: Partial<ChatSettings>) => setSettings(s => { const next = { ...s, ...patch }; if (user) saveSettings(user.uid, next); return next; });

  const today = todayInTimeZone(profile?.timeZone);
  const quick = useMemo(() => ({ wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, budgets: data.budgets, salaryDay: profile?.salaryCycleStartDay, now: timeInTimeZone(profile?.timeZone), plans: data.plannedTransactions, recurring: data.recurring, nowMs: Date.now(), ask: { transactions: data.transactions, wallets: data.wallets, budgets: data.budgets } }), [data, today, profile?.salaryCycleStartDay, profile?.timeZone]);
  const read = useCallback((text: string): Reading => {
    try { const p = parseQuickPlan(text, quick); return p.actions.some(a => a.result.kind === 'query') ? 'question' : p.actions.length ? 'record' : mayAsk(text) ? 'question' : 'none'; } catch { return 'none'; }
  }, [quick]);
  const chatCtx = useMemo<ChatContext>(() => ({ data, today, salaryDay: profile?.salaryCycleStartDay || 24, cycle: { start: cycle.start, end: cycle.end }, quick, read, name: (profile?.displayName || profile?.username || '').split(' ')[0], hour: dateInTimeZone(new Date(), profile?.timeZone).getHours() }), [data, today, profile, cycle.start, cycle.end, quick, read]);

  // Opening: the latest ten, the keyboard ready, the style asked once.
  useEffect(() => {
    if (!open) return;
    setShown(PAGE); setSheet(s => s || (settings.picked ? null : 'style'));
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    // Escape closes what is on top: a sheet first, then the chat (a form opened from the chat handles its own Escape).
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape' || document.querySelector('.modal-overlay')) return; if (sheetRef.current) setSheet(null); else setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = listRef.current; if (el && open) el.scrollTop = el.scrollHeight; }, [messages.length, typing, open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const modal = open && ['lembar', 'penuh', 'samping'].includes(settings.style);
  useEffect(() => { document.documentElement.classList.toggle('chat-locked', modal); return () => document.documentElement.classList.remove('chat-locked'); }, [modal]);

  const mark = useCallback((id: string, status: ChatStatus, summary?: string) => setMessages(list => list.map(m => m.id === id ? { ...m, status, ...(summary ? { summary } : {}) } : m)), []);
  function send(text: string) {
    const t = text.trim();
    if (!t || typing) return;
    setDraft(''); if (inputRef.current) inputRef.current.style.height = '';
    const result = chatReply(t, memory, chatCtx), now = Date.now();
    const userMsg: ChatMessage = { id: uid(), at: now, role: 'user', text: t };
    setMessages(list => {
      // A change or a cancel takes the place of the card waiting to be saved.
      const waiting = memory.plan?.status === 'pending' ? memory.plan.text : null;
      const replaced = result.dismiss ? 'dismissed' : result.intent === 'edit' && result.reply.kind === 'plan' && !result.reply.text.startsWith('ubah transaksi') ? 'replaced' : null;
      const next = replaced && waiting ? list.map(m => m.role === 'bot' && m.status === 'pending' && m.reply?.kind === 'plan' && m.reply.text === waiting ? { ...m, status: replaced as ChatStatus } : m) : list;
      return [...next, userMsg];
    });
    setMemory(result.memory); setTyping(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setMessages(list => [...list, { id: uid(), at: Date.now(), role: 'bot', text: result.reply.kind === 'say' ? result.reply.text : result.reply.intro || '', reply: result.reply, ...(result.reply.kind === 'plan' ? { status: 'pending' as const } : {}), ...(result.intent === 'question' || result.intent === 'followup' ? { asked: true } : {}) }]);
      setTyping(false);
    }, 320 + Math.min(500, t.length * 6));
  }
  function saved(id: string, planText: string, summary: string) {
    mark(id, 'saved', summary);
    setMemory(m => m.plan?.text === planText ? { ...m, plan: { ...m.plan, status: 'saved' } } : m);
  }
  function submit(e: FormEvent) { e.preventDefault(); send(draft); }
  function go(key: string, target?: string) { setOpen(false); navigate(key, target); }

  const { visible, more, hidden } = page(messages, shown);
  const style = settings.style;
  const keepLabel = KEEP_OPTIONS.find(k => k.days === settings.keepDays)?.label || '7 hari';
  if (!user) return null;

  return <>
    <button type="button" className={`chat-fab ${open ? 'is-open' : ''}`} aria-label={open ? 'Tutup asisten chat' : 'Buka asisten chat'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {open ? <X size={20}/> : <MessageCircle size={21}/>}
    </button>
    {open && <>
      {(style === 'lembar' || style === 'samping') && <div className="chat-scrim" onClick={() => setOpen(false)} aria-hidden="true"/>}
      <section className={`chat-panel is-${style}`} role="dialog" aria-modal={modal} aria-label="Asisten chat">
        <header className="chat-head">
          {style === 'lembar' && <span className="chat-grab" aria-hidden="true"/>}
          {style === 'penuh' && <button type="button" className="chat-icon-btn" aria-label="Kembali" onClick={() => setOpen(false)}><ChevronLeft size={20}/></button>}
          <span className="chat-avatar" aria-hidden="true"><Sparkles size={16}/></span>
          <span className="chat-title"><strong>Asisten Dompet</strong><small>Dibaca di HP-mu · riwayat {keepLabel}</small></span>
          <button type="button" className="chat-icon-btn" aria-label="Contoh dan template" onClick={() => setSheet(s => s === 'templates' ? null : 'templates')}><LayoutGrid size={18}/></button>
          <button type="button" className="chat-icon-btn" aria-label="Pengaturan chat" onClick={() => setSheet(s => s === 'settings' ? null : 'settings')}><SlidersHorizontal size={18}/></button>
          {style !== 'penuh' && <button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setOpen(false)}><X size={19}/></button>}
        </header>

        <div className="chat-list" ref={listRef} aria-live="polite">
          {more && <button type="button" className="chat-more" onClick={() => setShown(n => n + PAGE)}>Muat lebih banyak <small>({hidden} pesan lagi)</small></button>}
          {!messages.length && <Welcome name={chatCtx.name} onPick={send}/>}
          {visible.map((m, i) => <Fragment key={m.id}>
            {(i === 0 || dayKey(visible[i - 1].at) !== dayKey(m.at)) && <div className="chat-day"><span>{dayKey(m.at) === dayKey(Date.now()) ? 'Hari ini' : dayKey(m.at) === dayKey(Date.now() - 864e5) ? 'Kemarin' : new Date(m.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span></div>}
            {m.role === 'user'
              ? <div className="cm cm-user"><div className="cm-bubble">{m.text}</div><time className="cm-time">{clock(m.at)}</time></div>
              : <BotMessage m={m} onChip={send} onOpenForm={preset => { mark(m.id, 'form'); openTx(preset); }} onNavigate={go} onSaved={(planText, summary) => saved(m.id, planText, summary)} onDismiss={() => { mark(m.id, 'dismissed'); setMemory(x => x.plan?.status === 'pending' && m.reply?.kind === 'plan' && x.plan.text === m.reply.text ? { ...x, plan: { ...x.plan, status: 'dismissed' } } : x); }}/>}
          </Fragment>)}
          {typing && <div className="cm cm-bot"><span className="cm-avatar" aria-hidden="true"><Sparkles size={12}/></span><div className="cm-bubble cm-typing" aria-label="Sedang mengetik"><i/><i/><i/></div></div>}
        </div>

        <form className="chat-compose" onSubmit={submit}>
          <button type="button" className="chat-icon-btn chat-tpl" aria-label="Contoh dan template" onClick={() => setSheet(s => s === 'templates' ? null : 'templates')}><LayoutGrid size={17}/></button>
          <textarea ref={inputRef} rows={1} value={draft} placeholder="Catat, tanya, atau hitung…" aria-label="Tulis pesan untuk asisten" enterKeyHint="send" autoComplete="off"
            onChange={e => { setDraft(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(112, e.currentTarget.scrollHeight)}px`; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}/>
          <button type="submit" className="chat-send" aria-label="Kirim" disabled={!draft.trim() || typing}><SendHorizontal size={17}/></button>
        </form>

        {sheet && <div className="chat-sheet-wrap" onClick={e => { if (e.target === e.currentTarget && settings.picked) setSheet(null); }}>
          <div className="chat-sheet" role="group" aria-label={sheet === 'templates' ? 'Contoh dan template' : sheet === 'settings' ? 'Pengaturan chat' : 'Pilih tampilan chat'}>
            {sheet === 'templates' && <>
              <div className="chat-sheet-head"><strong>Contoh & template</strong><button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setSheet(null)}><X size={18}/></button></div>
              <p className="chat-sheet-lead">Ketuk untuk mengirim. Semua bisa ditulis dengan bahasamu sendiri.</p>
              <div className="chat-tpl-groups">{TEMPLATES.map(g => <section key={g.title}><h4>{g.title}<small>{g.hint}</small></h4><div className="chat-chips">{g.items.map(item => <button type="button" key={item} className="chat-chip" onClick={() => { setSheet(null); send(item); }}>{item}</button>)}</div></section>)}</div>
            </>}
            {sheet === 'settings' && <>
              <div className="chat-sheet-head"><strong>Pengaturan chat</strong><button type="button" className="chat-icon-btn" aria-label="Tutup" onClick={() => setSheet(null)}><X size={18}/></button></div>
              <h4 className="chat-sheet-sub">Tampilan</h4>
              <StylePicker value={style} onChange={s => changeSettings({ style: s, picked: true })}/>
              <h4 className="chat-sheet-sub">Simpan riwayat</h4>
              <div className="chat-seg" role="radiogroup" aria-label="Simpan riwayat">{KEEP_OPTIONS.map(k => <button type="button" key={k.days} role="radio" aria-checked={settings.keepDays === k.days} className={settings.keepDays === k.days ? 'is-on' : ''} onClick={() => changeSettings({ keepDays: k.days })}>{k.label}</button>)}</div>
              <p className="chat-sheet-note">Riwayat hanya disimpan di HP ini dan terhapus otomatis setelah {keepLabel}. Tidak ada yang diunggah.</p>
              {!confirmClear ? <button type="button" className="chat-danger" onClick={() => setConfirmClear(true)} disabled={!messages.length}><Trash2 size={15}/> Hapus semua percakapan</button>
                : <div className="chat-confirm"><span>Hapus {messages.length} pesan? Catatan keuangan tidak ikut terhapus.</span><button type="button" className="chat-danger" onClick={() => { if (user) clearChat(user.uid); setMessages([]); setMemory({}); setConfirmClear(false); setSheet(null); }}>Hapus</button><button type="button" className="chat-chip" onClick={() => setConfirmClear(false)}>Batal</button></div>}
            </>}
            {sheet === 'style' && <>
              <div className="chat-sheet-head"><strong>Pilih tampilan chat</strong></div>
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

function Welcome({ name, onPick }: { name?: string; onPick: (text: string) => void }) {
  return <div className="chat-welcome">
    <div className="cm cm-bot"><span className="cm-avatar" aria-hidden="true"><Sparkles size={12}/></span><div className="cm-bubble">Halo{name ? ` ${name}` : ''}! Aku bisa mencatat, menjawab pertanyaan soal uangmu, menghitung, dan memberi ringkasan. Coba salah satu:</div></div>
    <div className="chat-start">{TEMPLATES.slice(0, 6).map(g => <button type="button" key={g.title} className="chat-start-card" onClick={() => onPick(g.items[0])}><b>{g.title}</b><span>“{g.items[0]}”</span></button>)}</div>
  </div>;
}

function BotMessage({ m, onChip, onOpenForm, onNavigate, onSaved, onDismiss }: { m: ChatMessage; onChip: (text: string) => void; onOpenForm: (preset: Partial<LedgerTx>) => void; onNavigate: (key: string, target?: string) => void; onSaved: (planText: string, summary: string) => void; onDismiss: () => void }) {
  const r = m.reply as ChatReply | undefined;
  if (!r) return null;
  const avatar = <span className="cm-avatar" aria-hidden="true"><Sparkles size={12}/></span>;
  if (r.kind === 'say') return <div className="cm cm-bot">
    {avatar}
    <div className={`cm-bubble ${r.tone ? `is-${r.tone}` : ''}`}>
      {r.title && <b className="cm-kicker">{r.title}</b>}
      <p>{r.text}</p>
      {r.lines && <dl className={`cm-lines ${r.lines.every(l => /^\d+$/.test(l.label)) ? 'is-list' : ''}`}>{r.lines.map(l => <div key={l.label + l.value} className={l.tone ? `is-${l.tone}` : ''}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>}
      {r.note && <small className="cm-note">{r.note}</small>}
      {r.chips && <div className="chat-chips">{r.chips.map(c => <button type="button" key={c} className="chat-chip" onClick={() => onChip(c)}>{c}</button>)}</div>}
    </div>
    <time className="cm-time">{clock(m.at)}</time>
  </div>;
  return <div className="cm cm-bot is-card">
    {avatar}
    <div className="cm-stack">
      {r.intro && <div className="cm-bubble">{r.intro}</div>}
      {m.status === 'pending'
        ? <div className="cm-card"><QuickEntryBox key={m.id} fixedText={r.text} onOpenForm={onOpenForm} onNavigate={onNavigate} onSaved={summary => onSaved(r.text, summary)} onAsk={onChip}/>{!m.asked && <button type="button" className="cm-dismiss" onClick={onDismiss}>Tidak jadi</button>}</div>
        : <div className={`cm-bubble cm-done is-${m.status}`}>{m.status === 'saved' ? <><CheckCircle2 size={15} aria-hidden="true"/> {m.summary || 'Tersimpan.'}</> : STATUS_TEXT[m.status || 'dismissed']}</div>}
    </div>
    <time className="cm-time">{clock(m.at)}</time>
  </div>;
}

function StylePicker({ value, onChange }: { value: ChatStyle; onChange: (style: ChatStyle) => void }) {
  return <div className="chat-styles" role="radiogroup" aria-label="Tampilan chat">{CHAT_STYLES.map((s, i) => <button type="button" key={s.key} role="radio" aria-checked={value === s.key} className={`chat-style ${value === s.key ? 'is-on' : ''}`} onClick={() => onChange(s.key)}>
    <span className={`csp-mini is-${s.key}`} aria-hidden="true"><i className="csp-screen"/><i className="csp-panel"><i className="csp-b1"/><i className="csp-b2"/><i className="csp-b3"/></i></span>
    <span className="chat-style-text"><b>{i + 1}. {s.name}</b><small>{s.note}</small></span>
  </button>)}</div>;
}
