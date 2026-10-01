import { removePushSubscription, savePushSubscription } from "@/lib/push.functions";
import type { SelectedLocation } from "@/lib/locations";

const appId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"];
const vapidKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"];
const config = {
  apiKey: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"],
  projectId: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"],
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

const INSTALLATION_KEY = "cuacaku-installation-id";

function installationId(): string {
  const existing = localStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

export type PushStatus = "registered" | "not-configured" | "unsupported" | "open-in-new-tab" | "denied";

export async function enablePush(location: SelectedLocation): Promise<PushStatus> {
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!config.apiKey || !config.projectId || !appId || !vapidKey || !config.messagingSenderId) return "not-configured";
  if (!("Notification" in window) || !(await isSupported())) return "unsupported";
  if (window.top !== window.self) return "open-in-new-tab";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const query = new URLSearchParams(config).toString();
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const app = getApps()[0] ?? initializeApp(config);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return "denied";
  await savePushSubscription({
    data: {
      installationId: installationId(),
      token,
      adm4: location.adm4,
      locationLabel: location.label,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
    },
  });
  const { onMessage } = await import("firebase/messaging");
  onMessage(getMessaging(app), (payload) => {
    playAlertSound();
    const n = payload.notification;
    if (n?.title) registration.showNotification(n.title, { body: n.body, icon: "/icon-192.png", requireInteraction: true });
  });
  return "registered";
}

export async function disablePush(): Promise<void> {
  const [{ getApps }, { deleteToken, getMessaging, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  const id = localStorage.getItem(INSTALLATION_KEY);
  if (id) await removePushSubscription({ data: { installationId: id } });
  if (await isSupported()) {
    const app = getApps()[0];
    if (app) await deleteToken(getMessaging(app));
  }
}