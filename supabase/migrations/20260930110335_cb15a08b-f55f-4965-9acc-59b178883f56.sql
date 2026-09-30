CREATE TABLE public.weather_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL UNIQUE,
  fcm_token text NOT NULL UNIQUE,
  adm4 text NOT NULL,
  location_label text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  rain_alerts boolean NOT NULL DEFAULT true,
  fair_weather_updates boolean NOT NULL DEFAULT true,
  last_alert_key text,
  last_alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.weather_push_subscriptions TO service_role;
ALTER TABLE public.weather_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_weather_push_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_weather_push_updated_at
BEFORE UPDATE ON public.weather_push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_weather_push_updated_at();