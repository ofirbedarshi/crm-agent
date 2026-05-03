import { useState } from "react";
import Chat from "./components/Chat";
import type { ChatTrace } from "./components/Chat";
import CrmDashboard from "./components/crm-demo/CrmDashboard";
import { CrmDemoProvider } from "./components/crm-demo/CrmDemoContext";
import TracePanel from "./components/TracePanel";
import TripaneShell from "./components/TripaneShell";

function App() {
  const [latestTrace, setLatestTrace] = useState<ChatTrace | null>(null);
  const [messageTraceOpen, setMessageTraceOpen] = useState(false);

  return (
    <CrmDemoProvider>
      <TripaneShell
        trace={
          messageTraceOpen ? (
            <div className="trace-pane-host" dir="ltr">
              <TracePanel trace={latestTrace} onClose={() => setMessageTraceOpen(false)} />
            </div>
          ) : null
        }
        chat={
          <Chat
            onTraceChange={setLatestTrace}
            messageTraceOpen={messageTraceOpen}
            onMessageTraceToggle={() => setMessageTraceOpen((v) => !v)}
          />
        }
        crm={<CrmDashboard />}
      />
    </CrmDemoProvider>
  );
}

export default App;
