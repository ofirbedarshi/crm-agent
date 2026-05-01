import { useState } from "react";
import Chat from "./components/Chat";
import type { ChatTrace } from "./components/Chat";
import CrmDashboard from "./components/crm-demo/CrmDashboard";
import { CrmDemoProvider } from "./components/crm-demo/CrmDemoContext";
import TracePanel from "./components/TracePanel";
import TripaneShell from "./components/TripaneShell";

function App() {
  const [latestTrace, setLatestTrace] = useState<ChatTrace | null>(null);

  return (
    <CrmDemoProvider>
      <TripaneShell
        trace={
          <div className="trace-pane-host" dir="ltr">
            <TracePanel trace={latestTrace} />
          </div>
        }
        chat={<Chat onTraceChange={setLatestTrace} />}
        crm={<CrmDashboard />}
      />
    </CrmDemoProvider>
  );
}

export default App;
