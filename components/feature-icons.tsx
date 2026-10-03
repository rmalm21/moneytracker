'use client';
import { AlertTriangle, Archive, BadgeInfo, BarChart3, BellRing, BookOpen, BookOpenText, CalendarClock, CalendarDays, ChartNoAxesCombined, CircleHelp, Compass, CreditCard, DatabaseBackup, Eye, FlaskConical, Gift, HandCoins, HeartPulse, Inbox, KeyRound, Layers3, LayoutGrid, Lightbulb, ListFilter, Palette, Percent, Plus, ReceiptText, RefreshCw, Repeat, ArrowLeftRight, Scale, ScanText, ScrollText, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Sparkles, Tag, Target, TrendingDown, TrendingUp, UserRound, Wallet, type LucideIcon } from 'lucide-react';

/** Registry icon names (lib/features.ts) → lucide icons. */
export const featureIcons: Record<string, LucideIcon> = {
  alert: AlertTriangle, archive: Archive, bag: ShoppingBag, bell: BellRing, book: BookOpenText, bookopen: BookOpen, calendar: CalendarDays, calendarclock: CalendarClock,
  card: CreditCard, chart: BarChart3, compass: Compass, database: DatabaseBackup, down: TrendingDown, eye: Eye, flask: FlaskConical, gift: Gift, grid: LayoutGrid,
  handcoins: HandCoins, help: CircleHelp, inbox: Inbox, info: BadgeInfo, key: KeyRound, layers: Layers3, lightbulb: Lightbulb, list: ListFilter, palette: Palette,
  percent: Percent, phone: Smartphone, plus: Plus, pulse: HeartPulse, receipt: ReceiptText, refresh: RefreshCw, repeat: Repeat, scale: Scale, scan: ScanText,
  scroll: ScrollText, settings: Settings, shield: ShieldCheck, sliders: SlidersHorizontal, sparkles: Sparkles, tag: Tag, target: Target, transfer: ArrowLeftRight,
  trend: ChartNoAxesCombined, up: TrendingUp, user: UserRound, wallet: Wallet,
};
export function FeatureIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = featureIcons[name] || Sparkles;
  return <Icon size={size} aria-hidden="true"/>;
}
