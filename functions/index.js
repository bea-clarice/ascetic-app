const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp({
  credential: cert(require("./serviceAccount.json")),
});

const db = getFirestore();
const messaging = getMessaging();

// ─── Nightly Reminder at 10:00 PM Philippine Time ─────────────────────────────
exports.nightlyReminder = onSchedule("0 22 * * *", { timeZone: "Asia/Manila" }, async () => {
  try {
    // Get all users
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      // Get all FCM tokens for this user
      const tokensSnap = await db.collection("users").doc(uid).collection("tokens").get();
      if (tokensSnap.empty) continue;

      // Check if user already logged today
      const today = new Date().toISOString().slice(0, 10);
      const todayLog = await db.collection("users").doc(uid).collection("logs").doc(today).get();

      const title = "Ascetic Reminder";
      const body = todayLog.exists
        ? "Great job logging today! Keep the streak alive tomorrow."
        : "You haven't logged today yet. Record your habits before sleeping.";

      // Send to each device token
      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (!tokens.length) continue;

      const message = {
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: "https://ascetic-app-ai.web.app/icons/icon-192.png",
            vibrate: [120, 80, 120],
            actions: [{ action: "open", title: "Open App" }],
          },
        },
        tokens,
      };

      const response = await messaging.sendEachForMulticast(message);

      // Clean up invalid tokens
      response.responses.forEach((res, index) => {
        if (!res.success && res.error?.code === "messaging/registration-token-not-registered") {
          tokensSnap.docs[index].ref.delete();
        }
      });
    }

    console.log("[nightlyReminder] Done.");
  } catch (error) {
    console.error("[nightlyReminder] Error:", error);
  }
});

// ─── 55-Minute Cognitive Reset (every 55 minutes during study hours) ──────────
exports.cognitiveReset = onSchedule("*/55 8-22 * * *", { timeZone: "Asia/Manila" }, async () => {
  try {
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const tokensSnap = await db
        .collection("users").doc(userDoc.id).collection("tokens").get();
      if (tokensSnap.empty) continue;

      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (!tokens.length) continue;

      await messaging.sendEachForMulticast({
        notification: {
          title: "Cognitive Reset",
          body: "Take a 5-minute active break. Stand up, stretch, and step away from screens.",
        },
        webpush: {
          notification: {
            icon: "https://ascetic-app-ai.web.app/icons/icon-192.png",
            vibrate: [120, 80, 120],
          },
        },
        tokens,
      });
    }
    console.log("[cognitiveReset] Done.");
  } catch (error) {
    console.error("[cognitiveReset] Error:", error);
  }
});