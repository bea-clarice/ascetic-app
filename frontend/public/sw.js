// ─── Ascetic Service Worker ───────────────────────────────────────────────────
// Handles: offline caching, FCM push notifications, vibration

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Must match your firebaseConfig in index.html
firebase.initializeApp({
  apiKey: "AIzaSyBBo67fMWRHIbvCptdmo5WrzREMmq1wHbI",
  authDomain: "ascetic-app-ai.firebaseapp.com",
  projectId: "ascetic-app-ai",
  storageBucket: "ascetic-app-ai.firebasestorage.app",
  messagingSenderId: "660532686250",
  appId: "1:660532686250:web:9d7d0cc7f37dbfeb4e4fd3"
});

const messaging = firebase.messaging();

const CACHE_NAME = "ascetic-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ─── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// ─── Fetch: serve from cache, fallback to network ─────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("firestore") || event.request.url.includes("googleapis")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match("/index.html")))
  );
});

// ─── Background Push (app is closed) ──────────────────────────────────────────
// Firebase Messaging handles this automatically via messaging.onBackgroundMessage
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "Ascetic", {
    body: body || "Time to check in.",
    icon: icon || "/icons/icon-192.png",
    badge: "/icons/icon-72.png",
    vibrate: [120, 80, 120, 80, 120],
    data: payload.data || {},
    actions: [
      { action: "open", title: "Open App" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
});

// ─── Foreground Push (app is open) ────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "Ascetic", body: event.data.text() } };
  }

  const { title, body, icon } = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(title || "Ascetic", {
      body: body || "Time to check in.",
      icon: icon || "/icons/icon-192.png",
      badge: "/icons/icon-72.png",
      vibrate: [120, 80, 120, 80, 120],
      data: payload.data || {},
    })
  );
});

// ─── Notification Click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});