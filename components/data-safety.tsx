'use client';
import { CloudOff, KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-react';

/**
 * 6.4 Pengaturan › Keamanan: how the person's data is kept, in plain words and only what is true of this app.
 */
export function DataSafetyCard() {
  const points: [typeof Lock, string, string][] = [
    [Lock, 'Terenkripsi', 'Data dikirim lewat koneksi terenkripsi dan disimpan terenkripsi di cloud.'],
    [KeyRound, 'Cuma dari akunmu', 'Aturan akses cloud memastikan catatanmu hanya bisa dibuka dari akunmu sendiri. Akun lain tidak bisa membacanya.'],
    [ShieldCheck, 'Pemilik aplikasi tidak bisa melihat isinya', 'Di Dompet Ajaib, pemilik hanya melihat email dan kapan terakhir kamu aktif untuk mengatur akses. Tidak ada fitur untuk membuka catatanmu.'],
    [Smartphone, 'Dibaca di HP', 'Catat otomatis, Tanya, dan Scan struk berjalan di HP-mu. Kalimat dan foto tidak dikirim ke layanan AI mana pun.'],
    [CloudOff, 'Foto struk tidak disimpan', 'Foto struk dibaca di HP lalu dibuang dan tidak dikirim ke mana pun. Yang disimpan hanya hasil catatannya.'],
  ];
  return <div className="set-card data-safety">
    <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><ShieldCheck size={20}/></span><div><h3>Keamanan datamu</h3><p>Apa yang terjadi dengan catatan keuanganmu.</p></div></div>
    <ul>{points.map(([Icon, title, text]) => <li key={title}><span aria-hidden="true"><Icon size={16}/></span><div><strong>{title}</strong><small>{text}</small></div></li>)}</ul>
  </div>;
}
