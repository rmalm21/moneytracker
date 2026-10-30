/**
 * 8.1 chat state: the 8.0 account (bench/v80/state.mjs) with shop names on the records, so "paling sering belanja di
 * mana" has something to count. Days without spending, weekdays and counts come from the same records.
 */
import { fullCtx, borosCtx } from '../v80/state.mjs';
const shop = { t1: 'Warteg Bahari', t4: 'Kopi Kenangan', t5: 'Indomaret', t6: 'Indomaret', t8: 'Kopi Kenangan', t9: 'Indomaret', t11: 'Warteg Bahari', t2: 'Pertamina' };
const transactions = fullCtx.data.transactions.map(x => shop[x.id] ? { ...x, merchant: shop[x.id] } : x);
export const statsCtx = { ...fullCtx, data: { ...fullCtx.data, transactions }, quick: { ...fullCtx.quick, ask: { ...fullCtx.quick.ask, transactions } } };
export { fullCtx, borosCtx };
