import * as React from "react";
import { Button } from "./Button";

interface EstimationToolsProps {
  estimateUnit: 'pt' | 'h';
  setEstimateUnit: (unit: 'pt' | 'h') => void;
  handleSetPoints: (p: string) => void;
  isProcessing: boolean;
  itemCount: number;
}

export const EstimationTools: React.FC<EstimationToolsProps> = ({
  estimateUnit,
  setEstimateUnit,
  handleSetPoints,
  isProcessing,
  itemCount,
}) => {
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
          : ['1h', '2h', '4h', '8h', '12h', '16h', '24h', '32h', '40h', '?']
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
