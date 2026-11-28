import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react";
import { CanAccess, Navigate, useDataProvider, useNotify } from "ra-core";
import { Button } from "@/components/ui/button";

import { DashboardPanel } from "../dashboard/DashboardPanel";
import type { CrmDataProvider } from "../providers/types";

/**
 * The weekly summary email (administrators): when it goes out, to whom,
 * whether email is set up, a preview, and buttons to send it now.
 */
export const WeeklySummaryPage = () => (
  <CanAccess resource="sales" action="list" accessDenied={<Navigate to="/" />}>
    <WeeklySummaryContent />
  </CanAccess>
);

WeeklySummaryPage.path = "/weekly-summary";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));

const WeeklySummaryContent = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["weekly-summary"],
    queryFn: () => dataProvider.getWeeklySummary(),
  });
  const send = useMutation({
    mutationFn: (toMe: boolean) => dataProvider.sendWeeklySummary(toMe),
    onSuccess: (result) => {
      if (!result.email_configured) {
        notify(
          "Email is not set up yet: add the Brevo key first.",
          { type: "warning" },
        );
      } else if (result.sent) {
        notify(`Weekly summary sent to ${result.recipients.join(", ")}`, {
          type: "success",
        });
      } else {
        notify("The email could not be sent. Check the Brevo key and the sender address.", {
          type: "error",
        });
      }
      refetch();
    },
    onError: (err: Error) => notify(err.message, { type: "error" }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7">
        <p className="eyebrow">Reports</p>
        <h1 className="font-display mt-2 text-4xl leading-tight">
          Weekly summary email
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every Monday morning the CRM emails a summary of the past week:
          revenue won, new deals and contacts, the open pipeline, the biggest
          deals and what each workspace did. Amounts are in US dollars.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Could not load the weekly summary: {(error as Error).message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <InfoTile
          icon={CalendarClock}
          label="Next summary"
          value={data ? dateTime(data.next_send) : "…"}
          detail={data?.schedule}
        />
        <InfoTile
          icon={Users}
          label="Sent to"
          value={data ? data.recipients.join(", ") || "Nobody yet" : "…"}
          detail="The CRM owner"
        />
        <InfoTile
          icon={data?.email_configured ? CheckCircle2 : TriangleAlert}
          label="Email"
          value={
            data
              ? data.email_configured
                ? "Ready"
                : "Not set up yet"
              : "…"
          }
          detail={
            data?.last_sent
              ? `Last sent ${dateTime(data.last_sent.sent_at)}`
              : "Not sent yet"
          }
          warning={data ? !data.email_configured : false}
        />
      </div>

      {data && !data.email_configured ? (
        <div className="glass-card mt-5 rounded-2xl border-l-4 border-l-brand p-5 text-sm">
          <p className="font-medium">To start receiving the summary</p>
          <p className="mt-1 text-muted-foreground">
            The CRM sends email through Brevo (free). Once the Brevo API key is
            added to the server settings, the summary goes out every Monday at
            08:00, and account requests, invitations and password resets are
            emailed too.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          onClick={() => send.mutate(true)}
          disabled={send.isPending || isPending}
        >
          {send.isPending && send.variables === true ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          Send me a test
        </Button>
        <Button
          variant="outline"
          onClick={() => send.mutate(false)}
          disabled={send.isPending || isPending}
        >
          {send.isPending && send.variables === false ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send to everyone now
        </Button>
      </div>

      <DashboardPanel
        title="Preview"
        eyebrow={data?.subject ?? "Loading…"}
        icon={Mail}
        className="mt-6"
        bodyClassName="p-0"
      >
        {data ? (
          <iframe
            title="Weekly summary preview"
            srcDoc={data.html}
            sandbox=""
            className="h-[900px] w-full rounded-b-2xl bg-white"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Preparing the
            preview…
          </div>
        )}
      </DashboardPanel>
    </div>
  );
};

const InfoTile = ({
  icon: Icon,
  label,
  value,
  detail,
  warning,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  detail?: string;
  warning?: boolean;
}) => (
  <div className="glass-card rounded-2xl p-5">
    <span
      className={
        warning
          ? "mb-3 flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
          : "mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand"
      }
    >
      <Icon className="size-5" />
    </span>
    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words font-medium">{value}</p>
    {detail ? (
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    ) : null}
  </div>
);
