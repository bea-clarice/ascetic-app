// Ascetic service worker: offline cache, FCM background push, notification vibration.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBBo67fMWRHIbvCptdmo5WrzREMmq1wHbI",
  authDomain: "ascetic-app-ai.firebaseapp.com",
  projectId: "ascetic-app-ai",
  storageBucket: "ascetic-app-ai.firebasestorage.app",
  messagingSenderId: "660532686250",
  appId: "1:660532686250:web:9d7d0cc7f37dbfeb4e4fd3",
});

const messaging = firebase.messaging();
const CACHE_NAME = "ascetic-v4";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/ascetic-logo.svg",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("firestore") || event.request.url.includes("googleapis")) return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request).catch(() => caches.match("/index.html")))
  );
});

function unwrapPayload(payload = {}) {
  return payload.data?.FCM_MSG || payload;
}

function notificationFromPayload(rawPayload = {}) {
  const payload = unwrapPayload(rawPayload);
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "Ascetic";
  const body = notification.body || data.body || "Time to check in.";

  return {
    title,
    options: {
      body,
      icon: notification.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || payload.messageId || "ascetic-reminder",
      renotify: true,
      requireInteraction: data.requireInteraction === "true",
      vibrate: [180, 80, 180, 80, 180],
      data: {
        ...data,
        url: payload.fcmOptions?.link || data.url || "/",
      },
      actions: [
        { action: "open", title: "Open App" },
        { action: "dismiss", title: "Dismiss" },
      ],
    },
  };
}

function showAsceticNotification(payload) {
  const notification = notificationFromPayload(payload);
  return self.registration.showNotification(notification.title, notification.options);
}

messaging.onBackgroundMessage((payload) => {
  showAsceticNotification(payload);
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "Ascetic", body: event.data.text() } };
  }

  event.waitUntil(showAsceticNotification(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
