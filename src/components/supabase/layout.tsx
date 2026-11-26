import * as React from "react";
import { Notification } from "@/components/admin/notification";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext";
import { BrandPanel } from "@/components/atomic-crm/login/BrandPanel";

export const Layout = ({ children }: React.PropsWithChildren) => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();

  return (
    <div className="min-h-screen flex bg-background">
      <div className="relative grid w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel />
        <div className="flex flex-col justify-center w-full px-6 py-12 lg:px-12">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
            <div className="flex justify-center lg:hidden">
              <img
                className="h-16 w-auto dark:hidden"
                src={lightModeLogo}
                alt={title}
              />
              <img
                className="h-16 w-auto hidden dark:block"
                src={darkModeLogo}
                alt={title}
              />
            </div>
            {children}
          </div>
        </div>
      </div>
      <Notification />
    </div>
  );
};
