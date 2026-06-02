import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraTools } from './JiraTools';
import { useJiraAuth } from '../contexts/JiraAuthContext';
import { useGlobalConfig } from '../contexts/GlobalConfigContext';
import { usePanel } from '@/contexts/PanelContext';
import { useJiraDetection } from '../hooks/useJiraDetection';
import { useJira } from '../hooks/useJira';

vi.mock('../contexts/JiraAuthContext', () => ({
  useJiraAuth: vi.fn()
}));
vi.mock('../contexts/GlobalConfigContext', () => ({
  useGlobalConfig: vi.fn()
}));
vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn()
}));
vi.mock('../hooks/useJiraDetection', () => ({
  useJiraDetection: vi.fn()
}));
vi.mock('../hooks/useJira', () => ({
  useJira: vi.fn()
}));

describe('JiraTools', () => {
  const mockJiraConfig = { accessToken: 'token', baseUrl: 'https://site.atlassian.net' };
  const mockGlobalConfig = { config: { tsUserMapping: '', jiraStoryPointsField: 'field' } };
  
  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        getUserInfo: vi.fn().mockResolvedValue({ id: 'me', email: 'me@example.com' }),
        get: vi.fn().mockResolvedValue([]),
        notifications: {
          showInfo: vi.fn(),
          showError: vi.fn(),
        },
      },
    });
    vi.mocked(useJiraAuth).mockReturnValue({
      config: mockJiraConfig,
      isAuthenticating: false,
      availableResources: [],
      startOAuth: vi.fn(),
      selectResource: vi.fn(),
      logout: vi.fn(),
    } as any);
    vi.mocked(useGlobalConfig).mockReturnValue({
      ...mockGlobalConfig,
      updateConfig: vi.fn(),
    } as any);
    vi.mocked(usePanel).mockReturnValue({
      rawSelection: [],
    } as any);
    vi.mocked(useJiraDetection).mockReturnValue({
      selectedCards: [],
      checkedIds: new Set(),
      setCheckedIds: vi.fn(),
      detectSelection: vi.fn(),
      toggleCheck: vi.fn(),
      handleSelectAll: vi.fn(),
      validItemsCount: 0,
    } as any);
    vi.mocked(useJira).mockReturnValue({
      withRefresh: vi.fn(),
    } as any);
  });

  it('renders Connect Jira if not authenticated', () => {
    vi.mocked(useJiraAuth).mockReturnValue({
      config: {},
      isAuthenticating: false,
      availableResources: [],
    } as any);
    render(<JiraTools />);
    expect(screen.getByText(/Connect Jira/i)).toBeDefined();
  });

  it('renders search input when authenticated', () => {
    render(<JiraTools />);
    if (screen.queryByPlaceholderText(/PROJ-123/i)) {
       expect(screen.getByPlaceholderText(/PROJ-123/i)).toBeDefined();
    } else {
       fireEvent.click(screen.getByText(/Config/i));
       expect(screen.getByPlaceholderText(/PROJ-123/i)).toBeDefined();
    }
  });

  it('renders selected cards and handles sync', async () => {
    const mockCards = [
      { id: 'c1', title: 'Task 1', syncedKey: null, detectedParentKey: 'PROJ-1', isValid: true }
    ];
    vi.mocked(useJiraDetection).mockReturnValue({
      selectedCards: mockCards,
      checkedIds: new Set(['c1']),
      toggleCheck: vi.fn(),
      handleSelectAll: vi.fn(),
      validItemsCount: 1,
      detectSelection: vi.fn(),
    } as any);
    vi.mocked(usePanel).mockReturnValue({
      rawSelection: [{ id: 'c1', type: 'card', title: 'Task 1' }],
    } as any);

    render(<JiraTools />);
    
    expect(screen.getByText(/Task 1/i)).toBeDefined();
    
    const syncButton = screen.getByText(/Sync 1 Item\(s\) to Jira/i);
    fireEvent.click(syncButton);
    
    await waitFor(() => {
      expect(miro.board.notifications.showInfo).toHaveBeenCalled();
    });
  });

  it('handles searching for parent issues', async () => {
    const mockIssues = [{ id: '1', key: 'PROJ-1', fields: { summary: 'Summary' } }];
    const mockWithRefresh = vi.fn().mockResolvedValue(mockIssues);
    vi.mocked(useJira).mockReturnValue({ withRefresh: mockWithRefresh } as any);

    render(<JiraTools />);
    
    // Show config
    fireEvent.click(screen.getByText(/Config/i));
    
    const searchInput = screen.getByLabelText(/Search for Parent Issue/i);
    fireEvent.change(searchInput, { target: { value: 'PROJ' } });
    
    await waitFor(() => {
      expect(mockWithRefresh).toHaveBeenCalled();
      expect(screen.getByText(/Summary/i)).toBeDefined();
    });
    
    // Select result
    fireEvent.click(screen.getByText(/PROJ-1/i));
    expect(screen.getByText(/Target: Summary/i)).toBeDefined();
  });
});
