// Pemilihan lokasi: data wilayah Indonesia (ibnux/data-indonesia, CORS terbuka)
// + lokasi khusus SMK PGRI 2 Ponorogo.

export interface Region {
  id: string;
  nama: string;
}

const BASE = "https://ibnux.github.io/data-indonesia";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal memuat data wilayah (${res.status})`);
  return res.json() as Promise<T>;
}

export const fetchProvinsi = () => getJson<Region[]>(`${BASE}/provinsi.json`);
export const fetchKabupaten = (provId: string) =>
  getJson<Region[]>(`${BASE}/kabupaten/${provId}.json`);
export const fetchKecamatan = (kabId: string) =>
  getJson<Region[]>(`${BASE}/kecamatan/${kabId}.json`);
export const fetchKelurahan = (kecId: string) =>
  getJson<Region[]>(`${BASE}/kelurahan/${kecId}.json`);

/** "3502151004" -> "35.02.15.1004" (format kode adm4 BMKG) */
export function toAdm4(kelurahanId: string): string {
  const id = kelurahanId.replace(/\D/g, "");
  return `${id.slice(0, 2)}.${id.slice(2, 4)}.${id.slice(4, 6)}.${id.slice(6)}`;
}

export interface SelectedLocation {
  label: string;
  adm4: string;
}

/** Lokasi khusus: SMK PGRI 2 Ponorogo (Kel. Kauman, Kec. Ponorogo). */
export const SMK_PGRI2: SelectedLocation = {
  label: "SMK PGRI 2 Ponorogo",
  adm4: "35.02.17.1010", // Kelurahan Kauman, Kecamatan Ponorogo, Kab. Ponorogo
};

export const DEFAULT_LOCATION: SelectedLocation = SMK_PGRI2;
