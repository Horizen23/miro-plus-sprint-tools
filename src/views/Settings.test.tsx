import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsView } from './Settings';
import { useGlobalConfig } from '../contexts/GlobalConfigContext';

vi.mock('../contexts/GlobalConfigContext', () => ({
  useGlobalConfig: vi.fn()
}));

describe('SettingsView', () => {
  const mockConfig = {
    tsProject: '[Project]',
    tsMeetingPattern: 'Meeting',
    tsTaskPattern: 'Task',
    tsDefaultProject: 'Default',
    tsUserMapping: 'user=email',
    tsVariables: 'vars',
    jiraPrefix: 'JIRA',
    jiraStoryPointsField: 'points',
    tsAutoFillDetailPatterns: 'pattern',
    tsMeetingTag: 'Meeting',
    jiraDomain: 'site.atlassian.net',
  };

  const mockUpdateConfig = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        notifications: {
          showInfo: vi.fn(),
        },
      },
    });
    vi.mocked(useGlobalConfig).mockReturnValue({
      config: mockConfig,
      updateConfig: mockUpdateConfig,
      boardId: 'board123',
      isLoading: false,
    });
  });

  it('renders settings fields with values', () => {
    render(<SettingsView />);
    expect(screen.getByLabelText(/Timesheet Prefix/i)).toHaveValue('[Project]');
    expect(screen.getByLabelText(/Meeting Tag/i)).toHaveValue('Meeting');
    expect(screen.getByLabelText(/Jira Prefix/i)).toHaveValue('JIRA');
  });

  it('calls updateConfig when Save button is clicked', async () => {
    render(<SettingsView />);
    const saveButton = screen.getByText(/Save All Settings to Board/i);
    
    fireEvent.click(saveButton);
    
    expect(mockUpdateConfig).toHaveBeenCalled();
    await waitFor(() => {
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('saved'));
    });
  });

  it('shows loading state', () => {
    vi.mocked(useGlobalConfig).mockReturnValue({
      config: mockConfig,
      updateConfig: mockUpdateConfig,
      boardId: 'board123',
      isLoading: true,
    });
    render(<SettingsView />);
    expect(screen.getByText(/Loading settings.../i)).toBeDefined();
  });

  it('handles clearing specific cache', async () => {
    // Mock localStorage to have some cache info
    const now = Date.now();
    vi.stubGlobal('localStorage', {
      miro_cache_tags_123: JSON.stringify({ expiry: now + 100000 }),
      getItem: (key: string) => {
        if (key === 'miro_cache_tags_123') return JSON.stringify({ expiry: now + 100000 });
        return null;
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 1,
      key: (i: number) => 'miro_cache_tags_123',
    });

    render(<SettingsView />);
    
    const cacheBadge = await screen.findByText(/Miro Tags/i);
    fireEvent.click(cacheBadge);
    
    expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Cleared cache'));
  });

  it('handles resetting all caches', async () => {
    render(<SettingsView />);
    const resetButton = screen.getByText(/Reset System Cache & Preferences/i);
    
    fireEvent.click(resetButton);
    
    expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('All local caches'));
  });
});
