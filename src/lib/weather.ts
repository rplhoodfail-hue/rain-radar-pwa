// Utilitas data cuaca BMKG (https://api.bmkg.go.id) + perhitungan indeks bahaya kebakaran.

export interface BmkgForecastItem {
  datetime: string;
  local_datetime?: string;
  t: number; // suhu °C
  hu: number; // kelembapan %
  tp?: number; // curah hujan mm
  tcc?: number; // tutupan awan %
  ws: number; // kecepatan angin km/jam
  wd: string; // arah angin (dari)
  wd_deg?: number;
  weather_desc: string;
  image?: string;
}

export interface BmkgLocation {
  desa: string;
  kecamatan: string;
  kotkab: string;
  provinsi: string;
  lat: number;
  lon: number;
  timezone?: string;
}

export interface BmkgForecast {
  lokasi: BmkgLocation;
  items: BmkgForecastItem[];
}

export async function fetchBmkgForecast(adm4: string): Promise<BmkgForecast> {
  const res = await fetch(
    `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(adm4)}`,
  );
  if (!res.ok) throw new Error(`Gagal memuat data BMKG (${res.status})`);
  const json = await res.json();
  const lokasi = json?.lokasi ?? json?.data?.[0]?.lokasi;
  const cuaca = json?.data?.[0]?.cuaca;
  if (!lokasi || !Array.isArray(cuaca)) {
    throw new Error("Format data BMKG tidak dikenal");
  }
  const items: BmkgForecastItem[] = (cuaca as BmkgForecastItem[][])
    .flat()
    .filter((it) => typeof it?.t === "number");
  if (items.length === 0) throw new Error("Data prakiraan kosong untuk lokasi ini");
  return { lokasi, items };
}

/** Ambil titik prakiraan yang paling dekat dengan waktu sekarang. */
export function pickCurrent(items: BmkgForecastItem[]): BmkgForecastItem {
  const now = Date.now();
  return items.reduce((best, it) => {
    const t = new Date(it.datetime).getTime();
    const bt = new Date(best.datetime).getTime();
    return Math.abs(t - now) < Math.abs(bt - now) ? it : best;
  }, items[0]);
}

export interface FireIndex {
  value: number; // FFDI
  label: string;
  tone: "low" | "moderate" | "high" | "very-high" | "extreme";
  description: string;
}

/**
 * Estimasi Indeks Bahaya Kebakaran memakai rumus McArthur FFDI yang
 * disederhanakan dari suhu, kelembapan, kecepatan angin, dan curah hujan.
 * BMKG tidak mempublikasikan FDR per-kelurahan, jadi ini estimasi lokal.
 */
export function computeFireIndex(item: BmkgForecastItem, recentRainMm: number): FireIndex {
  const T = item.t;
  const RH = Math.min(100, Math.max(1, item.hu));
  const V = item.ws ?? 0;
  // Drought Factor 1–10: makin kering (sedikit hujan) makin tinggi.
  const df = Math.min(10, Math.max(1, 10 - recentRainMm * 1.5));
  const raw =
    2 *
    Math.exp(
      -0.45 + 0.987 * Math.log(df) - 0.0345 * RH + 0.0338 * T + 0.0234 * V,
    );
  const value = Math.round(raw * 10) / 10;

  if (value < 12)
    return { value, label: "Rendah", tone: "low", description: "Risiko kebakaran kecil. Kondisi aman." };
  if (value < 25)
    return { value, label: "Sedang", tone: "moderate", description: "Waspada penggunaan api di lahan terbuka." };
  if (value < 50)
    return { value, label: "Tinggi", tone: "high", description: "Hindari pembakaran lahan. Api mudah menyebar." };
  if (value < 75)
    return { value, label: "Sangat Tinggi", tone: "very-high", description: "Api menyebar cepat. Siagakan pemadaman." };
  return { value, label: "Ekstrem", tone: "extreme", description: "Kondisi sangat berbahaya. Larangan total membakar." };
}

/** Total curah hujan prakiraan 24 jam ke depan (mm). */
export function rainNext24h(items: BmkgForecastItem[]): number {
  const now = Date.now();
  const dayAhead = now + 24 * 3600 * 1000;
  return items
    .filter((it) => {
      const t = new Date(it.datetime).getTime();
      return t >= now - 3 * 3600 * 1000 && t <= dayAhead;
    })
    .reduce((sum, it) => sum + (it.tp ?? 0), 0);
}

const DIRECTIONS_ID: Record<string, string> = {
  N: "Utara", NNE: "Utara-Timur Laut", NE: "Timur Laut", ENE: "Timur-Timur Laut",
  E: "Timur", ESE: "Timur-Tenggara", SE: "Tenggara", SSE: "Selatan-Tenggara",
  S: "Selatan", SSW: "Selatan-Barat Daya", SW: "Barat Daya", WSW: "Barat-Barat Daya",
  W: "Barat", WNW: "Barat-Barat Laut", NW: "Barat Laut", NNW: "Utara-Barat Laut",
  VARIABLE: "Berubah-ubah", CALM: "Tenang",
};

export function windDirectionId(code: string): string {
  return DIRECTIONS_ID[code?.toUpperCase?.()] ?? code;
}

export function formatWib(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...opts }).format(
    new Date(iso),
  );
}
