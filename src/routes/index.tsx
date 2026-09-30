import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CloudRain,
  Droplets,
  Flame,
  GraduationCap,
  Loader2,
  MapPin,
  Bell,
  BellOff,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Navigation,
  Thermometer,
  Wind,
} from "lucide-react";
import {
  computeFireIndex,
  fetchBmkgForecast,
  formatWib,
  pickCurrent,
  rainNext24h,
  windDirectionId,
  type BmkgForecastItem,
} from "@/lib/weather";
import {
  DEFAULT_LOCATION,
  SMK_PGRI2,
  fetchKabupaten,
  fetchKecamatan,
  fetchKelurahan,
  fetchProvinsi,
  toAdm4,
  type SelectedLocation,
} from "@/lib/locations";
import { getBmkgNews } from "@/lib/news.functions";
import { disablePush, enablePush, type PushStatus } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CuacaKu — Prediksi Cuaca BMKG" },
      {
        name: "description",
        content:
          "Cek prediksi cuaca resmi BMKG: suhu, kelembapan, curah hujan, indeks bahaya kebakaran, dan arah angin untuk seluruh Indonesia, termasuk SMK PGRI 2 Ponorogo.",
      },
      { property: "og:title", content: "CuacaKu — Prediksi Cuaca BMKG" },
      {
        property: "og:description",
        content:
          "Prediksi cuaca BMKG: suhu, kelembapan, curah hujan, indeks kebakaran, dan arah angin. Lokasi khusus SMK PGRI 2 Ponorogo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WeatherPage,
});

function WeatherPage() {
  const [location, setLocation] = useState<SelectedLocation>(DEFAULT_LOCATION);
  const [pushStatus, setPushStatus] = useState<PushStatus | "idle" | "loading">("idle");
  const [isNight, setIsNight] = useState(false);

  const forecastQuery = useQuery({
    queryKey: ["bmkg-forecast", location.adm4],
    queryFn: () => fetchBmkgForecast(location.adm4),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const forecast = forecastQuery.data;
  const current = forecast ? pickCurrent(forecast.items) : undefined;
  const rain24 = forecast ? rainNext24h(forecast.items) : 0;
  const fire = current ? computeFireIndex(current, rain24) : undefined;
  const newsQuery = useQuery({ queryKey: ["bmkg-news"], queryFn: () => getBmkgNews(), staleTime: 5 * 60 * 1000 });
  const scene = current ? weatherScene(current) : "clear";

  useEffect(() => {
    const hour = new Date().getHours();
    setIsNight(hour < 6 || hour >= 18);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setPushStatus("registered");
  }, []);

  async function handlePush() {
    setPushStatus("loading");
    try {
      setPushStatus(await enablePush(location));
    } catch {
      setPushStatus("not-configured");
    }
  }

  async function handleDisablePush() {
    setPushStatus("loading");
    await disablePush();
    setPushStatus("idle");
  }

  return (
    <div className={`weather-stage weather-${scene} ${isNight ? "time-night" : "time-day"} min-h-screen`}>
      <WeatherAtmosphere scene={scene} isNight={isNight} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <Header />

        <LocationPicker location={location} onChange={setLocation} />

        {forecastQuery.isLoading && (
          <div className="mt-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Mengambil data prakiraan BMKG…</p>
          </div>
        )}

        {forecastQuery.isError && (
          <div className="glass-card mt-8 rounded-2xl p-6 text-center">
            <p className="font-semibold text-destructive">Data cuaca gagal dimuat</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {forecastQuery.error instanceof Error
                ? forecastQuery.error.message
                : "Terjadi kesalahan jaringan."}{" "}
              Coba pilih lokasi lain atau muat ulang.
            </p>
            <Button
              onClick={() => forecastQuery.refetch()}
              className="mt-4"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {forecast && current && fire && (
          <>
            <CurrentHero
              item={current}
              locationLabel={location.label}
              desa={forecast.lokasi.desa}
              kecamatan={forecast.lokasi.kecamatan}
              kotkab={forecast.lokasi.kotkab}
            />

            <WeatherAlert item={current} items={forecast.items} />

            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                icon={<Thermometer className="h-5 w-5 text-sun" />}
                title="Suhu"
                value={`${Math.round(current.t)}°C`}
                subtitle={current.t >= 32 ? "Panas" : current.t >= 26 ? "Hangat" : "Sejuk"}
              />
              <StatCard
                icon={<Droplets className="h-5 w-5 text-sky" />}
                title="Kelembapan"
                value={`${current.hu}%`}
                subtitle={current.hu >= 80 ? "Lembap" : current.hu >= 60 ? "Normal" : "Kering"}
              />
              <StatCard
                icon={<CloudRain className="h-5 w-5 text-rain" />}
                title="Curah Hujan"
                value={`${rain24.toFixed(1)} mm`}
                subtitle="Prakiraan 24 jam"
              />
              <StatCard
                icon={<Flame className={`h-5 w-5 fire-${fire.tone}`} />}
                title="Indeks Kebakaran"
                value={fire.label}
                subtitle={`FFDI ${fire.value} — ${fire.description}`}
                toneClass={`bg-fire-${fire.tone}`}
              />
              <StatCard
                icon={<Wind className="h-5 w-5 text-primary" />}
                title="Arah Angin"
                value={windDirectionId(current.wd)}
                subtitle={`${current.ws} km/jam`}
                windDeg={current.wd_deg}
              />
            </section>

            <ForecastStrip items={forecast.items} />

            <NotificationPanel
              status={pushStatus}
              onEnable={handlePush}
              onDisable={handleDisablePush}
              locationLabel={location.label}
            />

            <BmkgNews data={newsQuery.data ?? []} loading={newsQuery.isLoading} />

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Sumber data: API resmi BMKG (api.bmkg.go.id) · Indeks kebakaran adalah
              estimasi FFDI dari parameter cuaca · Waktu dalam WIB
            </p>
          </>
        )}
      </div>
    </div>
  );
}

type WeatherScene = "rain" | "windy" | "hot" | "cloudy" | "clear";

function weatherScene(item: BmkgForecastItem): WeatherScene {
  if (/hujan|petir/i.test(item.weather_desc) || (item.tp ?? 0) > 0.2) return "rain";
  if (item.ws >= 18) return "windy";
  if (item.t >= 32) return "hot";
  if (/berawan|kabut/i.test(item.weather_desc) || (item.tcc ?? 0) >= 60) return "cloudy";
  return "clear";
}

function WeatherAtmosphere({ scene, isNight }: { scene: WeatherScene; isNight: boolean }) {
  return (
    <div className="weather-atmosphere" aria-hidden="true">
      <div className={isNight ? "moon" : "sun-disc"} />
      {(scene === "rain" || scene === "cloudy") && (
        <div className="cloud-bank"><i /><i /><i /></div>
      )}
      {scene === "rain" && (
        <div className="rain-field">
          {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--drop": index } as React.CSSProperties} />)}
        </div>
      )}
      {scene === "windy" && <div className="wind-field"><i /><i /><i /><i /></div>}
      {isNight && <div className="star-field"><i /><i /><i /><i /><i /><i /></div>}
    </div>
  );
}

function WeatherAlert({ item, items }: { item: BmkgForecastItem; items: BmkgForecastItem[] }) {
  const nextRain = items
    .filter((forecast) => new Date(forecast.datetime).getTime() >= Date.now())
    .find((forecast) => /hujan|petir/i.test(forecast.weather_desc) || (forecast.tp ?? 0) > 0.2);
  const hours = nextRain ? Math.max(0, Math.round((+new Date(nextRain.datetime) - Date.now()) / 3_600_000)) : null;
  const title = nextRain
    ? hours !== null && hours >= 18 ? "Besok berpotensi hujan" : hours !== null && hours <= 1 ? "Hujan segera datang" : `${hours} jam menuju hujan`
    : /cerah/i.test(item.weather_desc) ? "Langit sedang cerah" : "Cuaca cukup bersahabat";
  const copy = nextRain
    ? `${nextRain.weather_desc} diperkirakan pada ${formatWib(nextRain.datetime, { hour: "2-digit", minute: "2-digit" })} WIB. Siapkan payung ya-^`
    : "Belum terlihat potensi hujan pada prakiraan terdekat. Waktu yang baik untuk beraktivitas.";
  return (
    <section className="weather-alert mt-4 flex items-start gap-3 rounded-lg border border-border px-4 py-3">
      {nextRain ? <CloudRain className="mt-0.5 h-5 w-5 shrink-0 text-rain" /> : <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sun" />}
      <div><h2 className="text-sm font-bold">{title}</h2><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy}</p></div>
    </section>
  );
}

function NotificationPanel({ status, onEnable, onDisable, locationLabel }: {
  status: PushStatus | "idle" | "loading";
  onEnable: () => void;
  onDisable: () => void;
  locationLabel: string;
}) {
  const messages: Partial<Record<typeof status, string>> = {
    registered: `Peringatan hujan untuk ${locationLabel} sudah aktif.`,
    "open-in-new-tab": "Buka aplikasi di tab baru atau versi terbit untuk mengizinkan notifikasi.",
    denied: "Izin ditolak. Aktifkan notifikasi CuacaKu melalui pengaturan situs di browser.",
    unsupported: "Browser ini belum mendukung notifikasi cuaca.",
    "not-configured": "Konfigurasi web push belum lengkap. Perbarui koneksi Firebase dengan Include web push.",
  };
  return (
    <section className="glass-card mt-8 grid gap-5 rounded-lg p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent"><Bell className="h-5 w-5 text-primary" /></div>
        <div><h2 className="font-bold">Peringatan cuaca di Android</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Terima kabar sebelum hujan dan ringkasan saat cuaca cerah, bahkan ketika CuacaKu ditutup.</p>{messages[status] && <p className="mt-2 text-xs font-semibold text-primary">{messages[status]}</p>}</div>
      </div>
      {status === "registered" ? (
        <Button variant="outline" onClick={onDisable}><BellOff /> Matikan</Button>
      ) : (
        <Button onClick={onEnable} disabled={status === "loading"}>{status === "loading" ? <Loader2 className="animate-spin" /> : <Bell />} Aktifkan</Button>
      )}
    </section>
  );
}

function BmkgNews({ data, loading }: { data: Awaited<ReturnType<typeof getBmkgNews>>; loading: boolean }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase text-primary">Waspada terkini</p><h2 className="mt-1 text-2xl font-bold">Kabar resmi BMKG</h2></div>
        <a className="story-link hidden text-xs font-semibold text-muted-foreground sm:inline-flex" href="https://www.bmkg.go.id/berita" target="_blank" rel="noreferrer">Lihat semua <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
      </div>
      {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div> : (
        <div className="news-grid">
          {data.slice(0, 4).map((item, index) => (
            <a key={item.link} href={item.link} target="_blank" rel="noreferrer" className={`news-item ${index === 0 ? "news-featured" : ""}`}>
              <div className="flex items-center gap-2 text-xs font-semibold text-primary"><ShieldAlert className="h-4 w-4" /> Peringatan dini</div>
              <h3 className="mt-3 font-bold leading-snug">{item.title}</h3>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              <p className="mt-4 text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.publishedAt))}</p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="Logo CuacaKu" width={44} height={44} className="rounded-xl" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Cuaca<span className="text-gradient-sky">Ku</span>
          </h1>
          <p className="text-xs text-muted-foreground">Prediksi cuaca resmi BMKG</p>
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
        <span className="h-2 w-2 animate-pulse rounded-full bg-fire-low" /> Data langsung BMKG
      </div>
    </header>
  );
}

function LocationPicker({
  location,
  onChange,
}: {
  location: SelectedLocation;
  onChange: (loc: SelectedLocation) => void;
}) {
  const [prov, setProv] = useState("");
  const [kab, setKab] = useState("");
  const [kec, setKec] = useState("");

  const provinsiQ = useQuery({ queryKey: ["provinsi"], queryFn: fetchProvinsi, staleTime: Infinity });
  const kabupatenQ = useQuery({
    queryKey: ["kabupaten", prov],
    queryFn: () => fetchKabupaten(prov),
    enabled: !!prov,
    staleTime: Infinity,
  });
  const kecamatanQ = useQuery({
    queryKey: ["kecamatan", kab],
    queryFn: () => fetchKecamatan(kab),
    enabled: !!kab,
    staleTime: Infinity,
  });
  const kelurahanQ = useQuery({
    queryKey: ["kelurahan", kec],
    queryFn: () => fetchKelurahan(kec),
    enabled: !!kec,
    staleTime: Infinity,
  });

  const selectCls =
    "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50";

  return (
    <section className="glass-card mt-6 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Pilih Lokasi</h2>
        <span className="text-xs text-muted-foreground">· aktif: {location.label}</span>
      </div>

      <Button
        variant="outline"
        onClick={() => onChange(SMK_PGRI2)}
        className={`mt-3 h-auto w-full justify-start whitespace-normal rounded-xl px-4 py-3 text-left ${
          location.adm4 === SMK_PGRI2.adm4
            ? "border-primary bg-accent"
            : "border-border bg-card hover:border-primary/60"
        }`}
      >
        <GraduationCap className="h-6 w-6 shrink-0 text-sun" />
        <div>
          <p className="text-sm font-bold">SMK PGRI 2 Ponorogo</p>
          <p className="text-xs text-muted-foreground">
            Lokasi khusus sekolah — Kauman, Kec. Ponorogo, Kab. Ponorogo
          </p>
        </div>
      </Button>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          className={selectCls}
          value={prov}
          onChange={(e) => {
            setProv(e.target.value);
            setKab("");
            setKec("");
          }}
        >
          <option value="">Provinsi…</option>
          {provinsiQ.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.nama}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={kab}
          disabled={!prov}
          onChange={(e) => {
            setKab(e.target.value);
            setKec("");
          }}
        >
          <option value="">Kab/Kota…</option>
          {kabupatenQ.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.nama}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={kec}
          disabled={!kab}
          onChange={(e) => setKec(e.target.value)}
        >
          <option value="">Kecamatan…</option>
          {kecamatanQ.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.nama}</option>
          ))}
        </select>
        <select
          className={selectCls}
          disabled={!kec}
          value=""
          onChange={(e) => {
            const kel = kelurahanQ.data?.find((r) => r.id === e.target.value);
            if (kel) onChange({ label: kel.nama, adm4: toAdm4(kel.id) });
          }}
        >
          <option value="">Kelurahan/Desa…</option>
          {kelurahanQ.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.nama}</option>
          ))}
        </select>
      </div>
    </section>
  );
}


function CurrentHero({
  item,
  locationLabel,
  desa,
  kecamatan,
  kotkab,
}: {
  item: BmkgForecastItem;
  locationLabel: string;
  desa: string;
  kecamatan: string;
  kotkab: string;
}) {
  return (
    <section className="glass-card mt-6 overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {locationLabel}
            <span className="text-xs">
              ({desa}, {kecamatan}, {kotkab})
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWib(item.datetime, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            WIB
          </p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-7xl font-bold leading-none tracking-tighter">
              {Math.round(item.t)}°
            </span>
            <div className="pb-1">
              <p className="text-lg font-semibold">{item.weather_desc}</p>
              <p className="text-sm text-muted-foreground">
                Kelembapan {item.hu}% · Angin {item.ws} km/jam
              </p>
            </div>
          </div>
        </div>
        {item.image && (
          <img
            src={item.image}
            alt={item.weather_desc}
            width={120}
            height={120}
            className="animate-float-cloud h-28 w-28 drop-shadow-2xl"
          />
        )}
      </div>
    </section>
  );
}

function StatCard({
  icon,
  title,
  value,
  subtitle,
  toneClass,
  windDeg,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  toneClass?: string;
  windDeg?: number | undefined;
}) {
  return (
    <div className={`glass-card rounded-2xl p-4 ${toneClass ?? ""}`}>
      <div className="flex items-center gap-2">
        {icon}
        {typeof windDeg === "number" && (
          <Navigation
            className="h-4 w-4 text-muted-foreground"
            style={{ transform: `rotate(${windDeg}deg)` }}
          />
        )}
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-0.5 text-lg font-bold leading-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ForecastStrip({ items }: { items: BmkgForecastItem[] }) {
  const upcoming = useMemo(() => {
    const now = Date.now();
    return items.filter((it) => new Date(it.datetime).getTime() >= now - 3600 * 1000).slice(0, 16);
  }, [items]);

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Prakiraan per 3 jam ke depan
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {upcoming.map((it) => (
          <div
            key={it.datetime}
            className="glass-card flex w-28 shrink-0 flex-col items-center rounded-2xl p-3 text-center"
          >
            <p className="text-xs font-semibold">
              {formatWib(it.datetime, { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatWib(it.datetime, { day: "numeric", month: "short" })}
            </p>
            {it.image && (
              <img src={it.image} alt={it.weather_desc} width={44} height={44} loading="lazy" className="my-1.5 h-11 w-11" />
            )}
            <p className="text-base font-bold">{Math.round(it.t)}°</p>
            <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-rain">
              <Droplets className="h-3 w-3" />
              {it.hu}%
            </p>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
              {it.weather_desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
