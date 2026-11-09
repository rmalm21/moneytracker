'use client';
/**
 * 9.8 The pet's panel (tap its name next to the chat button): pick or switch pets (each keeps its own name and growth),
 * give it a name, see its needs and how to fill them, pet it, play, ask for a tip, accessories, and hide it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Dialog, DialogContent } from '../ui/dialog';
import { askToTry } from '../feature-tips-events';
import { useGame } from '../game/game-store';
import { PetImg, PetParts, PetSprite, SPECIAL_FX, usePetFx } from './pet-view';
import { openPetSheet, petHidden, setPetHidden, usePetStore } from './pet-store';
import { commitPet, hourIn, hourKey, petSound, waitText } from './pet-actions';
import { ACCESSORIES, adopt, care, CARE, collectEgg, eggReady, emptyPet, feed, growthFor, levelOf, mealWait, MEALS_A_DAY, moodOf, needsAt, NEEDS, pet, petTip, play as playPet, PET_KINDS, PETS, readTip, rename, stageOf, STAGES, wear, type PetKind } from '@/lib/pet';
import { canScratch, canSpin, hash, streakOf } from '@/lib/game';
import { todayInTimeZone } from '@/lib/period';
import { play } from '@/lib/game-sound';

export function PetSheet() {
  const ps = usePetStore(), g = useGame(), { account, personalProfile } = useApp();
  const uid = account?.uid || '', tz = personalProfile?.timeZone || 'Asia/Jakarta';
  const hourOf = useMemo(() => hourIn(tz), [tz]);
  const today = g.today || todayInTimeZone(tz);
  const state = ps.state || emptyPet(), rec = state.active ? state.pets[state.active] : undefined;
  const [picking, setPicking] = useState(!rec), [chosen, setChosen] = useState<PetKind | null>(null), [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false), [tip, setTip] = useState(''), [note, setNote] = useState(''), [shown, setShown] = useState(() => (uid ? !petHidden(uid) : true));
  const { fx, parts, run } = usePetFx();
  const close = () => openPetSheet(false);
  // Switching between the list of pets and a pet's profile starts at the top (the pet's picture), not where the list was.
  const topRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { topRef.current?.closest('.modal-body')?.scrollTo({ top: 0 }); }, [picking]);

  function choose(kind: PetKind) { setChosen(kind); setDraft(state.pets[kind]?.name || PETS[kind].name); play('click'); }
  function confirm() {
    if (!chosen) return;
    commitPet(adopt(state, chosen, draft, Date.now(), today)); play('welcome'); window.setTimeout(() => petSound(PETS[chosen].voice), 500);
    setPicking(false); setChosen(null);
  }

  const now = Date.now(), hour = hourOf(now);
  const needs = rec ? needsAt(rec, now, hourOf) : null, mood = rec && needs ? moodOf(rec, needs, hour) : null;
  const info = rec ? PETS[rec.kind] : null, level = rec ? levelOf(rec.growth) : 1, stage = stageOf(level);
  const from = growthFor(level), to = growthFor(level + 1), nextStage = STAGES.find(s => s.from > level);
  const mealsToday = state.meals?.day === today ? state.meals.n : 0, wait = mealWait(state, now, today);
  const mealLine = `Makan hari ini ${mealsToday}/${MEALS_A_DAY}${mealsToday >= MEALS_A_DAY ? ' · besok lagi' : wait > 0 ? ` · berikutnya ${waitText(wait)}` : ' · ketuk Kasih makan'}`;

  return <Dialog open onOpenChange={o => { if (!o) close(); }}>
    <DialogContent title={picking || !rec ? 'Pilih pet' : `Pet: ${rec.name}`} className="pet-sheet">
      <span ref={topRef} className="ps-top" aria-hidden="true"/>
      {(picking || !rec) && <div className="ps-pick">
        <p className="ps-lead">Pilih teman yang nangkring di samping tombol chat. Tiap pet punya kebutuhan dan gerakan spesialnya sendiri, dan bisa kamu kasih nama.</p>
        <div className="ps-grid" role="radiogroup" aria-label="Pilih pet">
          {PET_KINDS.map(k => { const p = PETS[k], own = state.pets[k]; return <button type="button" role="radio" aria-checked={chosen === k} key={k} className={`ps-card ${chosen === k ? 'is-on' : ''} ${state.active === k ? 'is-active' : ''}`} onClick={() => choose(k)}>
            <span className="ps-card-pic"><PetSprite kind={k} growth={own?.growth ?? 120} acc={own?.acc ?? null} size={58}/></span>
            <b>{own ? own.name : p.species}</b><small>{own ? `${p.species} · Lv ${levelOf(own.growth)}` : p.trait}</small>
            <span className="ps-chips"><span><PetImg e={p.food.emoji}/>{p.food.name}</span><span><Emoji e={NEEDS[p.needs[1]].emoji}/>{NEEDS[p.needs[1]].name}</span></span>
            <span className="ps-special"><Emoji e={p.special.emoji}/>{p.special.name}</span>
          </button>; })}
        </div>
        {chosen && <div className="ps-name">
          <label htmlFor="pet-name">Kasih nama {PETS[chosen].species.toLowerCase()} kamu</label>
          <div className="ps-name-row"><input id="pet-name" className="input" value={draft} maxLength={16} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirm(); }} autoComplete="off"/>
            <button type="button" className="btn btn-primary" onClick={confirm}>{state.pets[chosen] ? 'Pakai' : 'Adopsi'}</button></div>
          <small>{PETS[chosen].special.text}</small>
        </div>}
        {rec && <button type="button" className="ps-link" onClick={() => { setPicking(false); setChosen(null); }}>Kembali ke {rec.name}</button>}
      </div>}

      {!picking && rec && info && needs && mood && <div className="ps-profile">
        <div className={`ps-hero kind-${rec.kind}`}>
          <span className="ps-hero-pet"><PetSprite kind={rec.kind} growth={rec.growth} acc={rec.acc} size={112} sleeping={mood.id === 'tidur'} fx={fx}/><PetParts parts={parts}/></span>
          <p className="ps-mood"><Emoji e={mood.emoji}/> {mood.text}</p>
        </div>
        <div className="ps-title">
          {editing ? <div className="ps-name-row"><input className="input" value={draft} maxLength={16} autoFocus onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { commitPet(rename(state, rec.kind, draft)); setEditing(false); } }} aria-label="Nama pet"/>
            <button type="button" className="btn btn-primary" onClick={() => { commitPet(rename(state, rec.kind, draft)); setEditing(false); play('step'); }} aria-label="Simpan nama"><Check size={16}/></button></div>
            : <h3>{rec.name} <button type="button" className="icon-btn ps-edit" onClick={() => { setDraft(rec.name); setEditing(true); }} aria-label="Ubah nama"><Pencil size={15}/></button></h3>}
          <small>{info.species} · {info.trait}</small>
        </div>
        <div className="ps-level">
          <div className="ps-level-top"><b>Lv {level} · {STAGES[stage].name}</b><small>{nextStage ? `${nextStage.name} di Lv ${nextStage.from}` : 'Tahap tertinggi!'}</small></div>
          <span className="ps-bar"><i style={{ width: `${Math.min(100, ((rec.growth - from) / (to - from)) * 100)}%` }}/></span>
          <small>Tumbuh dari XP Arena selama dia jadi pet-mu, plus tiap kamu kasih makan, elus, dan ajak main.</small>
        </div>
        <div className="ps-needs">
          {info.needs.map(id => { const val = Math.round(needs[id]); return <div key={id} className={`ps-need ${val < 30 ? 'is-low' : val >= 70 ? 'is-good' : ''}`}>
            <span className="ps-need-ic"><PetImg e={id === 'kenyang' ? info.food.emoji : NEEDS[id].emoji}/></span>
            <span className="ps-need-main"><span className="ps-need-top"><b>{NEEDS[id].name}</b><small>{val}%</small></span><span className="ps-bar"><i style={{ width: `${val}%` }}/></span>
              <small>{id === 'kenyang' ? mealLine : NEEDS[id].hint}</small></span>
          </div>; })}
        </div>
        <div className={`ps-actions n${CARE[rec.kind] ? 5 : 4}`}>
          <button type="button" className="ps-act is-food" onClick={() => {
            const r = feed(state, Date.now(), today, hourOf);
            if (r.ok) { commitPet(r.state); run('eat', info.food.emoji); play('munch'); setNote(`Nyam! ${rec.name} makan ${info.food.name}.`); return; }
            play('bonk'); setNote(r.reason === 'full' ? `${rec.name} masih kenyang.` : r.reason === 'limit' ? `Udah ${MEALS_A_DAY}× makan hari ini. Besok lagi ya!` : `Barusan makan. Bisa makan lagi ${waitText(r.waitMs || 0)}.`);
          }}><PetImg e={info.food.emoji}/><span>Kasih makan</span></button>
          {CARE[rec.kind] && <button type="button" className="ps-act" onClick={() => {
            const c = CARE[rec.kind]!, r = care(state, Date.now(), hourOf);
            if (r.ok) { commitPet(r.state); run('dance'); petSound(info.voice); setNote(c.say); } else { play('bonk'); setNote(`Barusan ${c.name.toLowerCase()}. Bisa lagi ${waitText(r.waitMs || 0)}.`); }
          }}><Emoji e={CARE[rec.kind]!.emoji}/><span>{CARE[rec.kind]!.name}</span></button>}
          <button type="button" className="ps-act" onClick={() => { const r = pet(state, Date.now(), hourKey(tz), hourOf); if (r.counted) commitPet(r.state); run('elus'); if (rec.kind === 'kucing') play('purr'); else petSound(info.voice); }}><Emoji e="🤚"/><span>Elus</span></button>
          <button type="button" className="ps-act is-special" onClick={() => { const r = playPet(state, Date.now(), hourOf); if (r.counted) commitPet(r.state); run(SPECIAL_FX[rec.kind]); petSound(info.voice); }}><Emoji e={info.special.emoji}/><span>{info.special.name}</span></button>
          <button type="button" className="ps-act" onClick={() => {
            const st = g.state;
            const t = petTip(rec, needs, { hour, recordedToday: st?.txDay === today ? Object.values(st.txCounted || {}).reduce((n, v) => n + v, 0) : 0, litToday: Boolean(st?.days.includes(today)), streak: st ? streakOf(st.days, st.frozen || [], today).current : 0,
              missionsLeft: st && st.missionDay === today ? Math.max(0, (st.missionIds?.length || 3) - (st.missionsDone?.length || 0)) : 3, spinReady: st ? canSpin(st, today) : false, scratchReady: st ? canScratch(st, today) : false, index: hash(`${uid}:${today}`) + state.tipsRead + 1 });
            commitPet(readTip(state, Date.now(), hourOf)); setTip(t.text); petSound(info.voice);
          }}><Emoji e="💡"/><span>Minta tips</span></button>
        </div>
        {note && <p className="ps-note" role="status">{note}</p>}
        {tip && <div className="ps-tip" role="status"><p>{tip}</p><button type="button" className="ps-link" onClick={() => { close(); window.setTimeout(() => askToTry('home_chat'), 250); }}>Tanya asisten chat</button></div>}
        {rec.kind === 'ayam' && <div className="ps-eggs"><Emoji e="🥚"/><span><b>{rec.eggs || 0}</b> telur emas terkumpul</span>
          {eggReady(rec, needs, today) && <button type="button" className="btn btn-secondary small" onClick={() => { commitPet(collectEgg(state, today)); run('egg'); play('gem'); }}>Ambil telur hari ini</button>}</div>}
        <div className="ps-card-note"><b><Emoji e={info.special.emoji}/> {info.special.name}</b><small>{info.special.text}</small></div>
        <div className="ps-acc">
          <h4>Aksesori</h4>
          <div className="ps-acc-row">
            <button type="button" className={`ps-acc-chip ${!rec.acc ? 'is-on' : ''}`} onClick={() => commitPet(wear(state, null))}>Tanpa</button>
            {ACCESSORIES.map(a => { const open = level >= a.level; return <button type="button" key={a.id} disabled={!open} className={`ps-acc-chip ${rec.acc === a.id ? 'is-on' : ''}`} onClick={() => { commitPet(wear(state, a.id)); play('step'); }}>
              <PetImg e={a.emoji}/>{open ? a.name : `Lv ${a.level}`}</button>; })}
          </div>
        </div>
        <button type="button" className="btn btn-secondary full" onClick={() => { setPicking(true); setChosen(null); }}>Ganti atau adopsi pet lain</button>
        <label className="switch-row ps-show"><input type="checkbox" checked={shown} onChange={e => { setShown(e.target.checked); if (uid) setPetHidden(uid, !e.target.checked); }}/>
          <span><strong>Tampilkan di samping tombol chat</strong><small>Kalau dimatikan, pet tetap ada dan bisa dimunculkan lagi di Pengaturan → Tampilan.</small></span></label>
      </div>}
    </DialogContent>
  </Dialog>;
}
