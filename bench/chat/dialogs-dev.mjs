/**
 * Chatbot v2 (7.8) — conversations, development set: used while building the dialogue memory. Each turn is read with
 * what came before (memory, learned phrases); "#save" presses Simpan on the waiting card.
 *   check: 'differs'  the reply is not the same text as the previous reply
 *          'teach'    the reply offers to be taught (an "ajari aku" chip)
 */
export const dialogs = [
  { id: 'd1', turns: [{ text: 'kasih jokes dong', intent: 'joke' }, { text: 'lagi', intent: 'joke', check: 'differs' }, { text: 'wkwk garing', intent: 'banter' }, { text: 'udah ah serius, ringkasan bulan ini', intent: 'summary' }] },
  { id: 'd2', turns: [{ text: 'aku lagi sedih', intent: 'curhat' }, { text: 'kerjaan numpuk terus atasan marah', intent: 'curhat' }, { text: 'iya makasih ya udah dengerin', intent: 'thanks' }] },
  { id: 'd3', turns: [{ text: 'kamu bodoh banget', intent: 'angry' }, { text: 'maaf deh', intent: 'apology' }, { text: 'saldo semua dompet berapa', intent: 'question' }] },
  { id: 'd4', turns: [{ text: 'aku ngantuk', intent: 'smalltalk' }, { text: 'boleh', intent: 'question' }] },
  { id: 'd5', turns: [{ text: 'aku ngantuk', intent: 'smalltalk' }, { text: 'ga usah', intent: 'decline' }] },
  { id: 'd6', turns: [{ text: 'aman ga beli sepatu 500rb', intent: 'afford' }, { text: 'kenapa?', intent: 'explain' }] },
  { id: 'd7', turns: [{ text: 'kasih tips hemat', intent: 'tips' }, { text: 'lagi dong', intent: 'tips', check: 'differs' }] },
  { id: 'd8', turns: [{ text: '290k hokben kemarin gue cuma 45k', intent: 'plan' }, { text: 'jadi 50rb', intent: 'edit' }, { text: '#save' }, { text: 'makasih', intent: 'thanks' }] },
  { id: 'd9', turns: [{ text: 'blablabla qwerty', intent: 'unknown' }, { text: 'zxcv asdf', intent: 'unknown', check: 'teach' }, { text: 'ajari aku', intent: 'teach' }, { text: 'ringkasan bulan ini', intent: 'summary' }, { text: 'zxcv asdf', intent: 'summary' }] },
  { id: 'd10', turns: [{ text: 'kalau aku bilang cekidot artinya ringkasan bulan ini', intent: 'teach' }, { text: 'cekidot', intent: 'summary' }] },
  { id: 'd11', turns: [{ text: 'lagi stres nih', intent: 'curhat' }, { text: 'soalnya duit abis buat bayar kos', intent: 'mood' }] },
];
