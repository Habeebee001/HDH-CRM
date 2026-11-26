import { Check, Copy, MessageCircle, X } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { useTranslate } from "ra-core";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getPendingInvite,
  setPendingInvite,
  subscribeToPendingInvite,
} from "./pendingInvite";

/**
 * One-time sign-in links (invitations, password resets) that an administrator
 * can copy or share, e.g. when the server has no email set up.
 */

const LinkField = ({ link }: { link: string }) => {
  const translate = useTranslate();
  const id = useId();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API unavailable (e.g. plain http): select the text instead.
      const input = document.getElementById(id) as HTMLInputElement | null;
      input?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={translate("crm.share_link.label", { _: "Link" })}
        className="font-mono text-xs"
      />
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        className="shrink-0"
      >
        {copied ? <Check className="text-brand" /> : <Copy />}
        {copied
          ? translate("crm.share_link.copied", { _: "Copied" })
          : translate("crm.share_link.copy", { _: "Copy" })}
      </Button>
    </div>
  );
};

const WhatsAppButton = ({
  link,
  message,
}: {
  link: string;
  message: string;
}) => {
  const translate = useTranslate();
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}`}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      <MessageCircle />
      {translate("crm.share_link.whatsapp", { _: "Share on WhatsApp" })}
    </a>
  );
};

const SingleUseHint = () => {
  const translate = useTranslate();
  return (
    <p className="text-xs text-muted-foreground">
      {translate("crm.share_link.single_use", {
        _: "The link works once. Anyone who has it can set the password, so send it privately.",
      })}
    </p>
  );
};

export const ShareLinkDialog = ({
  open,
  onClose,
  title,
  description,
  link,
  shareMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  link: string;
  shareMessage: string;
}) => {
  const translate = useTranslate();
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <p className="eyebrow">
            {translate("crm.share_link.eyebrow", { _: "One-time link" })}
          </p>
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <LinkField link={link} />
        <SingleUseHint />
        <DialogFooter>
          <WhatsAppButton link={link} message={shareMessage} />
          <Button type="button" onClick={onClose}>
            {translate("crm.share_link.done", { _: "Done" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Invitation created without email: shown on top of the Users list --------

export const PendingInvitePanel = () => {
  const translate = useTranslate();
  const invite = useSyncExternalStore(
    subscribeToPendingInvite,
    getPendingInvite,
  );
  if (!invite) return null;
  return (
    <section
      aria-label={translate("resources.sales.invite.label", {
        _: "Invitation link",
      })}
      className="relative mb-4 rounded-xl border border-brand/40 bg-brand-soft p-5"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2"
        onClick={() => setPendingInvite(null)}
        aria-label={translate("ra.action.close", { _: "Close" })}
      >
        <X />
      </Button>
      <p className="eyebrow">
        {translate("crm.share_link.eyebrow", { _: "One-time link" })}
      </p>
      <h3 className="font-display text-xl text-foreground mt-1">
        {translate("resources.sales.invite.title", {
          name: invite.name,
          _: "Invite %{name}",
        })}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 mb-3 pr-8">
        {translate("resources.sales.invite.description", {
          _: "Email is not set up, so send them this link to choose their password and sign in.",
        })}
      </p>
      <LinkField link={invite.link} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <SingleUseHint />
        <WhatsAppButton
          link={invite.link}
          message={translate("resources.sales.invite.message", {
            _: "You're invited to HDH CRM. Choose your password here:",
          })}
        />
      </div>
    </section>
  );
};
