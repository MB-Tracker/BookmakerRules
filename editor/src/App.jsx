import React, { useEffect, useState } from "react";
import SportsMarketsTab from "./components/SportsMarketsTab.jsx";
import ChangesPanel from "./components/ChangesPanel.jsx";
import { STATIC, local } from "./api/client.js";

function StaticBanner() {
  const [ctx, setCtx] = useState(null);
  useEffect(() => { local.then(setCtx); }, []);
  if (!ctx) return null;
  const repoUrl = `https://github.com/${ctx.repo}`;
  return (
    <div className="text-muted small">
      Browsing <a href={repoUrl} target="_blank" rel="noopener">{ctx.repo}</a>
      {ctx.commit && <> at <a href={`${repoUrl}/commit/${ctx.commit}`} target="_blank" rel="noopener"><code>{ctx.commit.slice(0, 7)}</code></a></>}.
      {" "}Edits are kept in this browser only — submit them as a GitHub issue with the button at the bottom.
    </div>
  );
}

export default function App() {
  // Bumped when the Pages build's changes are discarded, to reload everything.
  const [generation, setGeneration] = useState(0);
  return (
    <div className="app container-fluid py-3" style={{ maxWidth: 1600 }}>
      <SportsMarketsTab key={generation} header={
        <div className="d-flex align-items-baseline flex-wrap gap-3">
          <h4 className="mb-0 fw-semibold">Payout Rules Editor</h4>
          {STATIC && <StaticBanner />}
        </div>
      } />
      {STATIC && <ChangesPanel onDiscarded={() => setGeneration((n) => n + 1)} />}
    </div>
  );
}
