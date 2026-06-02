import * as React from "react";
import { Button } from "./Button";
import { usePanel } from "@/contexts/PanelContext";

export const EstimationTools: React.FC = () => {
  const {
    estimateUnit,
    setEstimateUnit,
    handleSetPoints,
    isProcessing,
    summary,
  } = usePanel();

  const itemCount = summary.count;

  return (
    <>
      <div className="section-header-row">
        <span className="group-title">{estimateUnit === 'pt' ? 'Story Point Tools' : 'Hour Tools'}</span>
        <div className="unit-tabs">
          <button className={`unit-tab ${estimateUnit === 'pt' ? 'active' : ''}`} onClick={() => setEstimateUnit('pt')}>PT</button>
          <button className={`unit-tab ${estimateUnit === 'h' ? 'active' : ''}`} onClick={() => setEstimateUnit('h')}>H</button>
        </div>
      </div>

      <div className="point-buttons">
        {(estimateUnit === 'pt' 
          ? ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '144', '233', '377', '?']
          : ['1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '?']
        ).map(p => (
          <Button 
            key={p} 
            variant="point"
            onClick={() => handleSetPoints(p)}
            disabled={isProcessing || itemCount === 0}
          >
            {p}
          </Button>
        ))}
      </div>
    </>
  );
};
