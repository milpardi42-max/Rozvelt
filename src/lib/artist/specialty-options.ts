import type { Locale } from "@/lib/i18n/types";

/**
 * Field-of-practice choices offered on the seller half of the registration form.
 *
 * The registration form is one component used on /signup, /signup/buyer and
 * /signup/artist, so the choices live here instead of on a single page.
 */
export function specialtyOptions(locale: Locale): string[] {
  return locale === "fa"
    ? ["طراح سطح", "تصویرگر", "طراح گرافیک", "هنرمند سنتی", "استودیو"]
    : ["Surface designer", "Illustrator", "Graphic designer", "Traditional artist", "Studio"];
}
