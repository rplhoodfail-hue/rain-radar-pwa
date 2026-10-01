import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { adminBroadcast, adminDashboard, adminLogin } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Dashboard Guru — CuacaKu" },
      { name: "description", content: "Dashboard admin guru SMK PGRI 2 Ponorogo untuk memantau cuaca dan mengirim peringatan ke murid." },
      { property: "og:title", content: "Dashboard Guru — CuacaKu" },
      { property: "og:description", content: "Pantau cuaca sekolah dan kirim notifikasi peringatan ke murid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Dash = Awaited<ReturnType<typeof adminDashboard>>;
const KEY = "cuacaku-admin-token";
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="opacity-80">{text}</span></div>
      <div className="mt-1 h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(sessionStorage.getItem(KEY)), []);
  if (!token) return <Login onToken={(t) => { sessionStorage.setItem(KEY, t); setToken(t); }} />;
  return <Dashboard token={token} onLogout={() => { sessionStorage.removeItem(KEY); setToken(null); }} />;
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const login = useServerFn(adminLogin);
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <form className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-6" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        const r = await login({ data: { username: u, password: p } }).catch(() => ({ ok: false as const, error: "Gagal terhubung." }));
        setBusy(false); if (r.ok) onToken(r.token); else setErr(r.error);
      }}>
        <h1 className="text-xl font-bold">Login Dashboard Guru</h1>
        <input className="w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} />
        <input className="w-full rounded-lg border border-input bg-background px-3 py-2" type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground">{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const load = useServerFn(adminDashboard);
  const send = useServerFn(adminBroadcast);
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [client, setClient] = useState({ cores: 0, mem: 0, heap: 0, heapMax: 0 });

  const refresh = useCallback(async () => {
    try { setD(await load({ data: { token } })); setErr(""); }
    catch (e) { const m = e instanceof Error ? e.message : "Gagal memuat"; setErr(m); if (/sesi|token/i.test(m)) onLogout(); }
    const pm = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    setClient({ cores: navigator.hardwareConcurrency ?? 0, mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0, heap: pm?.usedJSHeapSize ?? 0, heapMax: pm?.jsHeapSizeLimit ?? 0 });
  }, [load, token, onLogout]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 60_000); return () => clearInterval(id); }, [refresh]);

  const warning = d?.rainSoon
    ? `Dalam 3 jam ke depan diperkirakan ${d.rainSoon.desc} (sekitar pukul ${new Date(d.rainSoon.datetime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}). Guru mohon menghimbau murid untuk bersiap-siap.`
    : null;

  const broadcast = async (title: string, body: string) => {
    setMsg("Mengirim…");
    try { const r = await send({ data: { token, title, body } }); setMsg(`Terkirim ke ${r.sent} perangkat murid${r.failed ? `, ${r.failed} gagal` : ""}.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Gagal mengirim"); }
  };

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Dashboard Guru</h1><p className="text-sm opacity-70">{d?.location ?? "SMK PGRI 2 Ponorogo"}</p></div>
          <div className="flex gap-2"><button onClick={refresh} className="rounded-lg border border-border px-3 py-1.5 text-sm">Muat ulang</button><button onClick={onLogout} className="rounded-lg border border-border px-3 py-1.5 text-sm">Keluar</button></div>
        </header>
        {err && <p className="text-destructive">{err}</p>}

        <section className={`rounded-2xl p-6 ${warning ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-90">{warning ? "⚠️ Peringatan Hujan" : "✅ Kondisi Aman"}</p>
          <p className="mt-2 text-xl font-bold leading-snug md:text-3xl">{warning ?? "Tidak ada prakiraan hujan dalam 3 jam ke depan. Kegiatan luar kelas dapat berjalan."}</p>
          <button onClick={() => broadcast(warning ? "⚠️ Peringatan Hujan" : "☀️ Info Cuaca Sekolah", warning ? "Hujan diperkirakan dalam 3 jam ke depan. Siapkan payung/jas hujan ya!" : "Cuaca sekolah terpantau aman. Tetap cek CuacaKu.")}
            className="mt-4 rounded-lg bg-background px-4 py-2 font-semibold text-foreground">📢 Kirim notifikasi ke murid</button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 font-semibold">Cuaca saat ini</h2>
            {d ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="opacity-70">Kondisi</p><p className="text-lg font-bold">{d.current.desc}</p></div>
                <div><p className="opacity-70">Suhu</p><p className="text-lg font-bold">{d.current.t}°C</p></div>
                <div><p className="opacity-70">Kelembapan</p><p className="text-lg font-bold">{d.current.hu}%</p></div>
                <div><p className="opacity-70">Curah hujan</p><p className="text-lg font-bold">{d.current.tp} mm</p></div>
                <div><p className="opacity-70">Angin</p><p className="text-lg font-bold">{d.current.ws} km/j {d.current.wd}</p></div>
                <div><p className="opacity-70">Murid berlangganan</p><p className="text-lg font-bold">{d.subscribers}</p></div>
              </div>
            ) : <p className="opacity-70">Memuat…</p>}
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Penggunaan resource</h2>
            {d?.server.memory && <Bar label="Memori server" value={d.server.memory.heapUsed} max={d.server.memory.heapTotal} text={`${mb(d.server.memory.heapUsed)} / ${mb(d.server.memory.heapTotal)}`} />}
            {d && <Bar label="Respons API BMKG" value={d.server.bmkgLatency} max={3000} text={`${d.server.bmkgLatency} ms`} />}
            {client.heapMax > 0 && <Bar label="Memori browser" value={client.heap} max={client.heapMax} text={`${mb(client.heap)} / ${mb(client.heapMax)}`} />}
            <p className="text-sm opacity-80">Komputer ini: {client.cores || "?"} inti CPU · RAM ±{client.mem || "?"} GB</p>
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Prakiraan berikutnya</h2>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {d?.next.map((i) => (
              <div key={i.datetime} className="rounded-lg bg-muted p-3">
                <p className="font-semibold">{new Date(i.datetime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                <p>{i.desc}</p><p className="opacity-70">{i.t}°C · {i.tp} mm</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
