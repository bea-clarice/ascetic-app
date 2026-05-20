const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp({
  credential: cert(require("./serviceAccount.json")),
});

const db = getFirestore();
const messaging = getMessaging();
const ICON_URL = "https://ascetic-app-ai.web.app/icons/icon-192.png";

function manilaDate(offsetDays = 0) {
  const date = new Date();
  const manila = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  manila.setDate(manila.getDate() + offsetDays);
  return manila.toISOString().slice(0, 10);
}

function manilaHHMM() {
  const manila = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return manila.toTimeString().slice(0, 5);
}

async function userTokens(uid) {
  const tokensSnap = await db.collection("users").doc(uid).collection("tokens").get();
  return {
    docs: tokensSnap.docs,
    tokens: tokensSnap.docs.map((doc) => doc.data().token).filter(Boolean),
  };
}

async function notificationSettings(uid) {
  const defaults = { push: true, reminder: "08:00", bedtime: "21:00", vibrate: true };
  const snap = await db.collection("users").doc(uid).collection("settings").doc("notifications").get();
  return snap.exists ? { ...defaults, ...snap.data() } : defaults;
}

async function sendPush(uid, title, body) {
  const { docs, tokens } = await userTokens(uid);
  if (!tokens.length) return;

  const response = await messaging.sendEachForMulticast({
    notification: { title, body },
    data: {
      title,
      body,
      url: "https://ascetic-app-ai.web.app/",
      tag: "ascetic-reminder",
      requireInteraction: "false",
    },
    webpush: {
      notification: {
        title,
        body,
        icon: ICON_URL,
        badge: ICON_URL,
        vibrate: [120, 80, 120],
        actions: [
          { action: "open", title: "Open App" },
          { action: "dismiss", title: "Dismiss" },
        ],
      },
      fcmOptions: {
        link: "https://ascetic-app-ai.web.app/",
      },
    },
    tokens,
  });

  response.responses.forEach((result, index) => {
    if (!result.success && result.error?.code === "messaging/registration-token-not-registered") {
      docs[index]?.ref.delete();
    }
  });
}

exports.nightlyReminder = onSchedule("* * * * *", { timeZone: "Asia/Manila" }, async () => {
  try {
    const now = manilaHHMM();
    const yesterday = manilaDate(-1);
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const settings = await notificationSettings(uid);
      if (settings.push === false || (settings.reminder || "08:00") !== now) continue;

      const yesterdayLog = await db.collection("users").doc(uid).collection("logs").doc(yesterday).get();

      if (yesterdayLog.exists) {
        await sendPush(
          uid,
          "Ascetic check-in complete",
          "You logged yesterday's activities. Keep the rhythm going today."
        );
      } else {
        await sendPush(
          uid,
          "Ascetic daily reminder",
          "Daily reminder to keep logging yesterday's activities in Ascetic."
        );
      }
    }

    console.log("[dailyReminder] Done.");
  } catch (error) {
    console.error("[dailyReminder] Error:", error);
  }
});

exports.bedtimeReminder = onSchedule("* * * * *", { timeZone: "Asia/Manila" }, async () => {
  try {
    const now = manilaHHMM();
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const settings = await notificationSettings(uid);
      if (settings.push === false || (settings.bedtime || "21:00") !== now) continue;

      await sendPush(
        uid,
        "Ascetic bedtime reminder",
        "Wind down for bedtime. Put screens away and protect tomorrow's focus."
      );
    }

    console.log("[bedtimeReminder] Done.");
  } catch (error) {
    console.error("[bedtimeReminder] Error:", error);
  }
});

exports.cognitiveReset = onSchedule("every 55 minutes", { timeZone: "Asia/Manila" }, async () => {
  try {
    const yesterday = manilaDate(-1);
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const settings = await notificationSettings(uid);
      if (settings.push === false) continue;

      const logSnap = await db.collection("users").doc(uid).collection("logs").doc(yesterday).get();
      if (!logSnap.exists) continue;

      const focusScore = Number(logSnap.data()?.result?.focus_score);
      if (!Number.isFinite(focusScore) || focusScore > 30) continue;

      await sendPush(
        uid,
        "Digital Detox break",
        "Take a 5-minute break. Step away from screens and reset your focus."
      );
    }

    console.log("[cognitiveReset] Done.");
  } catch (error) {
    console.error("[cognitiveReset] Error:", error);
  }
});
