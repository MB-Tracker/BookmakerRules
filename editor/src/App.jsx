import React from "react";
import SportsMarketsTab from "./components/SportsMarketsTab.jsx";

export default function App() {
  return (
    <div className="container-fluid py-4" style={{ maxWidth: 900 }}>
      <h4 className="mb-4 fw-semibold">Payout Rules Editor</h4>
      <SportsMarketsTab />
    </div>
  );
}
