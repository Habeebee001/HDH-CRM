import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useDataProvider, useLogin, useNotify, useTranslate } from "ra-core";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CrmDataProvider } from "../providers/types";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { SignUpData } from "../types";
import { LoginSkeleton } from "./LoginSkeleton";
import { Notification } from "@/components/admin/notification";
import { ConfirmationRequired } from "./ConfirmationRequired";
import { SSOAuthButton } from "./SSOAuthButton";
import { googleWorkplaceDomain } from "./authConfig";
import { BrandPanel } from "./BrandPanel";

export const SignupPage = () => {
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { darkModeLogo: logo, title } = useConfigurationContext();
  const navigate = useNavigate();
  const translate = useTranslate();
  const { data: isInitialized, isPending } = useQuery({
    queryKey: ["init"],
    queryFn: async () => {
      return dataProvider.isInitialized();
    },
  });

  const { isPending: isSignUpPending, mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SignUpData) => {
      return dataProvider.signUp(data);
    },
    onSuccess: (data) => {
      login({
        email: data.email,
        password: data.password,
        redirectTo: "/contacts",
      })
        .then(() => {
          notify("crm.auth.signup.initial_user_created", {
            messageArgs: {
              _: "Initial user successfully created",
            },
          });
          // FIXME: We should probably provide a hook for that in the ra-core package
          queryClient.invalidateQueries({
            queryKey: ["auth", "canAccess"],
          });
        })
        .catch((err) => {
          if (err.code === "email_not_confirmed") {
            // An email confirmation is required to continue.
            navigate(ConfirmationRequired.path);
          } else {
            notify("crm.auth.sign_in_failed", {
              type: "error",
              messageArgs: {
                _: "Failed to log in.",
              },
            });
            navigate("/login");
          }
        });
    },
    onError: (error) => {
      notify(error.message);
    },
  });

  const login = useLogin();
  const notify = useNotify();

  const {
    register,
    handleSubmit,
    formState: { isValid },
  } = useForm<SignUpData>({
    mode: "onChange",
  });

  if (isPending) {
    return <LoginSkeleton />;
  }

  // For the moment, we only allow one user to sign up. Other users must be created by the administrator.
  if (isInitialized) {
    return <Navigate to="/login" />;
  }

  const onSubmit: SubmitHandler<SignUpData> = async (data) => {
    mutate(data);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="relative grid w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel />
        <div className="max-w-sm w-full mx-auto flex flex-col justify-center gap-4 px-6 py-12">
          <img
            src={logo}
            alt={title}
            className="h-16 w-auto self-center mb-2 lg:hidden filter brightness-0 dark:invert"
          />
          <p className="eyebrow">
            {translate("crm.auth.signup.eyebrow", { _: "First-time setup" })}
          </p>
          <h1 className="font-display text-3xl leading-tight mb-2">
            {translate("crm.auth.welcome_title", {
              _: "Welcome to HDH CRM",
            })}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            {translate("crm.auth.signup.create_first_user", {
              _: "Create the first user account to complete the setup.",
            })}
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">
                {translate("crm.auth.first_name")}
              </Label>
              <Input
                {...register("first_name", { required: true })}
                id="first_name"
                type="text"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">
                {translate("crm.auth.last_name")}
              </Label>
              <Input
                {...register("last_name", { required: true })}
                id="last_name"
                type="text"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{translate("ra.auth.email")}</Label>
              <Input
                {...register("email", { required: true })}
                id="email"
                type="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{translate("ra.auth.password")}</Label>
              <Input
                {...register("password", { required: true })}
                id="password"
                type="password"
                required
              />
            </div>
            <div className="flex flex-col gap-4 justify-between items-center mt-8">
              <Button
                type="submit"
                disabled={!isValid || isSignUpPending}
                className="w-full"
              >
                {isSignUpPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {translate("crm.auth.signup.creating", {
                      _: "Creating...",
                    })}
                  </>
                ) : (
                  translate("crm.auth.signup.create_account", {
                    _: "Create account",
                  })
                )}
              </Button>
              {googleWorkplaceDomain ? (
                <SSOAuthButton
                  className="w-full"
                  domain={googleWorkplaceDomain}
                >
                  {translate("crm.auth.sign_in_google_workspace", {
                    _: "Sign in with Google Workplace",
                  })}
                </SSOAuthButton>
              ) : null}
            </div>
          </form>
        </div>
      </div>
      <Notification />
    </div>
  );
};

SignupPage.path = "/sign-up";
