import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { fetchBmkgForecast } from "@/lib/weather";

type Subscription = {
  id: string;
  fcm_token: string;
  adm4: string;
  location_label: string;
  last_alert_key: string | null;
};

function rainPhrase(items: Awaited<ReturnType<typeof fetchBmkgForecast>>["items"]) {
  const now = Date.now();
  const future = items
    .filter((item) => new Date(item.datetime).getTime() >= now)
    .sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime));
  const rain = future.find((item) => /hujan|petir/i.test(item.weather_desc) || (item.tp ?? 0) > 0.2);
  if (!rain) return { key: `cerah-${new Date().toISOString().slice(0, 10)}`, title: "Cuaca terlihat bersahabat ☀️", body: "Prakiraan terdekat cerah. Tetap cek CuacaKu sebelum beraktivitas." };
  const hours = Math.max(0, Math.round((+new Date(rain.datetime) - now) / 3_600_000));
  const when = hours >= 18 ? "Besok diperkirakan akan hujan" : hours <= 1 ? "Hujan diperkirakan segera turun" : `Sekitar ${hours} jam lagi diperkirakan hujan`;
  return { key: `hujan-${rain.datetime}`, title: "Siap-siap hujan 🌧️", body: `${when} di lokasi Anda. Siapkan payung ya-^` };
}

export const Route = createFileRoute("/api/public/weather-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("weather_push_subscriptions").select("id,fcm_token,adm4,location_label,last_alert_key");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const groups = new Map<string, Subscription[]>();
        for (const row of data ?? []) groups.set(row.adm4, [...(groups.get(row.adm4) ?? []), row]);
        let sent = 0;
        for (const [adm4, subscriptions] of groups) {
          try {
            const forecast = await fetchBmkgForecast(adm4);
            const alert = rainPhrase(forecast.items);
            for (const subscription of subscriptions) {
              if (subscription.last_alert_key === alert.key) continue;
              const lovableKey = process.env['LOVABLE_API_KEY'];
              const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
              if (!lovableKey || !connectionKey) throw new Error("Firebase belum dikonfigurasi");
              const response = await fetch("https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send", {
                method: "POST",
                headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
                body: JSON.stringify({ message: { token: subscription.fcm_token, notification: { title: alert.title, body: alert.body }, data: { path: "/" } } }),
              });
              if (response.ok) {
                sent += 1;
                await supabaseAdmin.from("weather_push_subscriptions").update({ last_alert_key: alert.key, last_alerted_at: new Date().toISOString() }).eq("id", subscription.id);
              } else if ([400, 404].includes(response.status)) {
                await supabaseAdmin.from("weather_push_subscriptions").delete().eq("id", subscription.id);
              } else {
                console.error(`FCM send failed [${response.status}]: ${await response.text()}`);
              }
            }
          } catch (forecastError) {
            console.error(`Weather alert failed for ${adm4}`, forecastError);
          }
        }
        return Response.json({ ok: true, sent });
      },
    },
  },
});