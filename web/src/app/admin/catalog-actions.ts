"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminApi, requireAdmin, type IngestionRun } from "@/lib/admin";
import type { ActionState } from "./actions";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function run(fn: () => Promise<unknown>, ok?: string): Promise<ActionState> {
  await requireAdmin();
  try {
    await fn();
  } catch (e) {
    return { error: (e as Error).message || "Something went wrong" };
  }
  refresh();
  return ok ? { ok, n: Date.now() } : null;
}

/** "Brand=brand\nItem #=sku" style lines -> { brand: "brand", ... } */
function pairs(text: string, keyLower = false) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[keyLower ? k.toLowerCase() : k] = v;
  }
  return out;
}

// ---------- stores ----------

export async function createRetailer(_: ActionState, f: FormData) {
  return run(
    () => adminApi("/retailers", { method: "POST", body: { name: str(f, "name"), slug: str(f, "slug").toLowerCase(), domain: str(f, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""), network: str(f, "network") || "direct" } }),
    "Store added. It stays hidden until you approve it.",
  );
}

export async function updateRetailer(id: string, _: ActionState, f: FormData) {
  return run(
    () =>
      adminApi(`/retailers/${id}`, {
        method: "PATCH",
        body: {
          active: f.get("active") === "on",
          approved: f.get("approved") === "on",
          trustScore: Number(str(f, "trustScore") || 0),
          integrationType: str(f, "integrationType"),
          affiliateStatus: str(f, "affiliateStatus"),
          linkCapability: str(f, "linkCapability") || undefined,
          complianceNotes: str(f, "complianceNotes") || undefined,
          supportedCategories: f.getAll("supportedCategories").map(String),
        },
      }),
    "Saved.",
  );
}

// ---------- sources ----------

export async function createSource(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  let id = "";
  try {
    const s = await adminApi<{ id: string }>("/sources", { method: "POST", body: { name: str(f, "name"), kind: str(f, "kind"), merchantId: str(f, "merchantId") || undefined } });
    id = s.id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/admin/sources/${id}`);
}

export async function saveSourcePermissions(id: string, _: ActionState, f: FormData) {
  const retention = str(f, "retentionDays");
  return run(
    () =>
      adminApi(`/sources/${id}`, {
        method: "PATCH",
        body: {
          name: str(f, "name") || undefined,
          merchantId: str(f, "merchantId") || undefined,
          accessMethod: str(f, "accessMethod") || undefined,
          agreementUrl: str(f, "agreementUrl") || undefined,
          permissionNotes: str(f, "permissionNotes") || undefined,
          allowedFields: f.getAll("allowedFields").map(String),
          aiUseAllowed: f.get("aiUseAllowed") === "yes",
          attributionText: str(f, "attributionText") || undefined,
          priceFreshnessHours: Number(str(f, "priceFreshnessHours") || 24),
          retentionDays: retention ? Number(retention) : undefined,
          fullSnapshot: f.get("fullSnapshot") === "on",
          config: { columns: pairs(str(f, "columns")), categoryMap: pairs(str(f, "categoryMap"), true) },
        },
      }),
    "Saved.",
  );
}

export async function activateSource(id: string, _: ActionState, f: FormData) {
  return run(() => adminApi(`/sources/${id}/activate`, { method: "POST", body: { approvedBy: str(f, "approvedBy") } }), "Activated. You can import its data now.");
}

export async function setSourceState(id: string, action: "pause" | "disable") {
  return run(() => adminApi(`/sources/${id}/${action}`, { method: "POST" }));
}

const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel limits request bodies to about 4.5 MB

export async function importFeed(id: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > MAX_UPLOAD) return { error: "That file is over 4 MB. Split it into smaller files." };
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) return { error: "Upload a .csv file (export from your spreadsheet as CSV)." };
  let r: IngestionRun;
  try {
    r = await adminApi<IngestionRun>(`/sources/${id}/import`, { method: "POST", csv: await file.text() });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  const saved = r.created + r.updated + r.unchanged;
  if (r.status === "FAILED") return { error: `Import failed: no rows could be saved. ${r.rejected} rejected; see the details below.` };
  return {
    ok: `Imported ${saved} of ${r.rowsRead} rows: ${r.created} new, ${r.updated} changed, ${r.unchanged} unchanged${r.markedOut ? `, ${r.markedOut} no longer in the feed (marked out of stock)` : ""}${r.rejected ? `. ${r.rejected} rejected; see the details below.` : "."}`,
    n: Date.now(),
  };
}
