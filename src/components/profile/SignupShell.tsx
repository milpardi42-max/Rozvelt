"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { href } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/types";
import { AuthForm } from "./AuthForm";

interface SignupShellProps {
  locale: Locale;
  image: string;
  dict: { login: string; signup: string };
}

/**
 * Buyer registration shell.
 *
 * Buyers keep the short form they always had (name, e-mail, password). Selling
 * is a different door: the designer application at /creators/join collects the
 * studio, the delivery formats and the product families — so this page only
 * points at it instead of switching the account type here.
 */
export function SignupShell({ locale, image, dict }: SignupShellProps) {
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
          <h1 className="auth-card__form-title">{dict.signup}</h1>
          <AuthForm mode="signup" onSignupSuccess={handleSignupSuccess} />

          {/* sellers have their own, richer door */}
          <div className="mt-6 rounded-2xl border border-border bg-background-secondary p-4 text-start">
            <p className="text-caption font-medium">{fa ? "طراح یا فروشنده هستید؟" : "Are you a designer or seller?"}</p>
            <p className="mt-1 text-caption text-foreground-secondary">
              {fa
                ? "ثبت‌نام فروشندگان جداست: در یک فرم کوتاه، حساب کاربری و حوزه‌ی فعالیت شما ثبت می‌شود و اطلاعات استودیو و فرمت‌های تحویل اختیاری‌اند."
                : "Seller registration is separate: one short form for your account and field of practice — studio details and delivery formats are optional."}
            </p>
            <Link
              href={href(locale, "/creators/join")}
              className="mt-3 inline-flex h-9 items-center rounded-full border border-border px-4 text-caption font-medium transition hover:border-foreground"
            >
              {fa ? "ثبت‌نام هنرمند / فروشنده" : "Artist / seller signup"}
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
