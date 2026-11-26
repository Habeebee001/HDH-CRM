import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { splitBrandTitle } from "../misc/brand";
// Fine cut of the monogram: elegant at large sizes.
import heroLogo from "../root/logos/hdh_logo_ivory.svg";

/**
 * Ink-dark brand panel shown next to the auth forms on large screens.
 */
export const BrandPanel = () => {
  const { darkModeLogo, title } = useConfigurationContext();
  const translate = useTranslate();
  const { brand, suffix } = splitBrandTitle(title);
  const year = new Date().getFullYear();

  return (
    <div className="dark relative hidden lg:flex flex-col justify-between overflow-hidden bg-header p-12 text-foreground">
      {/* soft champagne glows */}
      <div className="pointer-events-none absolute -right-48 -top-48 size-[40rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-56 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_12%,transparent),transparent_70%)]" />
      {/* hairline frame */}
      <div className="pointer-events-none absolute inset-6 rounded-2xl border border-white/[0.06]" />

      <div className="relative flex items-center gap-3">
        <img className="h-8 w-auto" src={darkModeLogo} alt="" />
        <span className="font-display text-xl tracking-[0.04em]">{brand}</span>
        {suffix ? (
          <span className="eyebrow text-[0.58rem] tracking-[0.42em]">
            {suffix}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-col items-center text-center">
        <div className="relative flex items-center justify-center">
          <div className="pointer-events-none absolute size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_13%,transparent),transparent_68%)]" />
          <img src={heroLogo} alt={title} className="relative h-60 w-auto" />
        </div>
        <div className="mt-10 h-px w-16 bg-brand/60" />
        <p className="font-display mt-8 text-4xl leading-tight">
          {translate("crm.auth.tagline_line_1", {
            _: "Every relationship,",
          })}
          <br />
          <em className="text-brand">
            {translate("crm.auth.tagline_line_2", {
              _: "beautifully kept.",
            })}
          </em>
        </p>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          {translate("crm.auth.tagline_body", {
            _: "Your clients, deals and follow-ups, together in one refined workspace.",
          })}
        </p>
      </div>

      <div className="relative flex justify-between text-xs text-muted-foreground">
        <span>
          © {year} {brand}
        </span>
        <span className="tracking-[0.2em] uppercase">
          {translate("crm.auth.private_workspace", { _: "Private workspace" })}
        </span>
      </div>
    </div>
  );
};
