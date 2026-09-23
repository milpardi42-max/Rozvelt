import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowLeftRight,
  BadgePercent,
  Banknote,
  BadgeCheck,
  FileStack,
  Globe2,
  LayoutGrid,
  Palette,
  Palette as PaletteIcon,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageHero } from "@/components/ui/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { CreatorSignupForm } from "@/components/profile/CreatorSignupForm";
import { getSite } from "@/lib/data/queries";
import { dictionaries } from "@/lib/i18n/dictionary";
import { DELIVERABLE_FORMATS, formatLabel } from "@/lib/marketplace/formats";
import { PRODUCT_FAMILIES } from "@/lib/data/families";
import { DEFAULT_ARTIST_SHARE_PCT } from "@/lib/marketplace/config";
import type { Locale } from "@/lib/i18n/types";
import { href, t } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: dictionaries[locale].nav.becomeCreator };
}

/**
 * Seller registration — the designer door.
 *
 * This page is the *seller* side of registration and is deliberately richer
 * than the buyer signup: it explains the model (formats, colourways, licences,
 * royalties, review), what is needed to start, and then collects the designer
 * through one single-page form — the form it always had, plus an optional
 * studio block. Buyers keep the short form at /signup.
 */
export default async function JoinPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const site = await getSite();
  const d = dictionaries[locale];
  const fa = locale === "fa";

  const perks = [
    {
      icon: BadgePercent,
      t: fa ? `${DEFAULT_ARTIST_SHARE_PCT}٪ سهم فروش` : `${DEFAULT_ARTIST_SHARE_PCT}% revenue share`,
      s: fa ? "شفاف و ماهانه؛ سهم شما در هر فروش در پنل مشخص است." : "Transparent and monthly — your share of every sale is itemised.",
    },
    {
      icon: Globe2,
      t: fa ? "مخاطب دوزبانه" : "Bilingual audience",
      s: fa ? "نمایش هم‌زمان به بازار ایران و بین‌الملل." : "Reach both Iranian and international markets.",
    },
    {
      icon: Palette,
      t: fa ? "چند رنگ، یک اثر" : "Many colours, one work",
      s: fa ? "هر طرح را با چند رنگ‌بندی و فرمت کامل منتشر کنید." : "Publish one design in several colourways and formats.",
    },
    {
      icon: ShieldCheck,
      t: fa ? "حفاظت کامل" : "Full protection",
      s: fa ? "واترمارک، بازبینی انسانی، لینک امضاشده و گواهی لایسنس." : "Watermark, human review, signed links and licence certificates.",
    },
  ];

  const steps = [
    {
      icon: BadgeCheck,
      t: fa ? "۱. همین صفحه‌ی ثبت‌نام" : "1. This form",
      s: fa ? "حساب کاربری، حوزه‌ی فعالیت و شهر؛ اطلاعات استودیو و فرمت‌ها اختیاری‌اند." : "Account, field of practice and city — studio details and formats are optional.",
    },
    {
      icon: ShieldCheck,
      t: fa ? "۲. بازبینی مدیر" : "2. Admin review",
      s: fa ? "پرونده‌ی شما را انسان بررسی می‌کند؛ نتیجه را در داشبورد می‌بینید." : "A human reviews the file; the result shows in your dashboard.",
    },
    {
      icon: FileStack,
      t: fa ? "۳. ارسال فایل مادر" : "3. Submit masters",
      s: fa ? "برای هر رنگ، اسلات هر فرمت را پر می‌کنید و فایل‌ها امن ذخیره می‌شوند." : "Fill the slot of each format per colour; files are stored privately.",
    },
    {
      icon: Wallet,
      t: fa ? "۴. فروش و تسویه" : "4. Sell & get paid",
      s: fa ? "قیمت لایسنس‌ها را می‌گذارید، فروش را می‌بینید و درخواست تسویه می‌دهید." : "Price your licences, watch the sales and request payouts.",
    },
  ];

  const requirements = fa
    ? [
        "حداقل یک فایل PNG یا JPG (فایل رستر) — پیش‌نمایش، واترمارک و بررسی بی‌درزی از آن ساخته می‌شود.",
        "فایل‌های منبع اختیاری: AI، PSD، SVG یا EPS برای تحویل حرفه‌ای به خریدار.",
        "عنوان و توضیح فارسی و انگلیسی (می‌توانید بعداً کامل کنید).",
        "رنگ‌بندی‌های طرح — یک طرح می‌تواند چند رنگ داشته باشد.",
        "اطلاعات تسویه: شبا، شماره کارت یا ایمیل پی‌پال برای پرداخت سهم شما.",
      ]
    : [
        "At least one PNG or JPG (raster) — the preview, watermark and seam check come from it.",
        "Optional sources: AI, PSD, SVG or EPS for a professional hand-off.",
        "A title and description in Persian and English (can be completed later).",
        "Your colourways — a single design may ship in several colours.",
        "Payout details: IBAN, card number or PayPal e-mail for your share.",
      ];

  const faq = [
    {
      q: fa ? "تأیید چقدر طول می‌کشد؟" : "How long does approval take?",
      a: fa
        ? "پرونده‌ی هنرمند و سپس هر فایل مادر توسط مدیر بررسی می‌شود. تا زمانی که در انتظار بازبینی هستید، می‌توانید همه‌چیز را در داشبورد ببینید و آماده کنید."
        : "Your artist file, then each master, is reviewed by an admin. While waiting you can prepare everything from the dashboard.",
    },
    {
      q: fa ? "سهم من چطور حساب می‌شود؟" : "How is my share calculated?",
      a: fa
        ? `به‌صورت پیش‌فرض ${DEFAULT_ARTIST_SHARE_PCT}٪ مبلغ فروش سهم شماست (قابل توافق در قرارداد). مالیات، سهم معرف و کارمزدها جداگانه در کارنامه‌ی فروش نمایش داده می‌شوند.`
        : `By default ${DEFAULT_ARTIST_SHARE_PCT}% of each sale is yours (adjustable per contract). Tax, affiliate share and fees are itemised in your ledger.`,
    },
    {
      q: fa ? "اگر بعداً رنگ یا فایل اضافه کنم؟" : "What if I add a colour or file later?",
      a: fa
        ? "رنگ‌بندی و فایل تازه را به همان اثر اضافه می‌کنید؛ چون تحویل تغییر کرده، اثر دوباره به بازبینی می‌رود و بعد از تأیید به فروش برمی‌گردد."
        : "You add the colourway or file to the same work; because the delivery changed it returns to review, then goes back on sale.",
    },
    {
      q: fa ? "تسویه چطور انجام می‌شود؟" : "How do payouts work?",
      a: fa
        ? "اطلاعات تسویه را یک‌بار ثبت می‌کنید؛ هر زمان موجودی قابل برداشت از حداقل تسویه عبور کند، درخواست می‌دهید و مدیر پرداخت را ثبت می‌کند."
        : "Save your payout details once; whenever the available balance passes the minimum you request a payout and an admin settles it.",
    },
  ];

  const heroImage = site.artists[0]?.cover ?? site.artists[0]?.avatar ?? site.hero.image;

  const breadcrumb = [
    { label: d.nav.home, href: href(locale, "/") },
    { label: d.nav.artists, href: href(locale, "/artists") },
    { label: d.nav.becomeCreator },
  ];

  const options = fa
    ? ["طراح سطح", "تصویرگر", "طراح گرافیک", "هنرمند سنتی", "استودیو"]
    : ["Surface designer", "Illustrator", "Graphic designer", "Traditional artist", "Studio"];

  return (
    <>
      <PageHero
        eyebrow={d.nav.artists}
        title={d.nav.becomeCreator}
        description={
          fa
            ? "طرح‌هایتان را با لایسنس بفروشید: فایل‌های تحویل حرفه‌ای، چند رنگ‌بندی، سهم شفاف و تسویه‌ی ماهانه."
            : "Sell your patterns under licence: professional delivery files, several colourways, a transparent share and monthly payouts."
        }
        image={heroImage}
        breadcrumb={breadcrumb}
        locale={locale}
        zoomDirection="in"
      />

      <section className="container-x pb-20">
        {/* Perks */}
        <div className="grid gap-6 md:grid-cols-4">
          {perks.map((p, i) => (
            <Reveal key={p.t} delay={i * 60} className="rounded-lg border border-border p-6">
              <p.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-4 font-semibold">{p.t}</h3>
              <p className="mt-1.5 text-body-sm text-foreground-secondary">{p.s}</p>
            </Reveal>
          ))}
        </div>

        {/* What you deliver */}
        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <Reveal className="rounded-2xl border border-border bg-surface p-7">
            <p className="flex items-center gap-2 text-label text-accent">
              <Sparkles className="h-4 w-4" />
              {fa ? "چه چیزی تحویل می‌دهید" : "What you deliver"}
            </p>
            <h2 className="mt-2 font-display text-h3">{fa ? "فرمت‌ها و رنگ‌بندی‌ها" : "Formats & colourways"}</h2>
            <p className="mt-2 text-body-sm text-foreground-secondary">
              {fa
                ? "برای هر رنگ، اسلات هر فرمت را پر می‌کنید. خریدار همه‌ی فایل‌ها را با یک لایسنس می‌گیرد."
                : "Fill a slot per format for each colour. The buyer receives every file with one licence."}
            </p>
            <ul className="mt-5 space-y-3">
              {DELIVERABLE_FORMATS.map((format) => (
                <li key={format.id} className="flex gap-3 text-caption">
                  <span className="mt-0.5 inline-flex h-6 min-w-14 items-center justify-center rounded-full border border-border px-2 font-medium" dir="ltr">
                    {formatLabel(format.id, locale)}
                  </span>
                  <span className="text-foreground-secondary">{t(format.hint, locale)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-caption text-foreground-secondary">
              {fa ? "تصویر پیش‌نمایش هم دارید: کاوری که خریدار اول می‌بیند." : "Plus a preview image: the cover buyers see first."}
            </p>
          </Reveal>

          <Reveal delay={80} className="rounded-2xl border border-border bg-surface p-7">
            <p className="flex items-center gap-2 text-label text-accent">
              <LayoutGrid className="h-4 w-4" />
              {fa ? "برای چه دسته‌هایی" : "Which categories"}
            </p>
            <h2 className="mt-2 font-display text-h3">{fa ? "هشت دسته‌ی اصلی فروشگاه" : "The eight shop categories"}</h2>
            <p className="mt-2 text-body-sm text-foreground-secondary">
              {fa
                ? "هر اثر را در زمان آپلود به یکی از این دسته‌ها می‌سپارید تا مشتری درست پیدا کند."
                : "Each work is filed under one of these at upload time so buyers find it."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {PRODUCT_FAMILIES.map((family) => (
                <span key={family.id} className="rounded-full border border-border px-3.5 py-1.5 text-caption">
                  {t(family.name, locale)}
                </span>
              ))}
            </div>

            <div className="mt-7 rounded-xl border border-border bg-background-secondary p-5">
              <p className="flex items-center gap-2 text-label text-muted">
                <ArrowLeftRight className="h-4 w-4" />
                {fa ? "لایسنس‌هایی که می‌فروشید" : "Licences you sell"}
              </p>
              <ul className="mt-3 space-y-2 text-caption text-foreground-secondary">
                <li>{fa ? "شخصی — برای استفاده‌ی خود خریدار." : "Personal — for the buyer's own use."}</li>
                <li>{fa ? "تجاری — برای محصولات و کالای فروشی." : "Commercial — for products and goods."}</li>
                <li>{fa ? "گسترده و انحصاری — با شرایط قابل توافق." : "Extended and exclusive — by agreement."}</li>
              </ul>
            </div>
          </Reveal>
        </div>

        {/* How it works */}
        <div className="mt-14">
          <h2 className="font-display text-h2">{fa ? "از ثبت‌نام تا اولین فروش" : "From signup to your first sale"}</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-4">
            {steps.map((step, i) => (
              <Reveal key={step.t} delay={i * 60} className="rounded-lg border border-border p-6">
                <step.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-4 font-semibold">{step.t}</h3>
                <p className="mt-1.5 text-body-sm text-foreground-secondary">{step.s}</p>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Requirements + numbers */}
        <div className="mt-14 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="font-display text-h2">{fa ? "برای شروع چه لازم دارید" : "What you need to start"}</h2>
            <ul className="mt-6 space-y-3">
              {requirements.map((item) => (
                <li key={item} className="flex gap-3 text-body-sm text-foreground-secondary">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: BadgePercent,
                  value: `${DEFAULT_ARTIST_SHARE_PCT}٪`,
                  label: fa ? "سهم شما از هر فروش" : "Your share per sale",
                },
                {
                  icon: Banknote,
                  value: fa ? "۵۰۰٬۰۰۰ تومان" : "$25",
                  label: fa ? "حداقل مبلغ تسویه" : "Minimum payout",
                },
                {
                  icon: ShieldCheck,
                  value: fa ? "بازبینی انسانی" : "Human review",
                  label: fa ? "قبل از انتشار هر اثر" : "Before any work goes live",
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border p-6">
                  <stat.icon className="h-5 w-5 text-accent" />
                  <p className="mt-4 font-display text-h3">{stat.value}</p>
                  <p className="mt-1 text-caption text-foreground-secondary">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Existing artists */}
            <div className="mt-8 rounded-2xl border border-border p-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <PaletteIcon className="h-4 w-4 text-accent" />
                {fa ? "طراحانی که همراه ما هستند" : "Designers already with us"}
              </h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {site.artists.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="relative h-10 w-10 overflow-hidden rounded-full">
                      <Image src={a.avatar} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{t(a.name, locale)}</span>
                      <span className="block text-caption text-foreground-secondary">{t(a.profession, locale)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Application form */}
        <div id="apply" className="mt-16 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="font-display text-h2">{fa ? "فرم ثبت‌نام فروشنده" : "Seller registration"}</h2>
            <p className="mt-3 text-body-sm text-foreground-secondary">
              {fa
                ? "همین یک فرم: حساب کاربری، حوزه‌ی فعالیت و شهر. اطلاعات استودیو، فرمت‌های تحویل و دسته‌های کاری اختیاری‌اند و هر زمان از داشبورد هنرمند قابل تکمیل. بعد از ثبت، همین حالا وارد داشبورد می‌شوید."
                : "One single form: your account, field of practice and city. Studio details, delivery formats and product families are optional and can be completed later from the dashboard. You land straight in the artist dashboard."}
            </p>
            <ul className="mt-6 space-y-3 text-caption text-foreground-secondary">
              <li className="flex gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {fa ? "خریدار هستید؟ ثبت‌نام کوتاه خریدار: " : "Just buying? The short buyer signup: "}
                <a href={href(locale, "/signup")} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {fa ? "ثبت‌نام خریدار" : "buyer signup"}
                </a>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {fa ? "اطلاعات شما فقط برای بررسی پرونده استفاده می‌شود." : "Your details are used for the review only."}
              </li>
            </ul>
          </div>

          <div className="lg:col-span-8">
            <CreatorSignupForm options={options} />
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16">
          <h2 className="font-display text-h2">{fa ? "پرسش‌های پرتکرار فروشندگان" : "Seller FAQ"}</h2>
          <div className="mt-6 divide-y divide-border rounded-2xl border border-border">
            {faq.map((item) => (
              <details key={item.q} className="group p-5">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
                  {item.q}
                  <span className="text-muted transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-caption text-foreground-secondary">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
