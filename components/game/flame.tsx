'use client';
/** 9.4 The Arena flame: three layers that sway and flicker, coloured by tier (it grows and changes colour with the
 * streak), with sparks from "Api Membara" on and a wisp of smoke when it is out. Pure SVG + CSS (globals.css .fl-*). */
import type { CSSProperties } from 'react';
import type { FlameTier } from '@/lib/game';

export function Flame({ tier, size = 64, dim = false, className = '' }: { tier: FlameTier; size?: number; dim?: boolean; className?: string }) {
  const id = `fl${tier}`;
  return <span className={`fl t${tier} ${dim ? 'is-dim' : ''} ${className}`} style={{ '--fs': `${size}px` } as CSSProperties} aria-hidden="true">
    <span className="fl-glow"/>
    <svg viewBox="0 0 100 120" className="fl-svg">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" style={{ stopColor: 'var(--f1b)' }}/><stop offset="1" style={{ stopColor: 'var(--f1)' }}/></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" style={{ stopColor: 'var(--f2b)' }}/><stop offset="1" style={{ stopColor: 'var(--f2)' }}/></linearGradient>
        <radialGradient id={`${id}c`} cx=".5" cy=".75" r=".6"><stop offset="0" style={{ stopColor: '#fff' }}/><stop offset="1" style={{ stopColor: 'var(--f3)' }}/></radialGradient>
      </defs>
      <path className="fl-outer" fill={`url(#${id}a)`} d="M50 4C60 26 88 42 87 76C86 103 67 117 50 117C33 117 14 103 13 77C12 54 30 42 36 22C41 35 45 41 50 44C51 31 47 18 50 4Z"/>
      <path className="fl-mid" fill={`url(#${id}b)`} d="M51 32C59 49 75 60 73 83C71 101 61 109 50 109C39 109 29 101 27 85C25 69 37 60 41 47C44 55 47 58 50 60C51 52 49 42 51 32Z"/>
      <path className="fl-core" fill={`url(#${id}c)`} d="M50 60C56 71 63 78 62 90C61 100 56 105 50 105C44 105 39 100 38 91C37 81 45 75 50 60Z"/>
    </svg>
    {tier >= 3 && <><i className="fl-spark s1"/><i className="fl-spark s2"/><i className="fl-spark s3"/><i className="fl-spark s4"/></>}
    {tier === 0 && <><i className="fl-smoke m1"/><i className="fl-smoke m2"/></>}
  </span>;
}
