"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Palette, ShoppingBag } from "lucide-react";
import { useLocale } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/Button";
import { cn, faNum, href } from "@/lib/utils";

type AccountType = "buyer" | "artist";

/**
 * The account-type chooser on /signup — the fork of registration.
 *
 * Each type has its own page (`/signup/buyer`, `/signup/artist`) with its own
 * content and its own form, so this is a real choice: the card selects the type
 * and «ادامه» opens that page (each card also carries a direct link, so the
 * choice works without JavaScript too).
 */
export function AccountTypeChooser({ sharePct }: { sharePct: number }) {
  const { locale } = useLocale();
  const router = useRouter();
  const fa = locale === "fa";
  const [type, setType] = useState<AccountType>("buyer");

  const options = [
    {
      id: "buyer" as AccountType,
      icon: ShoppingBag,
      title: fa ? "خریدار" : "Buyer",
      body: fa
        ? "برای خرید لایسنس طرح‌ها، دانلود فایل‌ها، ذخیره‌ی علاقه‌مندی‌ها و نگه‌داشتن گواهی‌های خرید."
        : "Buy licences, download the files, save favourites and keep your licence certificates.",
      tags: fa ? ["فرم کوتاه", "چهار فیلد", "دسترسی فوری"] : ["Short form", "Four fields", "Instant access"],
      cta: fa ? "ثبت‌نام خریدار" : "Buyer signup",
      url: "/signup/buyer",
    },
    {
      id: "artist" as AccountType,
      icon: Palette,
      title: fa ? "هنرمند / طراح" : "Artist / Designer",
      body: fa
        ? "برای فروش طرح‌ها با لایسنس: پروفایل هنرمند، فرمت‌های تحویل، سهم فروش و تسویه."
        : "Sell your designs under licence: artist profile, delivery formats, revenue share and payouts.",
      tags: fa
        ? ["داشبورد هنرمند", "بازبینی مدیر", `${faNum(sharePct)}٪ سهم فروش`]
        : ["Artist dashboard", "Admin review", `${sharePct}% revenue share`],
      cta: fa ? "ثبت‌نام هنرمند / طراح" : "Artist signup",
      url: "/signup/artist",
    },
  ];

  const selected = options.find((option) => option.id === type) ?? options[0];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        router.push(href(locale, selected.url));
      }}
      className="grid gap-5"
    >
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-caption text-foreground-secondary">
          {fa ? "نوع حساب را انتخاب کنید؛ هر بخش صفحه‌ی جداگانه‌ی خودش را دارد." : "Pick the kind of account — each one has its own page."}
        </legend>

        {options.map((option) => {
          const active = option.id === type;
          const Icon = option.icon;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-2xl border p-4 text-start transition focus-within:border-foreground/50",
                active ? "border-foreground bg-background-secondary shadow-soft" : "border-border hover:border-foreground/40",
              )}
            >
              <input
                type="radio"
                name="account_role"
                value={option.id}
                checked={active}
                onChange={() => setType(option.id)}
                className="sr-only"
              />
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                <Icon className="h-4 w-4 text-accent" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{option.title}</span>
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active ? "border-foreground bg-foreground text-background" : "border-border",
                    )}
                    aria-hidden
                  >
                    {active && <Check className="h-2.5 w-2.5" />}
                  </span>
                </span>

                <span className="mt-1 block text-caption text-foreground-secondary">{option.body}</span>

                <span className="mt-2.5 flex flex-wrap gap-1.5">
                  {option.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-secondary">
                      {tag}
                    </span>
                  ))}
                </span>

                {/* the direct route — works with or without JavaScript */}
                <Link
                  href={href(locale, option.url)}
                  className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {fa ? `رفتن به فرم ${option.cta}` : `Open the ${option.cta} form`}
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" />
                </Link>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Button type="submit" size="lg" className="w-full">
        {fa ? `ادامه — ${selected.cta}` : `Continue — ${selected.cta}`}
      </Button>

      <p className="text-caption text-foreground-secondary">
        {fa
          ? "بعد از انتخاب، صفحه‌ی مخصوص همان حساب باز می‌شود؛ اگر نظرتان عوض شد، از همان‌جا با یک کلیک به صفحه‌ی دیگر می‌روید."
          : "Choosing opens that account's own page — and if you change your mind, one click takes you to the other one."}
      </p>
    </form>
  );
}
