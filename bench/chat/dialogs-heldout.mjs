/**
 * Chatbot v2 (7.8) — conversations, held-out: written before the v2 dialogue memory was built, in other words than
 * dialogs-dev.mjs, and not used while building. Run once with --first (frozen). Format as in dialogs-dev.mjs.
 */
export const dialogs = [
  { id: 'h1', turns: [{ text: 'ceritain lelucon', intent: 'joke' }, { text: 'satu lagi dong', intent: 'joke', check: 'differs' }, { text: 'hahaha lumayan', intent: 'banter' }] },
  { id: 'h2', turns: [{ text: 'pantun dong', intent: 'joke' }, { text: 'maksudnya apa?', intent: 'explain' }] },
  { id: 'h3', turns: [{ text: 'aku capek banget hari ini', intent: 'curhat' }, { text: 'iya kerjaan ga beres beres', intent: 'curhat' }, { text: 'makasih ya', intent: 'thanks' }] },
  { id: 'h4', turns: [{ text: 'lagi patah hati nih', intent: 'curhat' }, { text: 'dia ninggalin aku', intent: 'curhat' }, { text: 'udah deh, cek anggaran aja', intent: 'budget' }] },
  { id: 'h5', turns: [{ text: 'kamu nyebelin', intent: 'angry' }, { text: 'iya maaf aku emosi', intent: 'apology' }, { text: 'kapan gajian', intent: 'payday' }] },
  { id: 'h6', turns: [{ text: 'apa kabar bot', intent: 'smalltalk' }, { text: 'baik kok', intent: 'ack' }] },
  { id: 'h7', turns: [{ text: 'aku bosen', intent: 'smalltalk' }, { text: 'gas', intent: 'question' }] },
  { id: 'h8', turns: [{ text: 'selamat tidur', intent: 'smalltalk' }, { text: 'nggak usah', intent: 'decline' }] },
  { id: 'h9', turns: [{ text: 'boleh ga beli headset 400rb', intent: 'afford' }, { text: 'kok gitu?', intent: 'explain' }] },
  { id: 'h10', turns: [{ text: 'tips hemat dong', intent: 'tips' }, { text: 'yang lain?', intent: 'tips', check: 'differs' }] },
  { id: 'h11', turns: [{ text: 'bakso rame-rame 150rb aku cuma 25rb', intent: 'plan' }, { text: 'kemarin', intent: 'edit' }, { text: '#save' }, { text: 'batalin yang tadi', intent: 'undo' }] },
  { id: 'h12', turns: [{ text: 'qwertyuiop', intent: 'unknown' }, { text: 'asdfgh jkl', intent: 'unknown', check: 'teach' }, { text: 'aku ajarin ya', intent: 'teach' }, { text: 'kasih tips hemat', intent: 'tips' }, { text: 'asdfgh jkl', intent: 'tips' }] },
  { id: 'h13', turns: [{ text: 'inget ya, kece itu artinya ringkasan bulan ini', intent: 'teach' }, { text: 'kece', intent: 'summary' }] },
];
