import { CheckSquare } from "lucide-react";
import { useTranslate } from "ra-core";

import { AddTask } from "../tasks/AddTask";
import { TasksListContent } from "../tasks/TasksListContent";

export const TasksList = () => {
  const translate = useTranslate();
  return (
    <div className="glass-card flex flex-col rounded-2xl">
      <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <CheckSquare className="size-[1.05rem]" />
        </div>
        <h2 className="font-display text-xl leading-tight text-foreground flex-1">
          {translate("crm.dashboard.upcoming_tasks", {
            _: "Upcoming Tasks",
          })}
        </h2>
        <AddTask display="icon" selectContact />
      </div>
      <div className="p-5">
        <TasksListContent />
      </div>
    </div>
  );
};
