import * as React from "react";
import { SummaryCard, SummaryRow, SummaryItem, SummaryDivider } from "./SummaryCard";
import { Button } from "./Button";

interface SelectionSummaryProps {
  summary: {
    count: number;
    points: number;
    bucketedPoint: number;
    hourRange: [number, number];
    actualHours: number;
  };
  handleAction: (name: string, fn: () => Promise<any>) => void;
  handleCreateSticky: (notes: string[], parentFrameId?: string) => Promise<any>;
}

export const SelectionSummary: React.FC<SelectionSummaryProps> = ({
  summary,
  handleAction,
  handleCreateSticky,
}) => {
  return (
    <SummaryCard>
      <SummaryRow>
        <SummaryItem label="Items Selected" value={summary.count} />
        <SummaryItem label="Total Points" value={`${summary.points}pt`} align="right" />
      </SummaryRow>
      
      <SummaryDivider />
      
      <SummaryItem 
        label="Fibonacci Reference" 
        value={(
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <span>
              {summary.bucketedPoint}P 
              <span style={{fontSize: '12px', color: '#8c90b0', marginLeft: '8px'}}>
                ({summary.hourRange[0]}-{summary.hourRange[1]}h)
              </span>
            </span>
            <div className="sticky-actions" style={{display: 'flex', gap: '4px'}}>
              <Button 
                variant="icon" 
                title="Create Black Sticky Notes for Points & Hours"
                onClick={() => handleAction('create-sticky', async () => {
                  const selection = await miro.board.getSelection();
                  const parentId = (selection[0] as any)?.parentId;
                  const notes = [`${summary.points}pt`];
                  if (summary.actualHours > 0) notes.push(`${summary.actualHours}h`);
                  return handleCreateSticky(notes, parentId);
                })}
                icon={(
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"></path>
                    <path d="M15 3v6h6"></path>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                )}
              />
            </div>
          </div>
        )}
        hint={summary.actualHours > 0 ? `Actual hours detected: ${summary.actualHours}h` : undefined}
      />
    </SummaryCard>
  );
};
