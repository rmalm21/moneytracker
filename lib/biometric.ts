/**
 * Unlock with fingerprint / face using the device's own authenticator (WebAuthn "platform"
 * authenticator: Android fingerprint or face unlock, Touch ID / Face ID, Windows Hello).
 * The biometric never reaches the app: the device checks it and only answers yes or no.
 * It replaces typing the PIN on this device; the PIN stays as the fallback.
 */
const key = (uid: string) => `dompet-ajaib:biometric:${uid}`;
export type BiometricRecord = { id: string; createdAt: string; label: string };

const b64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text: string) => { const pad = text.replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(pad + '==='.slice((pad.length + 3) % 4)); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function biometricSupported() {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export function biometricRecord(uid: string): BiometricRecord | null {
  try { return JSON.parse(localStorage.getItem(key(uid)) || 'null'); } catch { return null; }
}
export const biometricEnabled = (uid: string) => Boolean(uid && biometricRecord(uid));
export function disableBiometric(uid: string) { try { localStorage.removeItem(key(uid)); } catch { /* nothing stored */ } }

/** A readable name for this device, shown in Settings. */
export function deviceLabel() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad (Face ID / Touch ID)';
  if (/Android/.test(ua)) return 'HP Android (sidik jari / wajah)';
  if (/Mac/.test(ua)) return 'Mac (Touch ID)';
  if (/Windows/.test(ua)) return 'Windows (Windows Hello)';
  return 'Perangkat ini';
}

/** Turn a WebAuthn error into a short Indonesian message ('' when the user simply cancelled). */
export function biometricError(error: unknown) {
  const name = (error as { name?: string } | null)?.name || '';
  if (name === 'NotAllowedError' || name === 'AbortError') return '';
  if (name === 'InvalidStateError') return 'Sidik jari sudah terdaftar di perangkat ini.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'Perangkat atau browser ini belum mendukung sidik jari.';
  return 'Sidik jari belum bisa dipakai. Coba lagi atau gunakan PIN.';
}

/** Register this device: the system prompt asks for the fingerprint/face once. */
export async function enableBiometric(uid: string, name: string) {
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: challenge(),
    rp: { name: 'Dompet Ajaib', id: location.hostname },
    user: { id: new TextEncoder().encode(uid).slice(0, 64), name: name || 'Dompet Ajaib', displayName: name || 'Dompet Ajaib' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } }) as PublicKeyCredential | null;
  if (!credential) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
  const record: BiometricRecord = { id: b64url(credential.rawId), createdAt: new Date().toISOString(), label: deviceLabel() };
  localStorage.setItem(key(uid), JSON.stringify(record));
  return record;
}

/** Ask for the fingerprint/face. Resolves true only when the device verified the user. */
export async function verifyBiometric(uid: string) {
  const record = biometricRecord(uid);
  if (!record) return false;
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: challenge(), rpId: location.hostname, timeout: 60000, userVerification: 'required',
    allowCredentials: [{ type: 'public-key', id: fromB64url(record.id), transports: ['internal', 'hybrid'] as AuthenticatorTransport[] }],
  } }) as PublicKeyCredential | null;
  if (!assertion || b64url(assertion.rawId) !== record.id) return false;
  // Flags byte of authenticatorData: bit 0 = user present, bit 2 = user verified (biometric/PIN of the device).
  const data = new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData);
  return data.length > 32 && (data[32] & 0x05) === 0x05;
}
