import type { Metadata } from "next";
import { SignupShell } from "@/components/profile/SignupShell";
import { AccountTypeChooser } from "@/components/profile/AccountTypeChooser";
import { getSite } from "@/lib/data/queries";
import { DEFAULT_ARTIST_SHARE_PCT } from "@/lib/marketplace/config";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: dictionaries[locale].nav.signup };
}

/**
 * Registration chooser — the fork of the signup flow.
 *
 * The visitor picks the kind of account here and lands on that type's own page:
 * /signup/buyer or /signup/artist. Each page carries its own content, its own
 * form and the account-type switch back to the other one.
 */
export default async function SignupPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const d = dictionaries[locale];
  const site = await getSite();
  const image = site.portfolios[2]?.cover ?? site.hero.image;

  return (
    <SignupShell
      locale={locale}
      image={image}
      dict={{ login: d.nav.login, signup: d.nav.signup }}
      title={locale === "fa" ? "ثبت‌نام — نوع حساب" : "Sign up — account type"}
    >
      <AccountTypeChooser sharePct={DEFAULT_ARTIST_SHARE_PCT} />
    </SignupShell>
  );
}
