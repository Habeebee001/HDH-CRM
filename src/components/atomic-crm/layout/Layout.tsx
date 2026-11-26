import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsWideLayout } from "@/hooks/use-media-query";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { WorkspaceProvider } from "../workspaces/WorkspaceContext";
import { WorkspaceGate } from "../workspaces/WorkspaceGate";
import Header from "./Header";
import { Sidebar } from "./Sidebar";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  const wide = useIsWideLayout();
  return (
    <WorkspaceProvider>
      <DataImportProvider>
        {/* Soft champagne backdrop that the glass cards frost over */}
        <div className="app-backdrop" aria-hidden />
        {wide ? <Sidebar /> : null}
        <div className={wide ? "pl-64" : undefined}>
          <Header />
          <main
            className="max-w-screen-xl mx-auto px-6 py-8"
            id="main-content"
          >
            <ErrorBoundary FallbackComponent={Error}>
              <Suspense
                fallback={<Skeleton className="h-12 w-12 rounded-full" />}
              >
                <WorkspaceGate>{children}</WorkspaceGate>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <Notification />
      </DataImportProvider>
    </WorkspaceProvider>
  );
};
