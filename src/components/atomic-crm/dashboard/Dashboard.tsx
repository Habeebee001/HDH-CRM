import { useGetList } from "ra-core";

import { config } from "../root/config";
import type { Contact, ContactNote } from "../types";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardStepper } from "./DashboardStepper";
import { HotContacts } from "./HotContacts";
import { KpiCards } from "./KpiCards";
import { LatestDeals } from "./LatestDeals";
import { PipelineDonut } from "./PipelineDonut";
import { RevenueAnalytics } from "./RevenueAnalytics";
import { TasksList } from "./TasksList";
import { TopPerformers } from "./TopPerformers";
import { Welcome } from "./Welcome";

export const Dashboard = () => {
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

  const { total: totalDeal, isPending: isPendingDeal } = useGetList<Contact>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
    },
  );

  const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  // After the CRMi reference: headline cards with rings, revenue analytics
  // with this day / week tiles, a pipeline donut, the latest deals with their
  // stage as pills (after the CRM Overview reference), tasks and activity.
  return (
    <>
      <DashboardHeader />
      <KpiCards />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
          {config.isDemo ? <Welcome /> : null}
          {totalDeal ? <RevenueAnalytics /> : null}
          {totalDeal ? <LatestDeals /> : null}
          <DashboardActivityLog />
        </div>
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
          {totalDeal ? <PipelineDonut /> : null}
          <TasksList />
          <HotContacts />
          {totalDeal ? <TopPerformers /> : null}
        </div>
      </div>
    </>
  );
};
