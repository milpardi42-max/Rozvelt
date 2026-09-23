"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, FileUp, Loader2, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useLocale } from "@/components/providers/AppProviders";
import { Field, Input } from "@/components/ui/Input";
import { SESSION_FETCH } from "@/lib/http";
import { PRODUCT_FAMILIES, familyById } from "@/lib/data/families";
import { cn, faNum, href } from "@/lib/utils";

/**
 * Private master uploader.
 *
 * Files under the multipart threshold are posted in one request; larger ones are
 * sliced in the browser and pushed chunk-by-chunk (8 MB parts by default) either
 * to `/api/marketplace/upload/part` (local backend) or straight to presigned S3
 * URLs. Nothing is uploaded until a session exists, and the session is created
 * server-side with size/MIME checks, so a rejected file never touches storage.
 */

const ACCEPTED = ".png,.jpg,.jpeg,.webp,.tif,.tiff,.svg,.pdf,.zip,.psd,.ai,.eps,.mp4,.mov";

interface SessionInfo {
  id: string;
  mode: "single" | "multipart";
  sizeBytes: number;
  partSize: number;
  totalParts: number;
  partUrls: string[] | null;
  partEndpoint: string | null;
  completeEndpoint: string;
}

interface UploadResult {
  ok: boolean;
  asset?: {
    id: string;
    slug: string;
    status: string;
    previewKey?: string;
    tileKey?: string;
    mockups: number;
    seamless: { verdict: string; score: number };
    scan: { engine: string; status: string; threats: { id: string; label: { fa: string; en: string } }[] };
    master: { filename: string; sizeBytes: number; sha256: string };
  };
  error?: string;
  message?: string;
  detail?: string;
}

type Phase = "idle" | "session" | "uploading" | "finalizing" | "done" | "error";

export function MasterUploader({ onUploaded }: { onUploaded?: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const router = useRouter();
  const [meta, setMeta] = useState({
    titleFa: "",
    titleEn: "",
    kind: "pattern",
    tags: "",
    descriptionFa: "",
    /* The real product category — required, see `lib/data/families.ts`. */
    familyId: "",
  });
  /** Countdown shown after a successful upload, before the category opens. */
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const chosenFamily = familyById(meta.familyId);
  const categoryHref = chosenFamily ? `${href(locale, "/shop")}?family=${chosenFamily.slug}` : null;
  const ready = Boolean(file) && Boolean(chosenFamily) && meta.titleFa.trim().length > 0;

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setProgress(0);
    setStatus("");
    setResult(null);
    setRedirectIn(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = useCallback(
    async (target: File) => {
      setResult(null);
      setPhase("session");
      setStatus(fa ? "ایجاد نشست آپلود امن…" : "Opening a secure upload session…");

      try {
        const sessionResponse = await fetch("/api/marketplace/upload/session", {
          ...SESSION_FETCH,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: target.name,
            sizeBytes: target.size,
            mime: target.type || "application/octet-stream",
            title: { fa: meta.titleFa || target.name, en: meta.titleEn || target.name },
            description: { fa: meta.descriptionFa, en: "" },
            kind: meta.kind,
            familyId: meta.familyId,
            tags: meta.tags
              .split(/[,،]/)
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        });
        const sessionData = (await sessionResponse.json()) as {
          ok?: boolean;
          error?: string;
          session?: SessionInfo;
          limits?: { maxBytes: number };
        };
        if (!sessionData.ok || !sessionData.session) {
          setPhase("error");
          setStatus(
            sessionData.error === "unsupported_type"
              ? fa
                ? "این نوع فایل پذیرفته نمی‌شود."
                : "This file type is not accepted."
              : sessionData.error === "file_too_large"
                ? fa
                  ? `حجم فایل بیش از حد مجاز است (حداکثر ${Math.round((sessionData.limits?.maxBytes ?? 0) / 1024 / 1024)} مگابایت).`
                  : `File is too large (max ${Math.round((sessionData.limits?.maxBytes ?? 0) / 1024 / 1024)} MB).`
                : sessionData.error ?? "session_failed",
          );
          return;
        }

        const session = sessionData.session;
        setPhase("uploading");

        if (session.mode === "single") {
          const form = new FormData();
          form.set("sessionId", session.id);
          form.set("file", target);
          setStatus(fa ? "بارگذاری فایل…" : "Uploading…");
          setProgress(35);
          const response = await fetch(session.completeEndpoint, { ...SESSION_FETCH, method: "POST", body: form });
          setProgress(90);
          const data = (await response.json()) as UploadResult;
          setResult(data);
          setPhase(data.ok ? "done" : "error");
          setStatus(data.ok ? "" : data.error ?? "upload_failed");
          if (data.ok) onUploaded?.();
          return;
        }

        /* ---------- chunked ---------- */
        const total = session.totalParts;
        let sentBytes = 0;

        for (let index = 0; index < total; index += 1) {
          const partNumber = index + 1;
          const start = index * session.partSize;
          const chunk = target.slice(start, Math.min(start + session.partSize, target.size));

          if (session.partUrls?.[index]) {
            // S3: straight to the bucket, nothing through the app.
            const put = await fetch(session.partUrls[index], { method: "PUT", body: chunk });
            if (!put.ok) throw new Error(`s3_part_${partNumber}_${put.status}`);
            await fetch(session.partEndpoint ?? "/api/marketplace/upload/part", {
              ...SESSION_FETCH,
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: session.id, partNumber, bytes: chunk.size, etag: put.headers.get("etag") ?? "" }),
            });
          } else {
            const form = new FormData();
            form.set("sessionId", session.id);
            form.set("partNumber", String(partNumber));
            form.set("file", new File([chunk], `${partNumber}.part`));
            const response = await fetch(session.partEndpoint ?? "/api/marketplace/upload/part", {
              ...SESSION_FETCH,
              method: "POST",
              body: form,
            });
            if (!response.ok) {
              const problem = (await response.json().catch(() => ({}))) as { error?: string };
              throw new Error(problem.error ?? `part_${partNumber}_failed`);
            }
          }

          sentBytes += chunk.size;
          setProgress(Math.min(92, Math.round((sentBytes / target.size) * 100)));
          setStatus(
            fa
              ? `بخش ${partNumber} از ${total} بارگذاری شد`
              : `Chunk ${partNumber} of ${total} uploaded`,
          );
        }

        setPhase("finalizing");
        setStatus(fa ? "اسکن ویروس و ساخت پیش‌نمایش…" : "Scanning and building previews…");
        setProgress(95);

        const completeResponse = await fetch(session.completeEndpoint, {
          ...SESSION_FETCH,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const completeData = (await completeResponse.json()) as UploadResult;
        setResult(completeData);
        setPhase(completeData.ok ? "done" : "error");
        setStatus(
          completeData.ok
            ? ""
            : completeData.error === "infected"
              ? fa
                ? "اسکنر ویروس این فایل را آلوده تشخیص داد. فایل ذخیره نشد."
                : "The virus scanner flagged this file. It was not stored."
              : completeData.error ?? "complete_failed",
        );
        if (completeData.ok) onUploaded?.();
      } catch (error) {
        setPhase("error");
        setStatus(String(error).slice(0, 200));
      }
    },
    [fa, meta, onUploaded],
  );

  const busy = phase === "session" || phase === "uploading" || phase === "finalizing";

  /* The artist lands on the category they picked — their new work is filed there. */
  useEffect(() => {
    if (!categoryHref || !result?.ok) return;
    setRedirectIn(4);
    const tick = setInterval(() => setRedirectIn((value) => (value === null ? null : Math.max(0, value - 1))), 1000);
    const jump = setTimeout(() => router.push(categoryHref), 4000);
    return () => {
      clearInterval(tick);
      clearTimeout(jump);
    };
  }, [categoryHref, result?.ok, router]);

  return (
    <div className="space-y-5">
      <Field
        label={fa ? "دسته‌بندی اصلی محصول" : "Main product category"}
        hint={
          fa
            ? "محصول شما زیر همین دسته در فروشگاه دسته‌بندی می‌شود؛ بعد از ثبت، همین دسته باز می‌شود."
            : "Your product is filed under this category in the shop — it opens right after the upload."
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={fa ? "دسته‌بندی اصلی محصول" : "Main product category"}>
          {PRODUCT_FAMILIES.map((family) => {
            const active = meta.familyId === family.id;
            return (
              <button
                key={family.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMeta({ ...meta, familyId: family.id })}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition-all duration-200",
                  active
                    ? "border-accent bg-accent/10 shadow-soft"
                    : "border-border bg-surface hover:border-foreground/40",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate text-[13px]", active ? "font-semibold text-foreground" : "text-foreground-secondary")}>
                    {family.name[locale] ?? family.name.fa}
                  </span>
                  <span className="block truncate text-[11px] text-muted" dir="ltr">
                    {family.name.en}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active ? "border-accent bg-accent text-white" : "border-border",
                  )}
                >
                  {active && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={fa ? "عنوان اثر (فارسی)" : "Title (Persian)"}>
          <Input value={meta.titleFa} onChange={(event) => setMeta({ ...meta, titleFa: event.target.value })} placeholder="الگوی اسلیمی" />
        </Field>
        <Field label={fa ? "عنوان (انگلیسی)" : "Title (English)"}>
          <Input value={meta.titleEn} onChange={(event) => setMeta({ ...meta, titleEn: event.target.value })} placeholder="Arabesque pattern" dir="ltr" />
        </Field>
        <Field label={fa ? "نوع اثر" : "Kind"}>
          <select
            value={meta.kind}
            onChange={(event) => setMeta({ ...meta, kind: event.target.value })}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="pattern">{fa ? "الگو" : "Pattern"}</option>
            <option value="illustration">{fa ? "تصویرسازی" : "Illustration"}</option>
            <option value="photo">{fa ? "عکس" : "Photo"}</option>
            <option value="vector">{fa ? "وکتور" : "Vector"}</option>
            <option value="template">{fa ? "قالب" : "Template"}</option>
            <option value="font">{fa ? "فونت" : "Font"}</option>
          </select>
        </Field>
        <Field label={fa ? "برچسب‌ها (با ویرگول)" : "Tags (comma separated)"}>
          <Input value={meta.tags} onChange={(event) => setMeta({ ...meta, tags: event.target.value })} placeholder="arabesque, persian" />
        </Field>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-accent" />
        <p className="mt-3 font-medium">{fa ? "فایل مادر را اینجا رها کنید" : "Drop the master file here"}</p>
        <p className="mt-1 text-caption text-foreground-secondary">
          {fa
            ? "PNG، JPG، TIFF، WebP، SVG، PDF، PSD، AI، EPS، MP4 — فایل خام و بدون واترمارک."
            : "PNG, JPG, TIFF, WebP, SVG, PDF, PSD, AI, EPS, MP4 — the clean, un-watermarked original."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) setFile(picked);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-sm hover:border-foreground"
        >
          <FileUp className="me-2 h-4 w-4" />
          {fa ? "انتخاب فایل" : "Choose file"}
        </button>

        {file && (
          <div className="mx-auto mt-4 flex max-w-md items-center justify-between gap-3 rounded-xl bg-background-secondary px-4 py-3 text-start">
            <span className="min-w-0">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="block text-caption text-foreground-secondary" dir="ltr">
                {(file.size / 1024 / 1024).toFixed(1)} MB
                {file.size >= 200 * 1024 * 1024 ? (fa ? " · آپلود چندبخشی" : " · multipart") : ""}
              </span>
            </span>
            <button type="button" onClick={reset} aria-label={fa ? "حذف" : "Remove"}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {busy && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-background-secondary">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 flex items-center gap-2 text-caption text-foreground-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {status || (fa ? "در حال بارگذاری…" : "Uploading…")}
          </p>
        </div>
      )}

      {result?.ok && result.asset && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            {fa ? "فایل با موفقیت ثبت شد و در صف بازبینی است." : "Uploaded successfully — now in the review queue."}
          </p>
          <ul className="mt-2 space-y-1 text-caption text-foreground-secondary">
            <li>
              {fa ? "کد اثر" : "Asset"}: <span dir="ltr">{result.asset.id}</span> · {fa ? "شناسه" : "slug"}:{" "}
              <span dir="ltr">{result.asset.slug}</span>
            </li>
            {chosenFamily && (
              <li>
                {fa ? "دسته‌بندی" : "Category"}: <span className="font-medium text-foreground">{chosenFamily.name[locale] ?? chosenFamily.name.fa}</span>
              </li>
            )}
            <li>
              {fa ? "اسکن: " : "Scan: "}
              {result.asset.scan.engine} · {result.asset.scan.status}
            </li>
            <li>
              {fa ? "درزبندی: " : "Seam check: "}
              {result.asset.seamless.verdict} ({(result.asset.seamless.score * 100).toFixed(0)}%)
            </li>
            <li>
              SHA-256: <span dir="ltr">{result.asset.master.sha256.slice(0, 24)}…</span>
            </li>
          </ul>

          {categoryHref && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-success/20 pt-3">
              <Link href={categoryHref} className="inline-flex items-center gap-1 text-caption font-semibold text-foreground underline-offset-4 hover:text-accent hover:underline">
                {fa ? "مشاهده دسته‌بندی در فروشگاه" : "Open the category in the shop"}
              </Link>
              <span className="text-caption text-foreground-secondary">
                {redirectIn === null
                  ? fa
                    ? "به‌زودی به همین دسته منتقل می‌شوید."
                    : "Taking you to this category in a moment."
                  : fa
                    ? `انتقال خودکار به دسته‌بندی در ${faNum(redirectIn)} ثانیه…`
                    : `Opening the category in ${redirectIn}s…`}
              </span>
            </div>
          )}
        </div>
      )}

      {phase === "error" && (
        <p className="flex items-center gap-2 rounded-xl bg-error/10 p-4 text-caption text-error">
          <AlertTriangle className="h-4 w-4" />
          {status}
        </p>
      )}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => file && upload(file)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm text-background disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {fa ? "بارگذاری امن و ارسال برای بازبینی" : "Upload securely & submit for review"}
      </button>

      {!ready && !busy && (
        <p className="text-center text-caption text-muted">
          {fa
            ? "برای ارسال، دسته‌بندی اصلی، عنوان فارسی و فایل مادر لازم است."
            : "A category, a Persian title and the master file are required to submit."}
        </p>
      )}
    </div>
  );
}
