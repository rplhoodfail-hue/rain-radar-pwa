CREATE POLICY "No direct client access to weather push subscriptions"
ON public.weather_push_subscriptions
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);