/**
 * System notifications with the Dompet Ajaib look: the full-colour logo as the large icon,
 * a white wallet silhouette as the small status-bar icon (Android draws badges as a mask),
 * a short vibration and `renotify` so Android shows it as a floating (heads-up) banner.
 */
export const NOTIFY_ICON = '/icons/icon-192.png';
export const NOTIFY_BADGE = '/icons/badge-96.png';

export function notificationOptions(body: string, url: string, tag: string): NotificationOptions {
  return { body, tag, icon: NOTIFY_ICON, badge: NOTIFY_BADGE, data: { url }, lang: 'id', dir: 'ltr', silent: false, renotify: true, requireInteraction: false, timestamp: Date.now(), vibrate: [120, 60, 120], actions: [{ action: 'open', title: 'Buka' }] } as NotificationOptions;
}

export const notificationsAllowed = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/** Show a system notification (through the service worker when available). Returns true when shown. */
export async function showAppNotification(title: string, body: string, url = '/', tag = 'dompet-ajaib') {
  if (!notificationsAllowed()) return false;
  const options = notificationOptions(body, url, tag);
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) { await registration.showNotification(title, options); return true; }
    const { actions: _actions, ...plain } = options as NotificationOptions & { actions?: unknown };
    new Notification(title, plain); return true;
  } catch { return false; }
}
