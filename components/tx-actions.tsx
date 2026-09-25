'use client';
import { createContext, useContext } from 'react';
import type { LedgerTx } from '@/lib/types';

/** Row-level actions (swipe to delete/edit) provided by the app shell to every transaction list. */
export type TxActions = { remove?: (tx: LedgerTx) => void; edit?: (tx: LedgerTx) => void };
export const TxActionsContext = createContext<TxActions>({});
export const useTxActions = () => useContext(TxActionsContext);
