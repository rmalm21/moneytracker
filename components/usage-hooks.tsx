'use client';
/** Small hooks shared by 5.0 components (kept apart so the search sheet and its help index load only when opened). */
import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from './app-provider';
import { readUsage, subscribeUsage } from '@/lib/usage';
import type { FeatureAction } from '@/lib/features';

export type OpenFeature = (action: FeatureAction, featureId?: string) => void;

/** Live usage for the signed-in account (recent, favorites, visits). */
export function useUsage() {
  const { user } = useApp();
  const uid = user?.uid;
  return useSyncExternalStore(subscribeUsage, () => readUsage(uid), () => readUsage(undefined));
}

/** Ctrl/Cmd+K opens search from anywhere. */
export function useSearchHotkey(openSearch: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);
}
