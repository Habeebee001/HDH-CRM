import { Notification } from "@/components/admin/notification";
import { MailCheck } from "lucide-react";
import { useTranslate } from "ra-core";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { BrandPanel } from "./BrandPanel";

export const ConfirmationRequired = () => {
  const translate = useTranslate();
  const { darkModeLogo: logo, title } = useConfigurationContext();

  return (
    <div className="min-h-screen flex bg-background">
      <div className="relative grid w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel />
        <div className="max-w-sm w-full mx-auto flex flex-col justify-center items-center gap-4 px-6 py-12 text-center">
          <img
            src={logo}
            alt={title}
            className="h-16 w-auto mb-2 lg:hidden filter brightness-0 dark:invert"
          />
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
            <MailCheck className="size-6" />
          </div>
          <h1 className="font-display text-3xl leading-tight">
            {translate("crm.auth.welcome_title", {
              _: "Welcome to HDH CRM",
            })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate("crm.auth.confirmation_required", {
              _: "Please follow the link we just sent you by email to confirm your account.",
            })}
          </p>
        </div>
      </div>
      <Notification />
    </div>
  );
};

ConfirmationRequired.path = "/sign-up/confirm";
