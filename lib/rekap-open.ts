/** 9.5 Rekap opens from anywhere (header, Beranda, Laporan, Insight, the banner): one window, kept by the app page. */
export const REKAP_EVENT = 'dompet-ajaib:open-rekap';
/** `initial` is a period key ("2026-10" or "2026"); empty for the usual one. */
export function openRekap(initial = '') { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<string>(REKAP_EVENT, { detail: initial })); }
