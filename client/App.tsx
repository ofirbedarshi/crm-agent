import { useState } from "react";
import Chat from "./components/Chat";
import type { ChatTrace } from "./components/Chat";
import CrmDashboard from "./components/crm-demo/CrmDashboard";
import { CrmDemoProvider } from "./components/crm-demo/CrmDemoContext";
import TracePanel from "./components/TracePanel";
import TripaneShell from "./components/TripaneShell";
import { showMessageTraceUi } from "./src/featureFlags";

function App() {
  const [latestTrace, setLatestTrace] = useState<ChatTrace | null>(null);

  return (
    <CrmDemoProvider>
      <TripaneShell
        trace={
          showMessageTraceUi ? (
            <div className="trace-pane-host" dir="ltr">
              <TracePanel trace={latestTrace} />
            </div>
          ) : null
        }
        chat={<Chat onTraceChange={setLatestTrace} />}
        crm={<CrmDashboard />}
      />
    </CrmDemoProvider>
  );
}

export default App;
