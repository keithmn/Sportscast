// Wave 3 — notification foundation. One global, site-wide opt-in (footer,
// see renderFooter's #push-placeholder in site.js) rather than a per-page
// control: what a subscribed device actually receives is filtered
// server-side against its existing Follow rows (server/lib/push.js), so
// there's no separate per-topic UI to build here. getAnonymousId() is the
// same device id follows.js/site.js already use.
//
// Standard VAPID-key conversion — the Push API wants a Uint8Array, the
// server hands back a URL-safe base64 string.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getExistingSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function pushButtonHtml(subscribed) {
  return `<button type="button" id="push-toggle-btn" class="btn-outline-sm" data-subscribed="${subscribed}">${subscribed ? '🔔 Notifications on' : '🔔 Enable Notifications'}</button>`;
}

async function subscribeToPush() {
  const { publicKey } = await api('/api/push/vapid-public-key');
  if (!publicKey) throw new Error('Notifications aren\'t available right now.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications permission was not granted.');

  const anonymousId = getAnonymousId();
  if (!anonymousId) throw new Error('Could not enable notifications on this device.');

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ anonymousId, subscription: subscription.toJSON() }) });
}

async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }).catch(() => {});
}

async function initPushUI() {
  const placeholder = document.getElementById('push-placeholder');
  if (!placeholder || !pushSupported()) return;

  let subscribed = false;
  try {
    subscribed = Boolean(await getExistingSubscription());
  } catch {
    return; // service worker not ready / unsupported context — leave the control off
  }
  placeholder.innerHTML = pushButtonHtml(subscribed);

  const btn = document.getElementById('push-toggle-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (btn.dataset.subscribed === 'true') {
        await unsubscribeFromPush();
        btn.textContent = '🔔 Enable Notifications';
        btn.dataset.subscribed = 'false';
      } else {
        await subscribeToPush();
        btn.textContent = '🔔 Notifications on';
        btn.dataset.subscribed = 'true';
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}
