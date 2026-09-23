"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { href } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/types";
import { SignupForm, type AccountRole } from "./SignupForm";
import { AccountTypeSwitch } from "./AccountTypeSwitch";

interface SignupShellProps {
  locale: Locale;
  image: string;
  dict: { login: string; signup: string };
  /** Heading in the form panel (defaults to the signup label) */
  title?: string;
  /** Renders the account-type switch above the form — /signup/buyer uses this */
  switchCurrent?: "buyer" | "artist";
  /** Which half of the shared form opens first (buyers here, artists on /signup/artist) */
  initialRole?: AccountRole;
  /** Field-of-practice choices for the seller half of the form */
  options: string[];
  /** Artist revenue share quoted on the seller card inside the form */
  sharePct: number;
}

/**
 * Registration shell — the auth card shared by /signup and /signup/buyer.
 *
 * Both pages carry the *same* registration form (SignupForm): the account type
 * is picked inside it, so a buyer and a designer really do share one form. The
 * shell only provides the card, the transition to the login page and the
 * pointer to the seller page — the buyer page additionally shows the
 * account-type switch. The designer half has its own page (/signup/artist)
 * because its content is the whole sell-side story.
 */
export function SignupShell({
  locale,
  image,
  dict,
  title,
  switchCurrent,
  initialRole = "buyer",
  options,
  sharePct,
}: SignupShellProps) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<"manual" | "signup" | null>(null);
  const [isEntering, setIsEntering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fa = locale === "fa";

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsEntering(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const goToLogin = () => {
    if (leaving) return;
    setLeaving("manual");
    timerRef.current = setTimeout(() => router.push(href(locale, "/login")), 650);
  };

  const handleSignupSuccess = (email: string, password: string) => {
    if (leaving) return;
    setLeaving("signup");
    // Encode credentials briefly in URL for the login page to auto-submit.
    // They're base64-encoded, not encrypted — cleared from URL immediately on arrival.
    const token = btoa(JSON.stringify({ e: email, p: password }));
    timerRef.current = setTimeout(
      () => router.push(href(locale, `/login?_t=${encodeURIComponent(token)}`)),
      750,
    );
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const isLeaving = leaving !== null;

  return (
    <section className="auth-shell-page">
      <div
        className={[
          "auth-card",
          "auth-card--signup",
          isLeaving ? "auth-card--to-login" : "",
          isEntering ? "auth-card--entered" : "",
        ].filter(Boolean).join(" ")}
        dir="ltr"
      >
        {/* animated diagonal background */}
        <div className="auth-card__bg auth-card__bg--signup">
          <Image src={image} alt="" fill sizes="340px" className="object-cover" priority />
          <div className="auth-card__bg-overlay" />
        </div>
        <div className="auth-card__bg auth-card__bg--signup-2" />

        {/* hero panel: sits on top of the right image, prompts to log in */}
        <div className="auth-card__hero auth-card__hero--signup">
          <Logo className="auth-card__hero-logo" />
          <h2>{fa ? "قبلاً ثبت‌نام کردید؟" : "Already a member?"}</h2>
          <p>{fa ? "وارد شوید و به حساب خود دسترسی داشته باشید." : "Sign in to access your account and collection."}</p>
          <button type="button" onClick={goToLogin} className="auth-card__hero-btn">
            {dict.login}
          </button>
        </div>

        {/* form panel: left side — restore locale dir for text content */}
        <div className="auth-card__form auth-card__form--signup" dir={fa ? "rtl" : "ltr"}>
          <Logo className="auth-card__form-logo" />
          <h1 className="auth-card__form-title">{title ?? dict.signup}</h1>

          {switchCurrent && <AccountTypeSwitch current={switchCurrent} className="mb-6" />}

          <SignupForm
            initialRole={initialRole}
            options={options}
            sharePct={sharePct}
            onSignupSuccess={handleSignupSuccess}
          />

          {/* the seller page holds the sell-side story — this is the way there */}
          <div className="mt-6 rounded-2xl border border-border bg-background-secondary p-4 text-start">
            <p className="text-caption font-medium">{fa ? "طراح یا فروشنده هستید؟" : "Are you a designer or seller?"}</p>
            <p className="mt-1 text-caption text-foreground-secondary">
              {fa
                ? "همین فرم بالا با انتخاب «هنرمند / طراح» اطلاعات فروشندگی را هم می‌پرسد. توضیح کامل فروش، فرمت‌های تحویل، سهم و تسویه در صفحه‌ی هنرمند / طراح است."
                : "Picking “Artist / Designer” in the form above asks for the seller details too. The full story — formats, share, payouts — lives on the artist page."}
            </p>
            <Link
              href={href(locale, "/signup/artist")}
              className="mt-3 inline-flex h-9 items-center rounded-full border border-border px-4 text-caption font-medium transition hover:border-foreground"
            >
              {fa ? "صفحه‌ی هنرمند / طراح" : "Artist / designer page"}
            </Link>
          </div>
        </div>
      </div>

      {/* cinematic overlay shown during signup→login transition */}
      {leaving === "signup" && (
        <div className="auth-transition-overlay" aria-hidden>
          <div className="auth-transition-ring" />
          <p className="auth-transition-label">
            {fa ? "در حال ورود…" : "Signing you in…"}
          </p>
        </div>
      )}
    </section>
  );
}
