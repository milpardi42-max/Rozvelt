"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Copy, Download, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatPrice, href } from "@/lib/utils";
import { SESSION_FETCH } from "@/lib/http";
import type { PricePair } from "@/lib/marketplace/types";
import type { Localized } from "@/lib/i18n/types";

/**
 * Buyer's license vault.
 *
 * Every purchase lists its certificate number, the signed download link (which
 * expires, so it is always fetched fresh) and the remaining download quota.
 */

interface LicenseRow {
  id: string;
  serial: string;
  assetId: string;
  title: Localized;
  slug: string | null;
  licenseKind: string;
  exclusive: boolean;
  status: string;
  issuedAt: string;
  orderId: string;
  artistName: Localized;
  pricePaid: PricePair;
  royalty: { pct: number; amount: PricePair };
  quota: { used: number; limit: number; unlimited: boolean; remaining: number | null };
  downloads: { at: string; ip: string }[];
  downloadUrl: string | null;
  certificateUrl: string;
  verifyUrl: string;
}

export function MyLicenses({ locale }: { locale: "fa" | "en" }) {
  const fa = locale === "fa";
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/marketplace/licenses", SESSION_FETCH);
        const data = (await response.json()) as { ok?: boolean; licenses?: LicenseRow[] };
        setLicenses(data.licenses ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-caption text-foreground-secondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {fa ? "بارگذاری لایسنس‌ها…" : "Loading your licenses…"}
      </p>
    );
  }

  if (!licenses.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <ShieldCheck className="mx-auto h-6 w-6 text-accent" />
        <p className="mt-3 font-medium">{fa ? "هنوز لایسنسی ندارید" : "You have no licenses yet"}</p>
        <p className="mt-1 text-caption text-foreground-secondary">
          {fa ? "با خرید یک اثر دیجیتال، گواهی لایسنس و لینک دانلود امن بلافاصله صادر می‌شود." : "Buying a digital work issues a certificate and a secure download link immediately."}
        </p>
        <Link href={href(locale, "/marketplace")} className="mt-4 inline-flex rounded-full bg-foreground px-4 py-2 text-sm text-background">
          {fa ? "رفتن به فروشگاه" : "Browse the shop"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && <p className="rounded-xl bg-success/10 p-3 text-caption text-success">{notice}</p>}
      {licenses.map((license) => (
        <article key={license.id} className="rounded-2xl border border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{fa ? license.title.fa : license.title.en}</h2>
                <Badge tone={license.status === "active" ? "success" : "error"}>{license.status}</Badge>
                {license.exclusive && <Badge tone="accent">{fa ? "انحصاری" : "Exclusive"}</Badge>}
              </div>
              <p className="mt-1 text-caption text-foreground-secondary" dir="ltr">
                {license.serial} · {license.licenseKind}
              </p>
              <p className="mt-1 text-caption text-foreground-secondary">
                {fa ? "هنرمند" : "Artist"}: {fa ? license.artistName.fa : license.artistName.en} ·{" "}
                {fa ? "خرید" : "Purchased"}: {new Date(license.issuedAt).toLocaleDateString(fa ? "fa-IR" : "en-GB")} ·{" "}
                {formatPrice(license.pricePaid, locale)}
              </p>
              <p className="mt-1 text-caption text-foreground-secondary">
                {fa
                  ? `دانلود: ${license.quota.used} از ${license.quota.unlimited ? "نامحدود" : license.quota.limit}`
                  : `Downloads: ${license.quota.used} of ${license.quota.unlimited ? "unlimited" : license.quota.limit}`}
                {license.downloads[0] && (
                  <>
                    {" · "}
                    {fa ? "آخرین دانلود" : "last"}: {new Date(license.downloads[0].at).toLocaleDateString(fa ? "fa-IR" : "en-GB")}
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {license.downloadUrl ? (
                <a
                  href={license.downloadUrl}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm text-background"
                >
                  <Download className="h-4 w-4" />
                  {fa ? "دانلود فایل" : "Download"}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm text-foreground-secondary">
                  {license.status !== "active"
                    ? fa
                      ? "لایسنس باطل شده"
                      : "License revoked"
                    : fa
                      ? "سهمیه دانلود تمام شد"
                      : "Quota reached"}
                </span>
              )}
              <a
                href={`${license.certificateUrl}?locale=${locale}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm"
              >
                <FileText className="h-4 w-4" />
                {fa ? "گواهی PDF" : "PDF certificate"}
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${window.location.origin}${license.verifyUrl}`);
                  setNotice(fa ? "لینک راستی‌آزمایی کپی شد." : "Verification link copied.");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm"
              >
                <Copy className="h-4 w-4" />
                {fa ? "لینک راستی‌آزمایی" : "Verify link"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-caption text-foreground-secondary">
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="h-3.5 w-3.5 text-accent" />
              {fa ? "سفارش" : "Order"}: <span dir="ltr">{license.orderId}</span>
            </span>
            {license.slug && (
              <Link href={href(locale, `/marketplace/${license.slug}`)} className="text-accent underline">
                {fa ? "صفحه اثر" : "Asset page"}
              </Link>
            )}
            <a href={license.verifyUrl} target="_blank" rel="noreferrer" className="text-accent underline">
              {fa ? "راستی‌آزمایی عمومی" : "Public verification"}
            </a>
            <span className="ms-auto">
              {fa
                ? `سهم هنرمند: ${license.royalty.pct}%`
                : `Artist royalty: ${license.royalty.pct}%`}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
