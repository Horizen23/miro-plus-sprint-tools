import * as React from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryRow } from "../components/SummaryCard";
import { InputField } from "../components/InputField";
import { CalendarPicker } from "../components/CalendarPicker";
import { getBucketedPoint, mapHoursToPoints } from "../utils/estimationUtils";

interface TeamMember {
  id: string;
  name: string;
  attendance: number[]; // 1 for full, 0.5 for half, 0 for leave
}

interface CapacityConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workHoursPerDay: number;
  ceremonyHours: number; // total for all events
}

export const CapacityPlanning: React.FC = () => {
  const [capConfig, setCapConfig] = React.useState<CapacityConfig>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 13).toISOString().split('T')[0],
    workHoursPerDay: Number(process.env.NEXT_PUBLIC_CAPACITY_WORK_HOURS || 8),
    ceremonyHours: Number(process.env.NEXT_PUBLIC_CAPACITY_CEREMONY_HOURS || 12)
  });

  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([
    { id: '1', name: 'Member 1', attendance: Array(31).fill(1) },
    { id: '2', name: 'Member 2', attendance: Array(31).fill(1) },
    { id: '3', name: 'Member 3', attendance: Array(31).fill(1) },
    { id: '4', name: 'Member 4', attendance: Array(31).fill(1) },
    { id: '5', name: 'Member 5', attendance: Array(31).fill(1) }
  ]);

  const sprintDates: Date[] = React.useMemo(() => {
    const dates: Date[] = [];
    let curr = new Date(capConfig.startDate);
    const last = new Date(capConfig.endDate);
    while (curr <= last) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [capConfig.startDate, capConfig.endDate]);

  const sprintDays = React.useMemo(() => {
    return sprintDates.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;
  }, [sprintDates]);

  // Memoize Member Stats
  const memberStats = React.useMemo(() => {
    return teamMembers.map(m => {
      let memberTotalHours = 0;
      sprintDates.forEach((date, i) => {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (!isWeekend) {
          const val = m.attendance[i] !== undefined ? m.attendance[i] : 1;
          memberTotalHours += (val * capConfig.workHoursPerDay);
        }
      });
      const net = memberTotalHours - capConfig.ceremonyHours;
      return {
        ...m,
        netMemberHours: net > 0 ? net : 0
      };
    });
  }, [teamMembers, sprintDates, capConfig.workHoursPerDay, capConfig.ceremonyHours]);

  // Memoize Grand Total
  const totalNet = React.useMemo(() => {
    return memberStats.reduce((sum, m) => sum + m.netMemberHours, 0);
  }, [memberStats]);

  return (
    <div className="planning-container">
      <section className="capacity-section">
        <SectionHeader 
          title="Sprint Duration" 
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          )}
        />
        <CalendarPicker 
          startDate={capConfig.startDate}
          endDate={capConfig.endDate}
          onRangeChange={(start, end) => setCapConfig({...capConfig, startDate: start, endDate: end})}
        />

        <div className="config-body" style={{marginTop: '8px'}}>
          <SummaryRow style={{ marginBottom: '8px' }}>
            <div className="summary-item">
              <span className="label">Work Days</span>
              <span className="value">{sprintDays} days</span>
            </div>
          </SummaryRow>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <InputField 
              label="Hrs/Day" 
              type="number" 
              value={capConfig.workHoursPerDay} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCapConfig({...capConfig, workHoursPerDay: Number(e.target.value)})} 
            />
            <InputField 
              label="Event Hrs" 
              type="number" 
              value={capConfig.ceremonyHours} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCapConfig({...capConfig, ceremonyHours: Number(e.target.value)})} 
            />
          </div>
        </div>
      </section>

      <section className="team-section">
        <div className="section-header-row">
          <div className="title-group">
            <span className="group-title">Attendance</span>
            <div className="attendance-legend">
              <span className="legend-item"><span className="dot full"></span> F</span>
              <span className="legend-item"><span className="dot half"></span> H</span>
              <span className="legend-item"><span className="dot off"></span> O</span>
            </div>
          </div>
          <button className="btn-tiny" onClick={() => setTeamMembers([...teamMembers, { id: Date.now().toString(), name: 'New Member', attendance: Array(31).fill(1) }])}>
            + Add
          </button>
        </div>
        
        <div className="calendar-scroll">
          <table className="capacity-table">
            <thead>
              <tr>
                <th className="name-header">
                  <span>Team</span>
                  <button className="btn-reset-all" onClick={() => setTeamMembers(teamMembers.map(m => ({...m, attendance: Array(31).fill(1)})))} title="Reset All to Full">Reset</button>
                </th>
                {sprintDates.map((date, i) => (
                  <th key={i}>
                    <button 
                      className={`col-toggle-btn ${(() => {
                        const today = new Date();
                        return date && date.getDate() === today.getDate() && 
                                date.getMonth() === today.getMonth() && 
                                date.getFullYear() === today.getFullYear() ? 'today' : '';
                      })()}`}
                      title={`${date ? date.toLocaleDateString() : ''}`}
                      onClick={() => {
                        const allLeave = teamMembers.every(m => (m.attendance[i] === 0));
                        const nextVal = allLeave ? 1 : 0;
                        setTeamMembers(teamMembers.map(m => {
                          const newAtt = [...m.attendance];
                          while(newAtt.length <= i) newAtt.push(1);
                          newAtt[i] = nextVal;
                          return {...m, attendance: newAtt};
                        }));
                      }}
                    >
                      <span className="date-d">{date ? date.getDate() : '-'}</span>
                    </button>
                  </th>
                ))}
                <th>h</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.map(m => (
                <tr key={m.id}>
                  <td className="sticky-col">
                    <div className="name-cell">
                      <button className="btn-del-small" onClick={() => setTeamMembers(teamMembers.filter(tm => tm.id !== m.id))}>×</button>
                      <input 
                        type="text" className="member-name-input" 
                        value={m.name} 
                        onChange={e => setTeamMembers(teamMembers.map(tm => tm.id === m.id ? {...tm, name: e.target.value} : tm))}
                      />
                    </div>
                  </td>
                  {sprintDates.map((date, dayIdx) => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const val = isWeekend ? 0 : (m.attendance[dayIdx] !== undefined ? m.attendance[dayIdx] : 1);
                    
                    return (
                      <td key={dayIdx} className={isWeekend ? 'td-weekend' : ''}>
                        <button 
                          className={`att-btn ${isWeekend ? 'weekend-off' : (val === 1 ? 'full' : val === 0.5 ? 'half' : 'leave')}`}
                          disabled={!!isWeekend}
                          onClick={() => {
                            if (isWeekend) return;
                            const nextVal = val === 1 ? 0.5 : val === 0.5 ? 0 : 1;
                            const newAtt = [...m.attendance];
                            while(newAtt.length <= dayIdx) newAtt.push(1);
                            newAtt[dayIdx] = nextVal;
                            setTeamMembers(teamMembers.map(tm => tm.id === m.id ? {...tm, attendance: newAtt} : tm));
                          }}
                        >
                          {isWeekend ? '-' : (val === 1 ? '•' : val === 0.5 ? '½' : '×')}
                        </button>
                      </td>
                    );
                  })}
                  <td className="total-cell">{m.netMemberHours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SummaryCard className="capacity-result">
        <SummaryRow>
          <div className="grid-item main">
            <span className="label">Net Capacity</span>
            <span className="value-large">{totalNet}h</span>
          </div>
          <div className="grid-item main">
            <span className="label">Suggested</span>
            <span className="value-large" style={{color: '#52c41a'}}>{getBucketedPoint(mapHoursToPoints(totalNet))}P</span>
          </div>
        </SummaryRow>
      </SummaryCard>
      
      <p className="hint" style={{textAlign: 'center', marginTop: '8px'}}>
        *Suggested Points is calculated using your Fibonacci table.
      </p>
    </div>
  );
};
