import type { ReactElement } from "react";

import { formatSimTime } from "../../lib/format";
import type { ExecutionOut } from "../../lib/types";
import { EmptyState, Group } from "../../ui";

export interface ExecutionLogProps {
  executions: ExecutionOut[];
}

export function ExecutionLog({ executions }: ExecutionLogProps): ReactElement {
  return (
    <Group title="Protokoll" ariaLabel="Protokoll der Ausführungen, simulierte Uhrzeit">
      <div data-od-id="log">
        {executions.length === 0 ? (
          <EmptyState>Noch keine Ausführung protokolliert.</EmptyState>
        ) : (
          <ol className="log">
            {executions.map((execution) => (
              <li key={execution.id}>
                <time
                  dateTime={execution.sim_time}
                  aria-label={`Simulierte Uhrzeit ${formatSimTime(execution.sim_time)}`}
                >
                  {formatSimTime(execution.sim_time)}
                </time>
                <span>
                  {execution.text}
                  <small>{execution.automation_name}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Group>
  );
}
