"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Check, Loader2, Palette, PartyPopper, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth, useLocale } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { DELIVERABLE_FORMATS, formatLabel } from "@/lib/marketplace/formats";
import { PRODUCT_FAMILIES } from "@/lib/data/families";
import { cn, faNum, href, t } from "@/lib/utils";

export type AccountRole = "buyer" | "artist";

interface SignupFormProps {
  /** Which account type opens selected — /signup/artist starts on the seller half */
  initialRole?: AccountRole;
  /** Field-of-practice choices for the seller half */
  options: string[];
  /** Artist revenue share quoted on the seller card (read on the server) */
  sharePct: number;
  /** "card" renders inside the auth shell, "page" inside the wide seller page */
  variant?: "card" | "page";
  /** Buyer hand-off — the shell runs its sign-in transition with these */
  onSignupSuccess?: (email: string, password: string) => void;
}

const EXPERIENCE_CHOICES = {
  fa: [
    { value: "1-3", label: "۱ تا ۳ سال" },
    { value: "4-7", label: "۴ تا ۷ سال" },
    { value: "8-15", label: "۸ تا ۱۵ سال" },
    { value: "15+", label: "بیش از ۱۵ سال" },
  ],
  en: [
    { value: "1-3", label: "1–3 years" },
    { value: "4-7", label: "4–7 years" },
    { value: "8-15", label: "8–15 years" },
    { value: "15+", label: "15+ years" },
  ],
} as const;

/**
 * Registration — one single form for both kinds of account.
 *
 * The visitor picks the account type *inside the form*: «خریدار» or
 * «هنرمند / طراح». The first four fields (name, e-mail, password, confirmation)
 * are the account itself; choosing the artist half additionally opens the
 * seller part — phone, field of practice, city, Instagram, portfolio and the
 * optional studio block (studio name, experience, bio, delivery formats,
 * product families, terms). Nothing in the seller part is required: an empty
 * answer is simply not stored and can be completed later from the artist
 * dashboard.
 *
 * The very same component is used everywhere registration happens — the auth
 * card on /signup and /signup/buyer, and the seller page /signup/artist — so
 * both account types really do share one form, with `initialRole` deciding
 * which half opens first and `variant` matching the wrapper around it.
 */
export function SignupForm({
  initialRole = "buyer",
  options,
  sharePct,
  variant = "card",
  onSignupSuccess,
}: SignupFormProps) {
  const { locale } = useLocale();
  const { signup, user } = useAuth();
  const router = useRouter();
  const fa = locale === "fa";
  const wide = variant === "page";

  const [role, setRole] = useState<AccountRole>(initialRole);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);

  const seller = role === "artist";
  /** A visitor who already sells cannot register again — the card points at the dashboard */
  const sellerLocked = seller && (user?.role === "artist" || user?.role === "admin");

  const accountTypes = [
    {
      id: "buyer" as AccountRole,
      icon: ShoppingBag,
      title: fa ? "خریدار" : "Buyer",
      body: fa
        ? "برای خرید لایسنس طرح‌ها، دانلود فایل‌ها، ذخیره‌ی علاقه‌مندی‌ها و نگه‌داشتن گواهی‌های خرید."
        : "Buy licences, download the files, save favourites and keep your licence certificates.",
      tags: fa ? ["فرم کوتاه", "چهار فیلد"] : ["Short form", "Four fields"],
    },
    {
      id: "artist" as AccountRole,
      icon: Palette,
      title: fa ? "هنرمند / طراح" : "Artist / Designer",
      body: fa
        ? "برای فروش طرح‌ها با لایسنس: پروفایل هنرمند، فرمت‌های تحویل، سهم فروش و تسویه."
        : "Sell your designs under licence: artist profile, delivery formats, revenue share and payouts.",
      tags: fa
        ? ["داشبورد هنرمند", "بازبینی مدیر", `${faNum(sharePct)}٪ سهم فروش`]
        : ["Artist dashboard", "Admin review", `${sharePct}% revenue share`],
    },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState("loading");
    setErrMsg("");
    const fd = new FormData(e.currentTarget);

    const name = String(fd.get("name") || "");
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");

    if (password !== confirm) {
      setState("idle");
      setErrMsg(fa ? "رمز عبور و تکرار آن یکسان نیستند." : "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setState("idle");
      setErrMsg(fa ? "رمز عبور باید حداقل ۶ کاراکتر باشد." : "Password must be at least 6 characters.");
      return;
    }

    /* the account type is the visitor's own choice — the seller file rides along only for artists */
    const extra = seller
      ? {
          phone: String(fd.get("phone") || ""),
          city: String(fd.get("city") || ""),
          specialty: String(fd.get("type") || ""),
          instagram: String(fd.get("instagram") || ""),
          portfolioUrl: String(fd.get("portfolio") || ""),
          studioName: String(fd.get("studioName") || ""),
          experience: String(fd.get("experience") || ""),
          bio: String(fd.get("bio") || ""),
          formats,
          families,
          terms,
        }
      : undefined;

    const r = await signup(name, email, password, seller ? "artist" : "user", extra);
    if (!r.ok) {
      setState("error");
      const errorMap: Record<string, string> = {
        email_taken: fa ? "این ایمیل قبلاً ثبت شده است. وارد شوید یا ایمیل دیگری بزنید." : "This email is already registered.",
        invalid: fa ? "اطلاعات وارد شده معتبر نیست." : "Please check your details.",
        network: fa ? "خطای شبکه. لطفاً دوباره تلاش کنید." : "Network error. Please try again.",
        server_error: fa ? "خطای سرور. لطفاً بعداً تلاش کنید." : "Server error. Please try again later.",
      };
      setErrMsg(errorMap[r.error ?? ""] ?? (fa ? "خطایی رخ داد." : "An error occurred."));
      return;
    }

    setState("ok");
    if (seller) {
      setTimeout(() => router.push(href(locale, "/artist")), 2600);
      return;
    }
    if (onSignupSuccess) {
      onSignupSuccess(email, password);
      return;
    }
    router.push(href(locale, "/account"));
  };

  if (state === "ok") {
    return seller ? (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
        <PartyPopper className="mx-auto h-8 w-8 text-success" />
        <p className="mt-4 font-display text-h3">{fa ? "ثبت‌نام شما انجام شد" : "You are registered"}</p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-start text-caption text-foreground-secondary">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa ? "حساب کاربری شما ساخته شد و همین حالا وارد شده‌اید." : "Your account exists and you are signed in."}
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa
              ? "پرونده‌ی هنرمندی برای بازبینی مدیر ثبت شد؛ هر اطلاعاتی که وارد کردید همراه آن رفت."
              : "An artist file went to the admin for review, with whatever you filled in."}
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa ? "پس از تأیید، می‌توانید فایل مادر را ارسال کنید و فروش را شروع کنید." : "Once approved, submit masters and start selling."}
          </li>
        </ul>
        <p className="mt-6 flex items-center justify-center gap-2 text-caption text-foreground-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {fa ? "در حال رفتن به داشبورد هنرمند…" : "Opening your artist dashboard…"}
        </p>
        <Link
          href={href(locale, "/artist")}
          className="mt-4 inline-flex h-10 items-center rounded-full border border-border px-5 text-caption hover:border-foreground"
        >
          {fa ? "همین حالا برو" : "Go now"}
        </Link>
      </div>
    ) : (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
        <PartyPopper className="mx-auto h-8 w-8 text-success" />
        <p className="mt-4 font-display text-h3">{fa ? "حساب خریدار شما ساخته شد" : "Your buyer account is ready"}</p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-start text-caption text-foreground-secondary">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa ? "همین حالا وارد حساب خود هستید." : "You are signed in right away."}
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa
              ? "لایسنس‌ها، فایل‌های دانلود‌شده و گواهی‌های خرید در پنل حساب شما می‌ماند."
              : "Licences, downloaded files and certificates stay in your account."}
          </li>
        </ul>
        <p className="mt-6 flex items-center justify-center gap-2 text-caption text-foreground-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {fa ? "در حال ورود…" : "Signing you in…"}
        </p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-caption transition ${
      active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
    }`;

  const spanFull = wide ? "sm:col-span-2" : undefined;

  return (
    <form onSubmit={handleSubmit} className={cn("grid gap-4", wide && "sm:grid-cols-2")} noValidate>
      {/* the choice itself — the form follows whatever the visitor picks */}
      <fieldset
        className={cn(
          "rounded-2xl border border-border",
          wide ? "bg-surface p-5 sm:col-span-2 sm:p-6" : "bg-background-secondary p-4",
        )}
      >
        <legend className="px-2 text-caption font-medium">{fa ? "نوع حساب" : "Account type"}</legend>
        <p className="text-caption text-foreground-secondary">
          {fa
            ? "خودتان انتخاب می‌کنید — فرم با انتخاب شما تغییر می‌کند؛ خریدار چهار فیلد دارد و فرم هنرمند/طراح اطلاعات فروشندگی را هم می‌پرسد."
            : "You choose — the form follows: a buyer needs four fields, an artist / designer also gets the seller details."}
        </p>
        <div className={cn("mt-4 grid gap-3", wide && "sm:grid-cols-2")}>
          {accountTypes.map((type) => {
            const Icon = type.icon;
            const active = role === type.id;
            return (
              <label
                key={type.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition",
                  active ? "border-foreground bg-foreground/[0.04]" : "border-border hover:border-foreground/40",
                )}
              >
                <input
                  type="radio"
                  name="account_role"
                  value={type.id}
                  checked={active}
                  onChange={() => setRole(type.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-foreground"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-muted")} />
                    {type.title}
                    {active && <Check className="h-3.5 w-3.5 text-success" />}
                  </span>
                  <span className="mt-1 block text-caption text-foreground-secondary">{type.body}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {type.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-secondary">
                        {tag}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* the account itself — the same four fields for both kinds of account */}
      <Field label={fa ? "نام و نام خانوادگی" : "Full name"} className={spanFull}>
        <Input name="name" required autoComplete="name" />
      </Field>
      <Field label={fa ? "ایمیل" : "Email"} className={spanFull}>
        <Input name="email" type="email" required dir="ltr" autoComplete="email" />
      </Field>
      <Field label={fa ? "رمز عبور (حداقل ۶ کاراکتر)" : "Password (min 6 chars)"}>
        <Input name="password" type="password" required dir="ltr" minLength={6} autoComplete="new-password" />
      </Field>
      <Field label={fa ? "تکرار رمز عبور" : "Confirm password"}>
        <Input name="confirm" type="password" required dir="ltr" minLength={6} autoComplete="new-password" />
      </Field>

      {/* seller half — opened by choosing «هنرمند / طراح», nothing in here is required */}
      <div
        data-seller-fields
        hidden={!seller || sellerLocked}
        className={cn("grid gap-4", wide && "sm:col-span-2 sm:grid-cols-2")}
      >
        <Field label={fa ? "شماره تماس" : "Phone"}>
          <Input name="phone" type="tel" dir="ltr" autoComplete="tel" />
        </Field>
        <Field label={fa ? "نوع فعالیت" : "Specialty"}>
          <Select name="type">
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </Field>
        <Field label={fa ? "شهر" : "City"}>
          <Input name="city" autoComplete="address-level2" />
        </Field>
        <Field label={fa ? "آیدی اینستاگرام (اختیاری)" : "Instagram handle (optional)"}>
          <Input name="instagram" dir="ltr" placeholder="@username" />
        </Field>
        <Field label={fa ? "لینک پورتفولیو (اختیاری)" : "Portfolio link (optional)"} className={wide ? "sm:col-span-2" : undefined}>
          <Input name="portfolio" type="url" dir="ltr" placeholder="https://..." />
        </Field>

        {/* Optional studio file — nothing here is required */}
        <div className={wide ? "sm:col-span-2" : undefined}>
          <fieldset className="rounded-2xl border border-border bg-background-secondary p-5 sm:p-6">
            <legend className="flex items-center gap-2 px-2 text-caption font-medium">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {fa ? "اطلاعات استودیو — اختیاری" : "Studio details — optional"}
            </legend>
            <p className="text-caption text-foreground-secondary">
              {fa
                ? "هر موردی را که همین حالا ننویسید، بعداً از داشبورد هنرمند تکمیل می‌کنید. هر چه وارد کنید همراه پرونده‌ی شما برای بازبینی مدیر می‌رود."
                : "Anything you leave out now can be completed later from the artist dashboard. Whatever you enter goes to the admin with your file."}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={fa ? "نام استودیو یا برند" : "Studio / brand name"}>
                <Input name="studioName" />
              </Field>
              <Field label={fa ? "سابقه‌ی کار" : "Experience"}>
                {/* no default: unless the designer picks one, nothing is stored */}
                <Select name="experience" defaultValue="">
                  <option value="">{fa ? "— انتخاب کنید —" : "— Choose —"}</option>
                  {EXPERIENCE_CHOICES[fa ? "fa" : "en"].map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={fa ? "درباره‌ی شما و کارتان" : "About you and your work"}
                className="sm:col-span-2"
                hint={fa ? "دو تا سه خط؛ همین متن در پروفایل عمومی هنرمند نمایش داده می‌شود." : "Two or three lines — this becomes your public artist bio."}
              >
                <Textarea name="bio" rows={3} maxLength={400} />
              </Field>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium">{fa ? "چه فرمت‌هایی تحویل می‌دهید؟" : "Which formats will you deliver?"}</legend>
              <p className="mt-1 text-caption text-foreground-secondary">
                {fa
                  ? "اختیاری — فقط به ما می‌گوید چه انتظاری از فایل‌های شما داشته باشیم؛ هر زمان قابل تغییر است."
                  : "Optional — it tells us what to expect from your files; you can change it any time."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DELIVERABLE_FORMATS.map((format) => {
                  const active = formats.includes(format.id);
                  return (
                    <button
                      key={format.id}
                      type="button"
                      title={t(format.hint, locale)}
                      aria-pressed={active}
                      onClick={() =>
                        setFormats((prev) => (prev.includes(format.id) ? prev.filter((id) => id !== format.id) : [...prev, format.id]))
                      }
                      className={chip(active)}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {formatLabel(format.id, locale)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium">{fa ? "روی چه دسته‌هایی کار می‌کنید؟" : "Which product families do you design for?"}</legend>
              <p className="mt-1 text-caption text-foreground-secondary">
                {fa ? "اختیاری — همان هشت دسته‌ی اصلی فروشگاه؛ می‌توانید چند مورد را انتخاب کنید." : "Optional — the eight shop categories; pick as many as you like."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRODUCT_FAMILIES.map((family) => {
                  const active = families.includes(family.id);
                  return (
                    <button
                      key={family.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setFamilies((prev) => (prev.includes(family.id) ? prev.filter((id) => id !== family.id) : [...prev, family.id]))
                      }
                      className={chip(active)}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {t(family.name, locale)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 text-caption">
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-0.5" />
              <span className="text-foreground-secondary">
                {fa
                  ? "تأیید می‌کنم آثار ارسالی از خودم است یا حق فروش آن را دارم، و شرایط فروش، لایسنس و تسویه‌ی رزی آتلیه را می‌پذیرم."
                  : "I confirm the works I submit are mine (or I hold the rights), and I accept the Rosie Atelier selling, licensing and payout terms."}
              </span>
            </label>
          </fieldset>
        </div>
      </div>

      {/* a visitor who already sells gets the dashboard instead of a second registration */}
      {sellerLocked && (
        <div className={cn(wide && "sm:col-span-2")}>
          <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
            <BadgeCheck className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 font-display text-h3">{fa ? "شما فروشنده‌ی رزی آتلیه هستید" : "You are already a Rosie Atelier seller"}</p>
            <p className="mt-2 text-caption text-foreground-secondary">
              {fa
                ? "داشبورد هنرمند، آثار، فروش، سهم شما و تسویه‌ها را نشان می‌دهد."
                : "Your dashboard shows works, sales, royalties and payouts."}
            </p>
            <Link
              href={href(locale, "/artist")}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm text-background"
            >
              {fa ? "رفتن به داشبورد هنرمند" : "Open the artist dashboard"}
            </Link>
          </div>
        </div>
      )}

      {state === "error" && errMsg && (
        <div className={cn(wide && "sm:col-span-2")}>
          <p role="alert" className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
            {errMsg}
          </p>
        </div>
      )}

      <div className={cn(wide && "sm:col-span-2")} hidden={sellerLocked}>
        <Button type="submit" size="lg" disabled={state === "loading"} className={cn("w-full", wide && "sm:w-auto")}>
          {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          {seller
            ? fa
              ? "ثبت‌نام به عنوان هنرمند / طراح"
              : "Register as an artist / designer"
            : fa
              ? "ثبت‌نام به عنوان خریدار"
              : "Register as a buyer"}
        </Button>
        <p className="mt-3 text-caption text-foreground-secondary">
          {fa ? "قبلاً ثبت نام کرده‌اید؟" : "Already have an account?"}{" "}
          <Link href={href(locale, "/login")} className="font-medium text-foreground underline-offset-4 hover:underline">
            {fa ? "ورود" : "Sign in"}
          </Link>
        </p>
      </div>
    </form>
  );
}
