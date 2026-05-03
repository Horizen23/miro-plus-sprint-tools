import * as React from "react";

interface CalendarPickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
}

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  startDate,
  endDate,
  onRangeChange,
}) => {
  const [viewDate, setViewDate] = React.useState(new Date(startDate || new Date()));
  const [hoverDate, setHoverDate] = React.useState<string | null>(null);
  const [isSelectingRange, setIsSelectingRange] = React.useState(false);

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const todayStr = new Date().toISOString().split('T')[0];

  const renderCells = () => {
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
      const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      const isStart = dateStr === startDate;
      const isEnd = dateStr === endDate;
      
      const startObj = new Date(startDate);
      const currentEnd = isSelectingRange && hoverDate ? hoverDate : endDate;
      const endObj = new Date(currentEnd);
      const currentObj = new Date(dateStr);
      
      const inRange = currentObj >= (startObj < endObj ? startObj : endObj) && 
                      currentObj <= (startObj < endObj ? endObj : startObj);
      
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const isToday = dateStr === todayStr;

      cells.push(
        <div 
          key={d} 
          className={`cal-day ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} ${inRange ? 'in-range' : ''} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
          onMouseEnter={() => isSelectingRange && setHoverDate(dateStr)}
          onClick={() => {
            if (!isSelectingRange) {
              onRangeChange(dateStr, dateStr);
              setIsSelectingRange(true);
              setHoverDate(dateStr);
            } else {
              const startD = new Date(startDate);
              const clickedD = new Date(dateStr);
              if (clickedD < startD) {
                onRangeChange(dateStr, startDate);
              } else {
                onRangeChange(startDate, dateStr);
              }
              setIsSelectingRange(false);
              setHoverDate(null);
            }
          }}
        >
          {d}
        </div>
      );
    }
    return cells;
  };

  return (
    <div className="calendar-picker-box">
      <div className="cal-nav">
        <button onClick={handlePrevMonth}>&lt;</button>
        <span>{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
        <button onClick={handleNextMonth}>&gt;</button>
      </div>
      <div className="cal-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={`${d}-${i}`} className="cal-weekday">{d}</div>)}
        {renderCells()}
      </div>
    </div>
  );
};
