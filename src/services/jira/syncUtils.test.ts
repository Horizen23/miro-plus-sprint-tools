import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectJiraKeys, resolveJiraAssignees, syncCardStatus } from './syncUtils';

describe('jiraSyncUtils', () => {
  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        get: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('detectJiraKeys', () => {
    it('should detect keys from metadata', async () => {
      const mockItem = {
        getMetadata: vi.fn().mockResolvedValue({ key: 'PROJ-1, PROJ-2' }),
      } as unknown as any;
      
      const keys = await detectJiraKeys(mockItem);
      expect(keys).toEqual(['PROJ-1', 'PROJ-2']);
    });

    it('should fallback to tags if metadata is empty', async () => {
      const mockItem = {
        getMetadata: vi.fn().mockResolvedValue(undefined),
        tagIds: ['t1'],
      } as unknown as any;
      
      vi.mocked(miro.board.get).mockResolvedValue([{ id: 't1', title: 'Jira-TEST-123' } as any]);
      
      const keys = await detectJiraKeys(mockItem);
      expect(keys).toEqual(['TEST-123']);
    });
  });

  describe('resolveJiraAssignees', () => {
    it('should resolve assignees from mapping', async () => {
      const mockCard = { tagIds: ['t1'] } as any;
      const mockJiraWithRefresh = vi.fn();
      const mockMapping = new Map([['dev-tag', 'user@example.com']]);
      
      vi.mocked(miro.board.get).mockResolvedValue([{ id: 't1', title: 'dev-tag' } as any]);
      mockJiraWithRefresh.mockResolvedValue([{ accountId: 'acc-1' }]);

      const assignees = await resolveJiraAssignees(
        mockCard,
        mockJiraWithRefresh,
        { id: 'me', name: 'Me', type: 'user' } as any,
        'my-acc-id',
        mockMapping
      );

      expect(assignees).toEqual(['acc-1']);
    });
  });

  describe('syncCardStatus', () => {
    it('should update Miro card and sync to Jira', async () => {
      const mockCard = {
        type: 'card',
        title: 'Task Title',
        getMetadata: vi.fn().mockResolvedValue({ key: 'PROJ-1' }),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      
      const mockJiraWithRefresh = vi.fn().mockImplementation(async (fn) => {
        return fn({
          updateIssue: vi.fn().mockResolvedValue({}),
          getTransitions: vi.fn().mockResolvedValue([{ id: '1', name: 'In Progress' }]),
          transitionIssue: vi.fn().mockResolvedValue({}),
        });
      });

      const result = await syncCardStatus(
        mockCard as any,
        'in-progress',
        mockJiraWithRefresh,
        {
          userInfo: { id: 'me' } as any,
          myAccountId: 'acc-1',
        }
      );

      expect(result.success).toBe(true);
      expect(result.jiraUpdated).toBe(true);
      expect(mockCard.sync).toHaveBeenCalled();
    });

    it('should return success even if no Jira link found', async () => {
      const mockCard = {
        type: 'card',
        getMetadata: vi.fn().mockResolvedValue(undefined),
        sync: vi.fn().mockResolvedValue(undefined),
      };

      const result = await syncCardStatus(
        mockCard as any,
        'done',
        null,
        { userInfo: { id: 'me' } as any }
      );

      expect(result.success).toBe(true);
      expect(result.jiraUpdated).toBe(false);
    });
  });
});
