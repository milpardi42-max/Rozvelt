import "server-only";
import crypto from "crypto";
import {
  DEFAULT_ARTIST_SHARE_PCT,
  MAX_MASTER_BYTES,
  MIN_MASTER_BYTES,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD_BYTES,
  acceptedMasterMime,
  defaultTiers,
  storageProvider,
} from "./config";
import { KEYS, mutateCollection, readCollection, readDoc, writeDoc, nextSequence } from "./store";
import { deleteObject, masterKey, putBuffer, stagedMasterKey, stagingPrefix } from "./storage";
import { scanBuffer, sha256 } from "./scanner";
import { buildDerivatives } from "./media";
import { refundPrice } from "./royalty";
import type { Localized } from "@/lib/i18n/types";
import type {
  Asset,
  AssetKind,
  AssetStatus,
  LedgerEntry,
  LicenseTier,
  PricePair,
  SeamlessReport,
  UploadSession,
} from "./types";

/**
 * Asset lifecycle — everything that happens between "artist picked a file" and
 * "an admin can approve or reject it".
 *
 *   createSession → upload parts (single or multipart) → completeUpload
 *     → store master privately → ClamAV/heuristic scan
 *     → watermark + thumbnails + mockups + seamless analysis
 *     → status: pending_review  (or `rejected` when the scan finds something)
 */

/* ------------------------------------------------------------------ */
/* Uid + slug helpers                                                  */
/* ------------------------------------------------------------------ */

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString("hex")}`;

export function slugify(input: string, fallback = "asset-x"): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

export async function uniqueAssetSlug(base: string, excludeId?: string): Promise<string> {
  const assets = await getAssets();
  const taken = new Set(assets.filter((a) => a.id !== excludeId).map((a) => a.slug));
  let candidate = slugify(base, `asset-${crypto.randomBytes(3).toString("hex")}`);
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${slugify(base)}-${counter}`;
    counter += 1;
  }
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface AssetQuery {
  status?: AssetStatus | AssetStatus[];
  ownerUserId?: string | null;
  artistId?: string;
  kind?: AssetKind | AssetKind[];
  search?: string;
  tag?: string;
  /** Only assets that can be bought right now. */
  purchasable?: boolean;
  limit?: number;
  offset?: number;
}

export async function getAssets(): Promise<Asset[]> {
  return readCollection<Asset>(KEYS.assets);
}

export async function getAsset(id: string): Promise<Asset | null> {
  const assets = await getAssets();
  return assets.find((asset) => asset.id === id) ?? null;
}

export async function getAssetBySlug(slug: string): Promise<Asset | null> {
  const assets = await getAssets();
  return assets.find((asset) => asset.slug === slug) ?? null;
}

export function isPurchasable(asset: Asset): boolean {
  return asset.status === "approved" && asset.visibility === "public" && asset.tiers.some((tier) => tier.enabled);
}

export function filterAssets(assets: Asset[], query: AssetQuery = {}): Asset[] {
  const statuses = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : null;
  const needle = query.search?.trim().toLowerCase();

  let out = assets.filter((asset) => {
    if (statuses && !statuses.includes(asset.status)) return false;
    if (query.ownerUserId !== undefined && asset.ownerUserId !== query.ownerUserId) return false;
    if (query.artistId && asset.artistId !== query.artistId) return false;
    if (query.kind) {
      const kinds = Array.isArray(query.kind) ? query.kind : [query.kind];
      if (kinds.length && !kinds.includes(asset.kind)) return false;
    }
    if (query.tag && !asset.tags.includes(query.tag)) return false;
    if (query.purchasable && !isPurchasable(asset)) return false;
    if (needle) {
      const haystack = [
        asset.title.fa,
        asset.title.en,
        asset.description.fa,
        asset.description.en,
        asset.slug,
        asset.id,
        ...asset.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  out = out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const offset = query.offset ?? 0;
  if (query.offset || query.limit) out = out.slice(offset, query.limit ? offset + query.limit : undefined);
  return out;
}

export async function listAssets(query: AssetQuery = {}): Promise<Asset[]> {
  return filterAssets(await getAssets(), query);
}

/** Public catalogue — used by the storefront pages. */
export async function listPublicAssets(limit?: number): Promise<Asset[]> {
  const assets = await listAssets({ purchasable: true });
  return limit ? assets.slice(0, limit) : assets;
}

export async function assetsByArtist(artistId: string): Promise<Asset[]> {
  return listAssets({ artistId });
}

export async function assetsForOwner(userId: string): Promise<Asset[]> {
  return listAssets({ ownerUserId: userId });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function saveAsset(asset: Asset): Promise<Asset> {
  const next = { ...asset, updatedAt: new Date().toISOString() };
  await mutateCollection<Asset, void>(KEYS.assets, (assets) => {
    const index = assets.findIndex((item) => item.id === asset.id);
    if (index === -1) return { next: [...assets, next], result: undefined };
    const copy = assets.slice();
    copy[index] = next;
    return { next: copy, result: undefined };
  });
  return next;
}

export async function deleteAsset(id: string, options: { deleteObjects?: boolean } = {}): Promise<boolean> {
  const asset = await getAsset(id);
  if (!asset) return false;

  await mutateCollection<Asset, void>(KEYS.assets, (assets) => ({
    next: assets.filter((item) => item.id !== id),
    result: undefined,
  }));

  if (options.deleteObjects !== false) {
    await deleteObject(asset.master.key).catch(() => undefined);
    for (const file of [...asset.derivatives, ...asset.mockups]) {
      await deleteObject(file.key).catch(() => undefined);
    }
  }
  return true;
}

export async function setAssetStatus(
  id: string,
  status: AssetStatus,
  review: { reviewedBy?: string; note?: string } = {},
): Promise<Asset | null> {
  const asset = await getAsset(id);
  if (!asset) return null;
  return saveAsset({
    ...asset,
    status,
    rejectionNote: status === "rejected" ? review.note : undefined,
    review: { ...asset.review, reviewedBy: review.reviewedBy, reviewedAt: new Date().toISOString(), note: review.note },
  });
}

export async function setAssetVisibility(id: string, visibility: Asset["visibility"]): Promise<Asset | null> {
  const asset = await getAsset(id);
  if (!asset) return null;
  return saveAsset({ ...asset, visibility });
}

export async function updateAssetTiers(id: string, tiers: LicenseTier[]): Promise<Asset | null> {
  const asset = await getAsset(id);
  if (!asset) return null;
  return saveAsset({ ...asset, tiers });
}

export async function updateAssetMeta(
  id: string,
  patch: Partial<Pick<Asset, "title" | "description" | "tags" | "kind" | "patternId" | "productId" | "revenueSharePct">>,
): Promise<Asset | null> {
  const asset = await getAsset(id);
  if (!asset) return null;
  return saveAsset({ ...asset, ...patch });
}

/* ------------------------------------------------------------------ */
/* Stats / analytics hooks                                             */
/* ------------------------------------------------------------------ */

export async function bumpAssetViews(id: string, amount = 1): Promise<void> {
  await mutateCollection<Asset, void>(KEYS.assets, (assets) => {
    const index = assets.findIndex((item) => item.id === id);
    if (index === -1) return { result: undefined };
    const copy = assets.slice();
    copy[index] = { ...copy[index], stats: { ...copy[index].stats, views: copy[index].stats.views + amount } };
    return { next: copy, result: undefined };
  });
}

/**
 * Records a sale in the asset's statistics.
 *
 * Deliberately does **not** touch `status`: merely *offering* an exclusive tier
 * must not delist a work. The work only leaves the shop when an exclusive
 * licence is actually sold (`fulfillOrder`), and returns on refund.
 */
export async function recordAssetSale(id: string, price: PricePair): Promise<void> {
  await mutateCollection<Asset, void>(KEYS.assets, (assets) => {
    const index = assets.findIndex((item) => item.id === id);
    if (index === -1) return { result: undefined };
    const copy = assets.slice();
    const current = copy[index];
    copy[index] = {
      ...current,
      stats: {
        ...current.stats,
        sales: current.stats.sales + 1,
        revenue: { fa: current.stats.revenue.fa + price.fa, en: current.stats.revenue.en + price.en },
        lastSaleAt: new Date().toISOString(),
      },
    };
    return { next: copy, result: undefined };
  });
}

/* ------------------------------------------------------------------ */
/* Upload sessions                                                     */
/* ------------------------------------------------------------------ */

export interface CreateSessionInput {
  userId: string;
  artistId: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  meta?: Partial<UploadSession["meta"]>;
}

export async function createUploadSession(input: CreateSessionInput): Promise<UploadSession> {
  const ext = acceptedMasterMime(input.mime) ?? "bin";
  const sizeBytes = Math.max(0, Math.floor(input.sizeBytes));

  if (sizeBytes < MIN_MASTER_BYTES) throw new Error("file_too_small");
  if (sizeBytes > MAX_MASTER_BYTES) throw new Error("file_too_large");

  const id = newId("upl");
  const provider = storageProvider();
  const multipart = sizeBytes >= MULTIPART_THRESHOLD_BYTES;
  const session: UploadSession = {
    id,
    userId: input.userId,
    artistId: input.artistId,
    filename: input.filename,
    mime: input.mime,
    sizeBytes,
    provider,
    /* The final key is minted at completion time (the asset id is created then).
       For chunked uploads `key` doubles as the staging prefix the client PUTs to. */
    key: multipart ? stagingPrefix(id) : stagedMasterKey(id, ext),
    mode: multipart ? "multipart" : "single",
    partSize: MULTIPART_PART_SIZE,
    parts: [],
    staging: multipart ? id : undefined,
    meta: {
      title: input.meta?.title ?? { fa: input.filename, en: input.filename },
      description: input.meta?.description ?? { fa: "", en: "" },
      kind: input.meta?.kind ?? "pattern",
      tags: input.meta?.tags ?? [],
      familyId: input.meta?.familyId ?? null,
      patternId: input.meta?.patternId ?? null,
      tiers: input.meta?.tiers ?? defaultTiers(),
    },
    status: "open",
    createdAt: new Date().toISOString(),
  };

  await mutateCollection<UploadSession, void>(KEYS.uploads, (sessions) => ({
    next: [...sessions, session],
    result: undefined,
  }));
  return session;
}

export async function getUploadSessions(userId?: string): Promise<UploadSession[]> {
  const sessions = await readCollection<UploadSession>(KEYS.uploads);
  const filtered = userId ? sessions.filter((session) => session.userId === userId) : sessions;
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getUploadSession(id: string): Promise<UploadSession | null> {
  const sessions = await readCollection<UploadSession>(KEYS.uploads);
  return sessions.find((session) => session.id === id) ?? null;
}

export async function getOpenUploadSession(id: string, userId: string): Promise<UploadSession | null> {
  const session = await getUploadSession(id);
  if (!session || session.status !== "open" || session.userId !== userId) return null;
  return session;
}

/** Records a completed part (multipart) and returns the updated session. */
export async function recordUploadPart(
  id: string,
  partNumber: number,
  bytes: number,
  etag: string,
): Promise<UploadSession | null> {
  return mutateCollection<UploadSession, UploadSession | null>(KEYS.uploads, (sessions) => {
    const index = sessions.findIndex((session) => session.id === id);
    if (index === -1) return { result: null };
    const session = sessions[index];
    const parts = [...session.parts.filter((part) => part.partNumber !== partNumber), { partNumber, bytes, etag }].sort(
      (a, b) => a.partNumber - b.partNumber,
    );
    const updated: UploadSession = { ...session, parts };
    const copy = sessions.slice();
    copy[index] = updated;
    return { next: copy, result: updated };
  });
}

export async function abortUploadSession(id: string): Promise<void> {
  await mutateCollection<UploadSession, void>(KEYS.uploads, (sessions) => ({
    next: sessions.map((session) => (session.id === id ? { ...session, status: "aborted" as const } : session)),
    result: undefined,
  }));
}

export interface CompleteUploadOptions {
  /** Final bytes (single-part sessions) — omitted for multipart, which reads staging parts. */
  buffer?: Buffer;
  /** Called with progress notes so the route can stream a status log if needed. */
  onStage?: (stage: string) => void;
}

export interface CompletedUpload {
  asset: Asset;
  scan: Asset["scan"];
  seamless: SeamlessReport;
}

/**
 * Turns an upload session into an asset: stores the master privately, scans it,
 * builds watermarked derivatives and parks it in the admin review queue.
 *
 * Throws (and leaves the session open) when the scan is unclean, so nothing
 * dangerous ever reaches the review queue.
 */
export async function completeUpload(
  session: UploadSession,
  options: CompleteUploadOptions = {},
): Promise<CompletedUpload> {
  const onStage = options.onStage ?? (() => undefined);
  const ext = acceptedMasterMime(session.mime) ?? "bin";

  onStage("storing_master");
  const assetId = newId("ast");

  let masterBuffer: Buffer;
  let masterStoredKey: string;
  if (session.mode === "single") {
    if (!options.buffer) throw new Error("missing_body");
    masterBuffer = options.buffer;
    masterStoredKey = masterKey(assetId, ext);
    await putBuffer(masterStoredKey, masterBuffer, session.mime);
  } else {
    const { assembleParts, getBuffer: readObject } = await import("./storage");
    const finalKey = masterKey(assetId, ext);
    const partNumbers = session.parts
      .map((part) => part.partNumber)
      .sort((a, b) => a - b);
    if (!partNumbers.length) throw new Error("no_parts");
    await assembleParts(session.id, partNumbers, finalKey, session.mime);
    masterBuffer = await readObject(finalKey);
    masterStoredKey = finalKey;
  }

  onStage("scanning");
  const scan = await scanBuffer(masterBuffer, session.filename);

  if (scan.status === "infected") {
    await deleteObject(masterStoredKey).catch(() => undefined);
    throw Object.assign(new Error("infected"), { scan });
  }

  onStage("derivatives");
  const artistName = session.meta.title.en || session.meta.title.fa;
  let derivation: Awaited<ReturnType<typeof buildDerivatives>> | null = null;
  try {
    derivation = await buildDerivatives({
      assetId,
      master: masterBuffer,
      watermarkLines: ["Rosie Atelier", "PREVIEW", "رزی آتلیه"],
      cornerTag: assetId.slice(0, 12).toUpperCase(),
    });
  } catch (error) {
    // Imaging is best-effort: a TIFF/PDF master still becomes a reviewable asset.
    console.error("[marketplace] derivative generation failed:", error);
  }

  const asset: Asset = {
    id: assetId,
    ownerUserId: session.userId,
    artistId: session.artistId,
    patternId: session.meta.patternId ?? null,
    title: session.meta.title,
    slug: await uniqueAssetSlug(session.meta.title.en || session.meta.title.fa || session.filename, assetId),
    description: session.meta.description,
    kind: session.meta.kind,
    tags: session.meta.tags,
    familyId: session.meta.familyId ?? null,
    master: {
      key: masterStoredKey,
      provider: session.provider,
      filename: session.filename,
      sizeBytes: masterBuffer.byteLength,
      mime: session.mime,
      sha256: sha256(masterBuffer),
      uploadedAt: new Date().toISOString(),
    },
    previewKey: derivation?.previewKey,
    tileKey: derivation?.tileKey,
    derivatives: derivation?.derivatives ?? [],
    mockups: derivation?.mockups ?? [],
    seamless:
      derivation?.seamless ??
      ({
        score: 0,
        verdict: "not-seamless",
        edgeDelta: 0,
        baselineDelta: 0,
        width: 0,
        height: 0,
        tileable: false,
        checkedAt: new Date().toISOString(),
        engine: "heuristic",
        note: "image analysis unavailable for this file type",
      } satisfies SeamlessReport),
    scan,
    tiers: session.meta.tiers?.length ? session.meta.tiers : defaultTiers(),
    status: scan.status === "suspicious" ? "pending_review" : "pending_review",
    visibility: "private",
    review: {},
    stats: { views: 0, sales: 0, revenue: { fa: 0, en: 0 } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await mutateCollection<Asset, void>(KEYS.assets, (assets) => ({ next: [...assets, asset], result: undefined }));
  await mutateCollection<UploadSession, void>(KEYS.uploads, (sessions) => ({
    next: sessions.map((item) =>
      item.id === session.id
        ? { ...item, status: "completed" as const, completedAt: new Date().toISOString(), assetId: asset.id }
        : item,
    ),
    result: undefined,
  }));

  void artistName;
  return { asset, scan, seamless: asset.seamless };
}

/* ------------------------------------------------------------------ */
/* Royalty helpers                                                     */
/* ------------------------------------------------------------------ */

export async function artistSharePct(artistId: string | null): Promise<number> {
  if (!artistId) return 0;
  const { getContent } = await import("@/lib/data/store");
  const content = await getContent();
  const artist = content.artists.find((item) => item.id === artistId);
  return artist?.revenueSharePct ?? DEFAULT_ARTIST_SHARE_PCT;
}

export async function artistDisplayName(artistId: string | null): Promise<Localized> {
  if (!artistId) return { fa: "رزی آتلیه", en: "Rosie Atelier" };
  const { getContent } = await import("@/lib/data/store");
  const content = await getContent();
  const artist = content.artists.find((item) => item.id === artistId);
  return artist?.name ?? { fa: "هنرمند ناشناس", en: "Unknown artist" };
}

/* ------------------------------------------------------------------ */
/* Simple platform settings (VAT toggle, default share…)               */
/* ------------------------------------------------------------------ */

export interface MarketplaceSettings {
  vatPct: number;
  artistSharePct: number;
  affiliatePct: number;
  /** Default discount handed to buyers through an affiliate code. */
  affiliateDiscountPct: number;
  payoutMinimumFa: number;
  payoutMinimumEn: number;
  autoApproveSeamless: boolean;
  emailOnSale: boolean;
}

const DEFAULT_SETTINGS: MarketplaceSettings = {
  vatPct: Number(process.env.MARKETPLACE_VAT_PCT ?? 9),
  artistSharePct: DEFAULT_ARTIST_SHARE_PCT,
  affiliatePct: Number(process.env.MARKETPLACE_AFFILIATE_PCT ?? 10),
  affiliateDiscountPct: Number(process.env.MARKETPLACE_AFFILIATE_DISCOUNT_PCT ?? 10),
  payoutMinimumFa: Number(process.env.MARKETPLACE_MIN_PAYOUT_TOMAN ?? 500_000),
  payoutMinimumEn: Number(process.env.MARKETPLACE_MIN_PAYOUT_USD ?? 25),
  autoApproveSeamless: false,
  emailOnSale: true,
};

export async function getSettings(): Promise<MarketplaceSettings> {
  return readDoc<MarketplaceSettings>(KEYS.settings, DEFAULT_SETTINGS);
}

export async function saveSettings(patch: Partial<MarketplaceSettings>): Promise<MarketplaceSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await writeDoc(KEYS.settings, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* License serials                                                     */
/* ------------------------------------------------------------------ */

export async function nextLicenseSerial(series = "LIC"): Promise<string> {
  const sequence = await nextSequence("license");
  const year = new Date().getUTCFullYear();
  return `RA-${series}-${year}-${String(sequence).padStart(6, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

export async function appendLedger(entry: Omit<LedgerEntry, "id" | "createdAt">): Promise<LedgerEntry> {
  const record: LedgerEntry = { ...entry, id: newId("led"), createdAt: new Date().toISOString() };
  await mutateCollection<LedgerEntry, void>(KEYS.ledger, (items) => ({ next: [...items, record], result: undefined }));
  return record;
}

export async function getLedger(artistId?: string): Promise<LedgerEntry[]> {
  const entries = await readCollection<LedgerEntry>(KEYS.ledger);
  const filtered = artistId ? entries.filter((entry) => entry.artistId === artistId) : entries;
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Sums a ledger slice into a `{fa,en}` balance. */
export function ledgerBalance(entries: LedgerEntry[]): PricePair {
  return entries.reduce<PricePair>(
    (acc, entry) => ({ fa: acc.fa + entry.amount.fa, en: acc.en + entry.amount.en }),
    { fa: 0, en: 0 },
  );
}

export { refundPrice };
