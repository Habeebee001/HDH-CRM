import { useGetList, useTimeout } from "ra-core";
import { Skeleton } from "@/components/ui/skeleton";

import type { Contact, ContactNote } from "../types";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardStepper } from "./DashboardStepper";
import { Welcome } from "./Welcome";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { config } from "../root/config";
import { splitBrandTitle } from "../misc/brand";

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const { darkModeLogo, title } = useConfigurationContext();
  const { brand, suffix } = splitBrandTitle(title);
  return (
    <>
      <MobileHeader>
        {/* The mobile header is always ink-dark, so use the light logo. */}
        <div className="flex items-center gap-2.5 text-foreground no-underline py-3">
          <img className="h-8 w-auto" src={darkModeLogo} alt={title} />
          <h1 className="flex items-baseline gap-2 leading-none">
            <span className="font-display text-xl tracking-[0.04em]">
              {brand}
            </span>
            {suffix ? (
              <span className="eyebrow text-[0.55rem] tracking-[0.4em]">
                {suffix}
              </span>
            ) : null}
          </h1>
        </div>
      </MobileHeader>
      <MobileContent>{children}</MobileContent>
    </>
  );
};

const Loading = () => (
  <Wrapper>
    <Skeleton className="h-4 w-3/4 mb-4" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
  </Wrapper>
);

export const MobileDashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });
  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });
  const oneSecondHasPassed = useTimeout(1000);

  const isPending = isPendingContact || isPendingContactNotes;

  if (isPending) {
    return oneSecondHasPassed ? <Loading /> : null;
  }

  if (!totalContact) {
    return (
      <Wrapper>
        <DashboardStepper step={1} />
      </Wrapper>
    );
  }

  if (!totalContactNotes) {
    return (
      <Wrapper>
        <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-1">
        {config.isDemo ? <Welcome /> : null}
        <DashboardActivityLog />
      </div>
    </Wrapper>
  );
};
