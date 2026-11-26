import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";

/**
 * Shown on the dashboard of the demo (FakeRest) build only.
 */
export const Welcome = () => {
  const { title } = useConfigurationContext();
  const translate = useTranslate();
  return (
    <Card className="dark relative overflow-hidden bg-header text-foreground ring-white/[0.06]">
      <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_28%,transparent),transparent_70%)]" />
      <CardHeader className="relative px-5">
        <p className="eyebrow">
          {translate("crm.dashboard.demo.eyebrow", { _: "Preview workspace" })}
        </p>
        <CardTitle className="font-display mt-1 text-xl">
          {translate("crm.dashboard.demo.title", {
            _: "Welcome to %{title}",
            title,
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-3 px-5 text-sm text-muted-foreground">
        <p>
          {translate("crm.dashboard.demo.body_1", {
            _: "You are exploring a live preview filled with sample clients, companies and deals.",
          })}
        </p>
        <p>
          {translate("crm.dashboard.demo.body_2", {
            _: "Click around and edit anything: the sample data resets every time you reload.",
          })}
        </p>
      </CardContent>
    </Card>
  );
};
