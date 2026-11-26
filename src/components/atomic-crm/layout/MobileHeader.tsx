import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { WorkspaceSwitcher } from "../workspaces/WorkspaceSwitcher";

// The search lives here rather than in each screen: there is no Cmd+K on a
// phone, so this header is the only place reachable from every mobile page.
const MobileHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <header className="dark fixed top-0 left-0 right-0 z-10 bg-header text-foreground border-b border-white/[0.06] h-14 px-4 w-full flex justify-between items-center">
      {children}
      <div className="flex items-center gap-1">
        <WorkspaceSwitcher variant="compact" />
        <GlobalSearchButton variant="icon" />
      </div>
    </header>
  );
};

export default MobileHeader;
