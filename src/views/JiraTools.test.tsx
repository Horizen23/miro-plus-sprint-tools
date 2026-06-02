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
        getInfo: vi.fn().mockResolvedValue({ id: 'board-id' }),
        getUserInfo: vi.fn().mockResolvedValue({ id: 'me', email: 'me@example.com' }),
        get: vi.fn().mockResolvedValue([{ 
          id: 'c1', 
          tagIds: [], 
          description: '', 
          getMetadata: vi.fn().mockResolvedValue({}),
          setMetadata: vi.fn().mockResolvedValue(true),
          sync: vi.fn().mockResolvedValue(true)
        }]),
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
    expect(screen.getByText(/Connect to Jira/i)).toBeDefined();
  });

  it('renders search input when authenticated', () => {
    render(<JiraTools />);
    expect(screen.getByPlaceholderText(/Search Key or Title/i)).toBeDefined();
  });

  it('renders selected cards and handles sync', async () => {
    const mockCards = [
      { id: 'c1', title: 'Task 1', syncedKey: null, detectedParentKey: 'PROJ-1', isValid: true }
    ];
    const mockSetCheckedIds = vi.fn();
    vi.mocked(useJira).mockReturnValue({
      withRefresh: vi.fn().mockResolvedValue({ key: 'NEW-1' }),
    } as any);
    vi.mocked(useJiraDetection).mockReturnValue({
      selectedCards: mockCards,
      checkedIds: new Set(['c1']),
      toggleCheck: vi.fn(),
      handleSelectAll: vi.fn(),
      validItemsCount: 1,
      detectSelection: vi.fn(),
      setCheckedIds: mockSetCheckedIds,
      clearCache: vi.fn(),
    } as any);
    vi.mocked(usePanel).mockReturnValue({
      rawSelection: [{ id: 'c1', type: 'card', title: 'Task 1' }],
    } as any);

    render(<JiraTools />);
    
    expect(screen.getByText(/Task 1/i)).toBeDefined();
    
    const syncButton = screen.getByText(/Sync & Update Jira Issues/i);
    fireEvent.click(syncButton);
    
    await waitFor(() => {
      expect(mockSetCheckedIds).toHaveBeenCalled();
    });
  });

  it('handles searching for parent issues', async () => {
    const mockIssues = [{ id: '1', key: 'PROJ-1', summaryText: 'Summary' }];
    const mockWithRefresh = vi.fn().mockResolvedValue(mockIssues);
    vi.mocked(useJira).mockReturnValue({ withRefresh: mockWithRefresh } as any);

    render(<JiraTools />);
    
    const searchInput = screen.getByPlaceholderText(/Search Key or Title/i);
    fireEvent.change(searchInput, { target: { value: 'PROJ' } });
    
    await waitFor(() => {
      expect(mockWithRefresh).toHaveBeenCalled();
      expect(screen.getByText(/Summary/i)).toBeDefined();
    });
    
    // Select result
    fireEvent.click(screen.getByText(/PROJ-1/i));
    expect(screen.getByText(/PROJ-1/i)).toBeDefined();
  });
});
