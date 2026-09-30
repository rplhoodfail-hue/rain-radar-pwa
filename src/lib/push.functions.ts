import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const subscriptionSchema = z.object({
  installationId: z.string().uuid(),
  token: z.string().min(40).max(4096),
  adm4: z.string().regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/),
  locationLabel: z.string().min(2).max(120),
  timezone: z.string().min(3).max(80),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((data) => subscriptionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("weather_push_subscriptions").upsert(
      {
        installation_id: data.installationId,
        fcm_token: data.token,
        adm4: data.adm4,
        location_label: data.locationLabel,
        timezone: data.timezone,
      },
      { onConflict: "installation_id" },
    );
    if (error) throw new Error("Tidak dapat menyimpan pilihan notifikasi.");
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ installationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("weather_push_subscriptions")
      .delete()
      .eq("installation_id", data.installationId);
    if (error) throw new Error("Tidak dapat mematikan notifikasi.");
    return { ok: true };
  });