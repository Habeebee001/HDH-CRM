import { useEffect, useRef, useState } from "react";
import { Form, required, useLogin, useNotify, useTranslate } from "ra-core";
import type { SubmitHandler, FieldValues } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { Notification } from "@/components/admin/notification";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext.tsx";
import { SSOAuthButton } from "./SSOAuthButton";
import { BrandPanel } from "./BrandPanel";
import {
  disableEmailPasswordAuthentication,
  googleWorkplaceDomain,
} from "./authConfig";

/**
 * Login page displayed when authentication is enabled and the user is not authenticated.
 *
 * Automatically shown when an unauthenticated user tries to access a protected route.
 * Handles login via authProvider.login() and displays error notifications on failure.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/loginpage LoginPage documentation}
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/security Security documentation}
 */
export const LoginPage = (props: { redirectTo?: string }) => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const { redirectTo } = props;
  const [loading, setLoading] = useState(false);
  const hasDisplayedRecoveryNotification = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldNotify = searchParams.get("passwordRecoveryEmailSent") === "1";

    if (!shouldNotify || hasDisplayedRecoveryNotification.current) {
      return;
    }

    hasDisplayedRecoveryNotification.current = true;
    notify("crm.auth.recovery_email_sent", {
      type: "success",
      messageArgs: {
        _: "If you're a registered user, you should receive a password recovery email shortly.",
      },
    });

    searchParams.delete("passwordRecoveryEmailSent");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, notify]);

  const handleSubmit: SubmitHandler<FieldValues> = (values) => {
    setLoading(true);
    login(values, redirectTo)
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === "string"
            ? error
            : typeof error === "undefined" || !error.message
              ? "ra.auth.sign_in_error"
              : error.message,
          {
            type: "error",
            messageArgs: {
              _:
                typeof error === "string"
                  ? error
                  : error && error.message
                    ? error.message
                    : undefined,
            },
          },
        );
      });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="relative grid w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel />
        <div className="flex flex-col justify-center w-full px-6 py-12 lg:px-12">
          <div className="w-full space-y-8 sm:mx-auto sm:w-[380px]">
            <div className="flex justify-center lg:hidden">
              <img
                className="h-20 w-auto dark:hidden"
                src={lightModeLogo}
                alt={title}
              />
              <img
                className="h-20 w-auto hidden dark:block"
                src={darkModeLogo}
                alt={title}
              />
            </div>
            <div className="space-y-3 text-center lg:text-left">
              <p className="eyebrow">
                {translate("crm.auth.welcome_back", { _: "Welcome back" })}
              </p>
              <h1 className="font-display text-4xl leading-tight">
                {translate("ra.auth.sign_in")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {translate("crm.auth.sign_in_subtitle", {
                  _: "Sign in to continue to %{title}.",
                  title,
                })}
              </p>
            </div>
            {disableEmailPasswordAuthentication ? null : (
              <Form className="space-y-6" onSubmit={handleSubmit}>
                <TextInput
                  label="ra.auth.email"
                  source="email"
                  type="email"
                  validate={required()}
                />
                <TextInput
                  label="ra.auth.password"
                  source="password"
                  type="password"
                  validate={required()}
                />
                <div className="flex flex-col gap-4 pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    className="cursor-pointer h-11 tracking-wide"
                    disabled={loading}
                  >
                    {translate("ra.auth.sign_in")}
                  </Button>
                </div>
              </Form>
            )}
            {googleWorkplaceDomain ? (
              <SSOAuthButton className="w-full" domain={googleWorkplaceDomain}>
                {translate("crm.auth.sign_in_google_workspace", {
                  _: "Sign in with Google Workplace",
                })}
              </SSOAuthButton>
            ) : null}
            {disableEmailPasswordAuthentication ? null : (
              <Link
                to={"/forgot-password"}
                className="block text-sm text-center text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
              >
                {translate("ra-supabase.auth.forgot_password", {
                  _: "Forgot password?",
                })}
              </Link>
            )}
          </div>
        </div>
      </div>
      <Notification />
    </div>
  );
};
