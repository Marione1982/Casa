// Casa – aggiornamento del fotovoltaico da Fox ESS (FoxCloud Open API).
// Legge produzione lorda (PVEnergyTotal), netta (generation) e venduti (feedin) mese per mese
// e aggiorna casa_fotovoltaico per bimestre. Gira con l'utente che la chiama (RLS attiva):
// nessuna chiave service_role. La chiave Fox ESS sta solo nel segreto FOXESS_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";

const FOX = "https://www.foxesscloud.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function md5(s: string) {
  return encodeHex(await crypto.subtle.digest("MD5", new TextEncoder().encode(s)));
}

// Chiamata firmata all'Open API: firma = MD5(percorso + "\r\n" + chiave + "\r\n" + timestamp).
// La documentazione è ambigua sui separatori (letterali o veri a capo): si provano entrambi.
let sepOk: string | null = null;
async function fox(path: string, body: unknown) {
  const key = Deno.env.get("FOXESS_API_KEY");
  if (!key) throw new Error("Segreto FOXESS_API_KEY mancante");
  for (const sep of sepOk ? [sepOk] : ["\\r\\n", "\r\n"]) {
    const ts = String(Date.now());
    const r = await fetch(FOX + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", lang: "en", token: key, timestamp: ts, signature: await md5(path + sep + key + sep + ts) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ errno: r.status, msg: "risposta non valida" }));
    if (j.errno === 0) { sepOk = sep; return j.result; }
    if (sepOk || sep === "\r\n") throw new Error(`Fox ESS ${path}: ${j.errno} ${j.msg ?? ""}`);
    await new Promise((res) => setTimeout(res, 1100)); // limite: una richiesta al secondo
  }
}

const valori = (v: any): number[] => (v?.values ?? v?.data?.map((d: any) => d.value) ?? []).map((x: any) => Number(x) || 0);
const r1 = (x: number) => Math.round(x * 10) / 10;
const pad = (n: number) => String(n).padStart(2, "0");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u, error: ue } = await sb.auth.getUser();
    if (ue || !u?.user) return json({ errore: "Accesso richiesto" }, 401);
    const prova = new URL(req.url).searchParams.get("prova") === "1"; // solo lettura, non scrive

    // Inverter dell'account
    const lista = await fox("/op/v0/device/list", { currentPage: 1, pageSize: 10 });
    const sn = (lista?.data ?? lista)?.[0]?.deviceSN;
    if (!sn) throw new Error("Nessun inverter trovato sull'account Fox ESS");
    await new Promise((res) => setTimeout(res, 1100));

    // Anno in corso, più il precedente a inizio anno (per chiudere novembre-dicembre)
    const oggi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const anni = oggi.getMonth() < 2 ? [oggi.getFullYear() - 1, oggi.getFullYear()] : [oggi.getFullYear()];
    const righe: any[] = [];
    for (const anno of anni) {
      const res = await fox("/op/v0/device/report/query", { sn, year: anno, dimension: "year", variables: ["PVEnergyTotal", "generation", "feedin"] });
      const v = Object.fromEntries((res ?? []).map((x: any) => [x.variable, valori(x)]));
      for (let b = 0; b < 6; b++) {
        const m1 = b * 2, m2 = m1 + 1; // indici 0-11
        const netti = r1((v.generation?.[m1] ?? 0) + (v.generation?.[m2] ?? 0));
        if (netti <= 0) continue; // bimestre ancora senza dati
        const pv = r1((v.PVEnergyTotal?.[m1] ?? 0) + (v.PVEnergyTotal?.[m2] ?? 0));
        // lordo valido se c'è il dato dei pannelli per ogni mese che ha produzione (anche a bimestre in corso)
        const pvCompleto = [m1, m2].every((m) => (v.generation?.[m] ?? 0) <= 0 || (v.PVEnergyTotal?.[m] ?? 0) > 0);
        const fine = new Date(Date.UTC(anno, m2 + 1, 0));
        righe.push({
          codice: `${anno}${pad(m2 + 1)}`,
          periodo_dal: `${anno}-${pad(m1 + 1)}-01`,
          periodo_al: `${anno}-${pad(m2 + 1)}-${pad(fine.getUTCDate())}`,
          kwh_prodotti: pvCompleto ? pv : netti,
          kwh_netti: netti,
          kwh_immessi: r1((v.feedin?.[m1] ?? 0) + (v.feedin?.[m2] ?? 0)),
        });
      }
      await new Promise((res) => setTimeout(res, 1100));
    }

    // Aggiorna solo i bimestri dell'anno richiesto; le date del periodo esistenti restano invariate
    const { data: esistenti, error: ee } = await sb.from("casa_fotovoltaico").select("id, codice").in("codice", righe.map((r) => r.codice));
    if (ee) throw ee;
    const scritti: string[] = [];
    if (!prova) {
      for (const r of righe) {
        const e = esistenti?.find((x) => x.codice === r.codice);
        const { error } = e
          ? await sb.from("casa_fotovoltaico").update({ kwh_prodotti: r.kwh_prodotti, kwh_netti: r.kwh_netti, kwh_immessi: r.kwh_immessi }).eq("id", e.id)
          : await sb.from("casa_fotovoltaico").insert(r);
        if (error) throw error;
        scritti.push(r.codice);
      }
    }
    return json({ ok: true, prova, bimestri: righe, scritti });
  } catch (e) {
    return json({ errore: String((e as Error)?.message ?? e) }, 500);
  }
});
