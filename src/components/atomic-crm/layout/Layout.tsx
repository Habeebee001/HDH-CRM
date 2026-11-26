import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { WorkspaceProvider } from "../workspaces/WorkspaceContext";
import { WorkspaceGate } from "../workspaces/WorkspaceGate";
import Header from "./Header";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <WorkspaceProvider>
      <DataImportProvider>
        <Header />
        <main className="max-w-screen-xl mx-auto px-6 py-8" id="main-content">
          <ErrorBoundary FallbackComponent={Error}>
            <Suspense
              fallback={<Skeleton className="h-12 w-12 rounded-full" />}
            >
              <WorkspaceGate>{children}</WorkspaceGate>
            </Suspense>
          </ErrorBoundary>
        </main>
        <Notification />
      </DataImportProvider>
    </WorkspaceProvider>
  );
};
