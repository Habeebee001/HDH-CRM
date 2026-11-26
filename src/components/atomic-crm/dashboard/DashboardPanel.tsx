import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Glass panel of the dashboard: title inside, like the reference designs */
export const DashboardPanel = ({
  title,
  eyebrow,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) => (
  <section className={cn("glass-card rounded-2xl", className)}>
    <header className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-4">
      {Icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon className="size-[1.05rem]" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="eyebrow text-[0.6rem]">{eyebrow}</p> : null}
        <h2 className="font-display text-xl leading-tight">{title}</h2>
      </div>
      {action}
    </header>
    <div className={cn("p-5", bodyClassName)}>{children}</div>
  </section>
);
