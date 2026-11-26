import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ScrollRestoration } from "react-router";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { WorkspaceProvider } from "../workspaces/WorkspaceContext";
import { WorkspaceGate } from "../workspaces/WorkspaceGate";
import { MobileNavigation } from "./MobileNavigation";
import { PullToRefresh } from "./PullToRefresh";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <WorkspaceProvider>
      <DataImportProvider>
        <ScrollRestoration />
        <PullToRefresh />
        <ErrorBoundary FallbackComponent={Error}>
          <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
            <WorkspaceGate>{children}</WorkspaceGate>
          </Suspense>
        </ErrorBoundary>
        <MobileNavigation />
        <Notification mobileOffset={{ bottom: "72px" }} />
      </DataImportProvider>
    </WorkspaceProvider>
  );
};
