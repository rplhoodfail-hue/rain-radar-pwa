import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SCHOOL_ADM4 = "35.02.17.1010";

async function sign(payload: string): Promise<string> {
  const secret = process.env["ADMIN_PASSWORD"] ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret + "|cuacaku-admin"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verify(token: string) {
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) throw new Error("Sesi admin berakhir, silakan login ulang.");
  if ((await sign(exp)) !== sig) throw new Error("Token admin tidak valid.");
}

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().max(100), password: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const u = process.env["ADMIN_USERNAME"], p = process.env["ADMIN_PASSWORD"];
    if (!u || !p || data.username !== u || data.password !== p) return { ok: false as const, error: "Username atau password salah." };
    const exp = String(Date.now() + 8 * 3600_000);
    return { ok: true as const, token: `${exp}.${await sign(exp)}` };
  });

export const adminDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    await verify(data.token);
    const t0 = Date.now();
    const { fetchBmkgForecast, pickCurrent } = await import("@/lib/weather");
    const forecast = await fetchBmkgForecast(SCHOOL_ADM4);
    const bmkgLatency = Date.now() - t0;
    const current = pickCurrent(forecast.items);
    const now = Date.now();
    const next = forecast.items
      .filter((i) => +new Date(i.datetime) >= now - 3600_000)
      .sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime))
      .slice(0, 8)
      .map((i) => ({ datetime: i.datetime, t: i.t, hu: i.hu, tp: i.tp ?? 0, ws: i.ws, desc: i.weather_desc }));
    const rainSoon = next.find((i) => +new Date(i.datetime) - now <= 3 * 3600_000 && (/hujan|petir/i.test(i.desc) || i.tp > 0.2));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("weather_push_subscriptions").select("id", { count: "exact", head: true });
    let memory: { rss: number; heapUsed: number; heapTotal: number } | null = null;
    try {
      const m = process.memoryUsage();
      memory = { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal };
    } catch { memory = null; }
    return {
      location: `${forecast.lokasi.desa}, ${forecast.lokasi.kecamatan}, ${forecast.lokasi.kotkab}`,
      current: { t: current.t, hu: current.hu, tp: current.tp ?? 0, ws: current.ws, wd: current.wd, desc: current.weather_desc },
      next,
      rainSoon: rainSoon ? { datetime: rainSoon.datetime, desc: rainSoon.desc } : null,
      subscribers: count ?? 0,
      server: { bmkgLatency, memory, time: new Date().toISOString() },
    };
  });

export const adminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(300), title: z.string().min(2).max(80), body: z.string().min(2).max(300) }).parse(d))
  .handler(async ({ data }) => {
    await verify(data.token);
    const lovableKey = process.env["LOVABLE_API_KEY"], connectionKey = process.env["FIREBASE_MESSAGING_API_KEY"];
    if (!lovableKey || !connectionKey) throw new Error("Notifikasi belum dikonfigurasi.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin.from("weather_push_subscriptions").select("id,fcm_token");
    let sent = 0, failed = 0;
    for (const s of subs ?? []) {
      const res = await fetch("https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token: s.fcm_token,
          notification: { title: data.title, body: data.body },
          data: { path: "/", alert: "1" },
          android: { priority: "high", notification: { sound: "default" } },
          webpush: { headers: { Urgency: "high" }, notification: { requireInteraction: true, vibrate: [300, 100, 300, 100, 300], icon: "/icon-192.png", badge: "/icon-192.png" } },
        } }),
      });
      if (res.ok) sent++;
      else {
        failed++;
        if ([400, 404].includes(res.status)) await supabaseAdmin.from("weather_push_subscriptions").delete().eq("id", s.id);
        else console.error(`FCM [${res.status}]: ${await res.text()}`);
      }
    }
    return { sent, failed };
  });
