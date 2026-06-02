import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timesheet } from './Timesheet';
import { useGlobalConfig } from '../contexts/GlobalConfigContext';
import { usePanel } from '@/contexts/PanelContext';

vi.mock('../contexts/GlobalConfigContext', () => ({
  useGlobalConfig: vi.fn()
}));
vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn()
}));

describe('Timesheet', () => {
  const mockConfig = {
    tsProject: '[Project]',
    tsMeetingPattern: 'Meeting: {title}',
    tsTaskPattern: 'Task: {title}',
    tsMeetingTag: 'Meeting',
    tsUserMapping: '',
    tsVariables: '',
    tsDefaultProject: 'Default',
  };

  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        getUserInfo: vi.fn().mockResolvedValue({ id: 'me' }),
        get: vi.fn().mockResolvedValue([]),
        viewport: { zoomTo: vi.fn() },
        select: vi.fn(),
        notifications: {
          showInfo: vi.fn(),
        },
      },
    });
    vi.mocked(useGlobalConfig).mockReturnValue({
      config: mockConfig,
      boardId: 'board123',
      isLoading: false,
    } as any);
    vi.mocked(usePanel).mockReturnValue({
      selectedItems: [],
    } as any);
  });

  it('renders empty state when no items selected', () => {
    render(<Timesheet />);
    expect(screen.getByText(/No Cards Selected/i)).toBeDefined();
  });

  it('renders timesheet items when cards with dates are selected', async () => {
    const mockCards = [
      {
        id: 'c1',
        type: 'card',
        title: 'UniqueTask',
        startDate: '2024-05-17',
        dueDate: '2024-05-17',
        tagIds: [],
      }
    ];
    vi.mocked(usePanel).mockReturnValue({
      selectedItems: mockCards as any,
    } as any);

    render(<Timesheet />);
    
    expect(await screen.findByText(/\[Project\]Task: UniqueTask/i)).toBeDefined();
  });

  it('filters by me', async () => {
    const mockCards = [
      {
        id: 'c1',
        type: 'card',
        title: 'MySpecificTask',
        startDate: '2024-05-17',
        dueDate: '2024-05-17',
        assignee: { userId: 'me' },
      },
      {
        id: 'c2',
        type: 'card',
        title: 'OtherTask',
        startDate: '2024-05-17',
        dueDate: '2024-05-17',
        assignee: { userId: 'other' },
      }
    ];
    vi.mocked(usePanel).mockReturnValue({
      selectedItems: mockCards as any,
    } as any);

    render(<Timesheet />);
    
    // Expand Personal Filter
    fireEvent.click(screen.getByText(/Personal Filter/i));

    // Toggle "Only Me"
    fireEvent.click(screen.getByLabelText(/Show only my tasks/i));
    
    expect(await screen.findByText(/MySpecificTask/i)).toBeDefined();
    expect(screen.queryByText(/OtherTask/i)).toBeNull();
    });
    it('handles copy operations', async () => {
    const mockCards = [{ id: 'c1', type: 'card', title: 'Task', startDate: '2024-05-17', dueDate: '2024-05-17' }];
    vi.mocked(usePanel).mockReturnValue({ selectedItems: mockCards as any } as any);

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

    render(<Timesheet />);

    const copyButton = await screen.findByText(/Copy All/i);
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Copied'));
    });
    });
    });

