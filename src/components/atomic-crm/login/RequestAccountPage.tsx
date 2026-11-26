import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useDataProvider, useTranslate } from "ra-core";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Link, Navigate } from "react-router";
import { Notification } from "@/components/admin/notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CrmDataProvider } from "../providers/types";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { SignUpData } from "../types";
import { BrandPanel } from "./BrandPanel";
import { LoginSkeleton } from "./LoginSkeleton";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Public page where new team members ask for an account. The account stays
 * locked until an administrator approves it and chooses its role and
 * workspaces (Users page).
 */
export const RequestAccountPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { lightModeLogo, darkModeLogo, title } = useConfigurationContext();
  const translate = useTranslate();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: isInitialized, isPending } = useQuery({
    queryKey: ["init"],
    queryFn: () => dataProvider.isInitialized(),
  });

  const { isPending: isSending, mutate } = useMutation({
    mutationKey: ["request-account"],
    mutationFn: (data: SignUpData) => dataProvider.signUp(data),
    onSuccess: (data) => setSentTo(data.email),
    onError: (err: Error) => setError(err.message),
  });

  const {
    register,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<SignUpData>({ mode: "onChange" });

  if (isPending) return <LoginSkeleton />;
  // Before the first account exists, the owner sets the CRM up instead
  if (!isInitialized) return <Navigate to="/sign-up" />;

  const onSubmit: SubmitHandler<SignUpData> = (data) => {
    setError(null);
    mutate({ ...data, email: data.email.trim() });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="relative grid w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel />
        <div className="max-w-sm w-full mx-auto flex flex-col justify-center gap-4 px-6 py-12">
          <div className="flex justify-center lg:hidden mb-2">
            <img className="h-16 w-auto dark:hidden" src={lightModeLogo} alt={title} />
            <img className="h-16 w-auto hidden dark:block" src={darkModeLogo} alt={title} />
          </div>
          {sentTo ? (
            <div className="space-y-4" data-testid="request-sent">
              <CheckCircle2 className="size-10 text-brand" />
              <p className="eyebrow">
                {translate("crm.auth.request.sent_eyebrow", { _: "Request sent" })}
              </p>
              <h1 className="font-display text-3xl leading-tight">
                {translate("crm.auth.request.sent_title", { _: "Thank you!" })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {translate("crm.auth.request.sent_body", {
                  _: "An administrator will review your request for %{email}. You will receive an email as soon as your account is approved, then you can sign in with the password you chose.",
                  email: sentTo,
                })}
              </p>
              <Button
                variant="outline"
                className="w-full"
                nativeButton={false}
                render={<Link to="/login" />}
              >
                {translate("crm.auth.request.back_to_sign_in", { _: "Back to sign in" })}
              </Button>
            </div>
          ) : (
            <>
              <p className="eyebrow">
                {translate("crm.auth.request.eyebrow", { _: "Join the team" })}
              </p>
              <h1 className="font-display text-3xl leading-tight">
                {translate("crm.auth.request.title", { _: "Create your account" })}
              </h1>
              <p className="text-sm text-muted-foreground mb-2">
                {translate("crm.auth.request.subtitle", {
                  _: "Fill in your details. An administrator approves new accounts before they can open %{title}.",
                  title,
                })}
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="first_name">{translate("crm.auth.first_name")}</Label>
                    <Input
                      {...register("first_name", { required: true })}
                      id="first_name"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="last_name">{translate("crm.auth.last_name")}</Label>
                    <Input
                      {...register("last_name", { required: true })}
                      id="last_name"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">{translate("ra.auth.email")}</Label>
                  <Input
                    {...register("email", { required: true })}
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">{translate("ra.auth.password")}</Label>
                  <Input
                    {...register("password", {
                      required: true,
                      minLength: MIN_PASSWORD_LENGTH,
                    })}
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                  <p
                    className={
                      errors.password
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {translate("crm.auth.request.password_hint", {
                      _: "At least %{count} characters.",
                      count: MIN_PASSWORD_LENGTH,
                    })}
                  </p>
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  disabled={!isValid || isSending}
                  className="w-full h-11"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {translate("crm.auth.request.sending", { _: "Sending…" })}
                    </>
                  ) : (
                    translate("crm.auth.request.submit", { _: "Request my account" })
                  )}
                </Button>
              </form>
              <p className="text-sm text-center text-muted-foreground">
                {translate("crm.auth.request.have_account", { _: "Already have an account?" })}{" "}
                <Link
                  to="/login"
                  className="text-foreground underline underline-offset-4 hover:text-brand"
                >
                  {translate("ra.auth.sign_in")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
      <Notification />
    </div>
  );
};

RequestAccountPage.path = "/request-account";
