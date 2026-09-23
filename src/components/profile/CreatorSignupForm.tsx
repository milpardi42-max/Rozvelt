"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Loader2, Palette, PartyPopper, Store } from "lucide-react";
import { useAuth, useLocale } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { DELIVERABLE_FORMATS, formatLabel } from "@/lib/marketplace/formats";
import { PRODUCT_FAMILIES, familyName } from "@/lib/data/families";
import { href, t } from "@/lib/utils";

interface CreatorSignupFormProps {
  options: string[];
}

type Step = 1 | 2 | 3;

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
 * Designer / seller registration — the three-step studio application.
 *
 * Deliberately separate from the buyer signup (/signup): a seller is asked for
 * the studio, the field of practice, and the delivery formats and product
 * families they work in. Those answers are stored on the Artist record that
 * self-registration creates, so the admin reviews a *complete* application and
 * the artist's own dashboard can nudge the gaps afterwards.
 */
export function CreatorSignupForm({ options }: CreatorSignupFormProps) {
  const { locale } = useLocale();
  const { signup, user } = useAuth();
  const router = useRouter();
  const fa = locale === "fa";

  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [formats, setFormats] = useState<string[]>(["png", "jpg"]);
  const [families, setFamilies] = useState<string[]>([]);
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    specialty: options[0] ?? "",
    studioName: "",
    city: "",
    phone: "",
    experience: EXPERIENCE_CHOICES[fa ? "fa" : "en"][1].value as string,
    bio: "",
    instagram: "",
    portfolioUrl: "",
  });
  const [terms, setTerms] = useState(false);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const steps = useMemo(
    () => [
      { id: 1 as Step, title: fa ? "حساب کاربری" : "Account", icon: BadgeCheck },
      { id: 2 as Step, title: fa ? "استودیو و تخصص" : "Studio & craft", icon: Palette },
      { id: 3 as Step, title: fa ? "نمونه‌کار و تعهد" : "Work & terms", icon: Store },
    ],
    [fa],
  );

  /** Client-side gate per step — the API validates everything again. */
  const stepError = (candidate: Step): string | null => {
    if (candidate === 1) {
      if (!values.name.trim()) return fa ? "نام و نام خانوادگی را وارد کنید." : "Enter your full name.";
      if (!values.email.includes("@")) return fa ? "ایمیل معتبر وارد کنید." : "Enter a valid email.";
      if (values.password.length < 6) return fa ? "رمز عبور باید حداقل ۶ کاراکتر باشد." : "Password must be at least 6 characters.";
      if (values.password !== values.confirm) return fa ? "رمز عبور و تکرار آن یکسان نیستند." : "Passwords do not match.";
    }
    if (candidate === 2) {
      if (!values.specialty.trim()) return fa ? "حوزه‌ی فعالیت را انتخاب کنید." : "Pick your field of practice.";
      if (!values.city.trim()) return fa ? "شهر را وارد کنید." : "Enter your city.";
    }
    if (candidate === 3) {
      if (formats.length === 0) return fa ? "حداقل یک فرمت تحویل انتخاب کنید." : "Choose at least one delivery format.";
      if (!terms) return fa ? "پذیرش شرایط فروش الزامی است." : "Accepting the seller terms is required.";
    }
    return null;
  };

  const goTo = (candidate: Step) => {
    if (candidate > step) {
      const problem = stepError(step);
      if (problem) {
        setErrMsg(problem);
        return;
      }
    }
    setErrMsg("");
    setStep(candidate);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 3) return goTo(3);

    for (const candidate of [1, 2, 3] as Step[]) {
      const problem = stepError(candidate);
      if (problem) {
        setStep(candidate);
        setErrMsg(problem);
        return;
      }
    }

    setState("loading");
    setErrMsg("");

    const result = await signup(values.name, values.email, values.password, "artist", {
      phone: values.phone,
      city: values.city,
      specialty: values.specialty,
      instagram: values.instagram,
      portfolioUrl: values.portfolioUrl,
      studioName: values.studioName,
      experience: values.experience,
      bio: values.bio,
      formats,
      families,
      terms: true,
    });

    if (!result.ok) {
      setState("error");
      const errorMap: Record<string, string> = {
        email_taken: fa ? "این ایمیل قبلاً ثبت شده است. وارد شوید یا ایمیل دیگری بزنید." : "This email is already registered.",
        missing_specialty: fa ? "حوزه‌ی فعالیت الزامی است." : "Field of practice is required.",
        terms_required: fa ? "پذیرش شرایط فروش الزامی است." : "Accepting the seller terms is required.",
        invalid: fa ? "اطلاعات وارد شده معتبر نیست." : "Please check your details.",
        network: fa ? "خطای شبکه. لطفاً دوباره تلاش کنید." : "Network error. Please try again.",
        server_error: fa ? "خطای سرور. لطفاً بعداً تلاش کنید." : "Server error. Please try again later.",
      };
      setErrMsg(errorMap[result.error ?? ""] ?? (fa ? "خطایی رخ داد." : "An error occurred."));
      return;
    }

    setState("ok");
    setTimeout(() => router.push(href(locale, "/artist")), 2600);
  };

  /* Already a seller — nothing to apply for. */
  if (user?.role === "artist" || user?.role === "admin") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <BadgeCheck className="mx-auto h-8 w-8 text-success" />
        <p className="mt-4 font-display text-h3">{fa ? "شما فروشنده‌ی رزی آتلیه هستید" : "You are already a Rosie Atelier seller"}</p>
        <p className="mt-2 text-caption text-foreground-secondary">
          {fa
            ? "داشبورد هنرمند، آثار، فروش، سهم شما و تسویه‌ها را نشان می‌دهد."
            : "Your dashboard shows works, sales, royalties and payouts."}
        </p>
        <Link
          href={href(locale, "/artist")}
          className="mt-6 inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm text-background"
        >
          {fa ? "رفتن به داشبورد هنرمند" : "Open the artist dashboard"}
        </Link>
      </div>
    );
  }

  if (state === "ok") {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
        <PartyPopper className="mx-auto h-8 w-8 text-success" />
        <p className="mt-4 font-display text-h3">{fa ? "درخواست شما ثبت شد" : "Your application is in"}</p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-start text-caption text-foreground-secondary">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa ? "حساب کاربری شما ساخته شد و همین حالا وارد شده‌اید." : "Your account exists and you are signed in."}
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {fa
              ? "پرونده‌ی هنرمندی با اطلاعات استودیو، فرمت‌ها و دسته‌های کاری شما برای مدیر ثبت شد."
              : "An artist record with your studio, formats and families went to the admin."}
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
    );
  }

  const busy = state === "loading";

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 sm:p-8" noValidate>
      {/* stepper */}
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((entry, index) => {
          const Icon = entry.icon;
          const active = step === entry.id;
          const done = step > entry.id;
          return (
            <li key={entry.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goTo(entry.id)}
                aria-current={active ? "step" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-caption transition ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : done
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-foreground-secondary hover:border-foreground/40"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="font-medium">
                  {fa ? `گام ${index + 1}` : `Step ${index + 1}`} · {entry.title}
                </span>
              </button>
              {index < steps.length - 1 && <span className="hidden h-px w-6 bg-border sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {/* step 1 — account */}
      <div style={{ display: step === 1 ? undefined : "none" }}>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Field label={fa ? "نام و نام خانوادگی" : "Full name"} className="sm:col-span-2">
            <Input name="name" required autoComplete="name" value={values.name} onChange={set("name")} />
          </Field>
          <Field label={fa ? "ایمیل" : "Email"} hint={fa ? "با همین ایمیل وارد می‌شوید." : "You sign in with this address."}>
            <Input name="email" type="email" required dir="ltr" autoComplete="email" value={values.email} onChange={set("email")} />
          </Field>
          <Field label={fa ? "شماره تماس" : "Phone"} hint={fa ? "برای هماهنگی بازبینی و تسویه." : "For review and payouts."}>
            <Input name="phone" type="tel" dir="ltr" autoComplete="tel" value={values.phone} onChange={set("phone")} />
          </Field>
          <Field label={fa ? "رمز عبور" : "Password"} hint={fa ? "حداقل ۶ کاراکتر." : "At least 6 characters."}>
            <Input
              name="password"
              type="password"
              required
              dir="ltr"
              minLength={6}
              autoComplete="new-password"
              value={values.password}
              onChange={set("password")}
            />
          </Field>
          <Field label={fa ? "تکرار رمز عبور" : "Confirm password"}>
            <Input
              name="confirm"
              type="password"
              required
              dir="ltr"
              minLength={6}
              autoComplete="new-password"
              value={values.confirm}
              onChange={set("confirm")}
            />
          </Field>
        </div>
      </div>

      {/* step 2 — studio & craft */}
      <div style={{ display: step === 2 ? undefined : "none" }}>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Field label={fa ? "حوزه‌ی فعالیت" : "Field of practice"}>
            <Select name="type" value={values.specialty} onChange={set("specialty")}>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={fa ? "نام استودیو یا برند" : "Studio / brand name"} hint={fa ? "اختیاری — روی پروفایل عمومی می‌آید." : "Optional — shown on your public profile."}>
            <Input name="studioName" value={values.studioName} onChange={set("studioName")} />
          </Field>
          <Field label={fa ? "شهر" : "City"}>
            <Input name="city" autoComplete="address-level2" required value={values.city} onChange={set("city")} />
          </Field>
          <Field label={fa ? "سابقه‌ی کار" : "Experience"}>
            <Select name="experience" value={values.experience} onChange={set("experience")}>
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
            <Textarea name="bio" rows={4} maxLength={400} value={values.bio} onChange={set("bio")} />
          </Field>
        </div>
      </div>

      {/* step 3 — work & terms */}
      <div style={{ display: step === 3 ? undefined : "none" }}>
        <div className="mt-7 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={fa ? "آیدی اینستاگرام" : "Instagram handle"} hint={fa ? "اختیاری" : "Optional"}>
              <Input name="instagram" dir="ltr" placeholder="@studio" value={values.instagram} onChange={set("instagram")} />
            </Field>
            <Field label={fa ? "لینک نمونه‌کار یا سایت" : "Portfolio / website"} hint={fa ? "اختیاری" : "Optional"}>
              <Input name="portfolio" type="url" dir="ltr" placeholder="https://" value={values.portfolioUrl} onChange={set("portfolioUrl")} />
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{fa ? "چه فرمت‌هایی تحویل می‌دهید؟" : "Which formats will you deliver?"}</legend>
            <p className="mt-1 text-caption text-foreground-secondary">
              {fa
                ? "همه‌ی این‌ها را بعداً هم می‌توانید اضافه کنید؛ همین حالا به ما می‌گوید چه انتظاری از فایل‌های شما داشته باشیم. PNG یا JPG الزامی است."
                : "You can add more later — this tells us what to expect. PNG or JPG is required."}
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
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-caption transition ${
                      active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                    {formatLabel(format.id, locale)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">{fa ? "روی چه دسته‌هایی کار می‌کنید؟" : "Which product families do you design for?"}</legend>
            <p className="mt-1 text-caption text-foreground-secondary">
              {fa ? "همان هشت دسته‌ی اصلی فروشگاه؛ می‌توانید چند مورد را انتخاب کنید." : "The eight shop categories — pick as many as you like."}
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
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-caption transition ${
                      active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                    {t(family.name, locale)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* live summary */}
          <div className="rounded-2xl border border-border bg-background-secondary p-5">
            <p className="text-label text-muted">{fa ? "خلاصه‌ی پرونده‌ی شما" : "Your application"}</p>
            <dl className="mt-3 grid gap-2 text-caption sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-secondary">{fa ? "نام" : "Name"}</dt>
                <dd className="font-medium">{values.name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-secondary">{fa ? "استودیو" : "Studio"}</dt>
                <dd className="font-medium">{values.studioName || values.name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-secondary">{fa ? "حوزه" : "Field"}</dt>
                <dd className="font-medium">{values.specialty || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-secondary">{fa ? "شهر" : "City"}</dt>
                <dd className="font-medium">{values.city || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 sm:col-span-2">
                <dt className="text-foreground-secondary">{fa ? "فرمت‌های تحویل" : "Delivery formats"}</dt>
                <dd className="font-medium" dir="ltr">
                  {formats.map((id) => formatLabel(id, locale)).join(" · ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 sm:col-span-2">
                <dt className="text-foreground-secondary">{fa ? "دسته‌ها" : "Families"}</dt>
                <dd className="font-medium">{families.map((id) => familyName(id, locale)).join(" · ") || "—"}</dd>
              </div>
            </dl>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-caption">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5"
              required
            />
            <span className="text-foreground-secondary">
              {fa
                ? "تأیید می‌کنم آثار ارسالی از خودم است یا حق فروش آن را دارم، و شرایط فروش، لایسنس و تسویه‌ی رزی آتلیه را می‌پذیرم."
                : "I confirm the works I submit are mine (or I hold the rights), and I accept the Rosie Atelier selling, licensing and payout terms."}
            </span>
          </label>
        </div>
      </div>

      {errMsg && (
        <p role="alert" className="mt-5 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {errMsg}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {step > 1 && (
          <Button type="button" variant="outline" size="lg" onClick={() => goTo((step - 1) as Step)} disabled={busy}>
            <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            {fa ? "گام قبل" : "Back"}
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" size="lg" onClick={() => goTo((step + 1) as Step)} disabled={busy}>
            {fa ? "گام بعد" : "Next step"}
            <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={busy || !terms} className="min-w-[220px]">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {fa ? "ثبت درخواست فروشندگی" : "Submit as a seller"}
          </Button>
        )}
        <p className="text-caption text-foreground-secondary">
          {fa ? "حساب دارید؟" : "Already have an account?"}{" "}
          <Link href={href(locale, "/login")} className="font-medium text-foreground underline-offset-4 hover:underline">
            {fa ? "ورود" : "Sign in"}
          </Link>
          {" · "}
          <Link href={href(locale, "/signup")} className="text-foreground-secondary underline-offset-4 hover:underline">
            {fa ? "ثبت‌نام خریدار" : "Buyer signup"}
          </Link>
        </p>
      </div>
    </form>
  );
}
