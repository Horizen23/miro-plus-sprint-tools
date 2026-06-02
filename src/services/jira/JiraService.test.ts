import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraService, textToADF } from './JiraService';
import { cacheUtils } from '../../utils/cacheUtils';

vi.mock('../../utils/cacheUtils', () => ({
  cacheUtils: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
    clearByPrefix: vi.fn(),
  },
}));

describe('JiraService', () => {
  const mockConfig = {
    baseUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'token',
    authType: 'basic' as const,
  };

  describe('textToADF', () => {
    it('should convert plain text to simple paragraph', () => {
      const adf = textToADF('Hello World');
      expect(adf.type).toBe('doc');
      expect(adf.content?.[0].type).toBe('paragraph');
      expect(adf.content?.[0].content?.[0].text).toBe('Hello World');
    });

    it('should handle bullet points', () => {
      const adf = textToADF('- Item 1\n- Item 2');
      expect(adf.content?.[0].type).toBe('bulletList');
      expect(adf.content?.[0].content).toHaveLength(2);
    });

    it('should handle numbered lists', () => {
      const adf = textToADF('1. Item 1\n2. Item 2');
      expect(adf.content?.[0].type).toBe('orderedList');
      expect(adf.content?.[0].content).toHaveLength(2);
    });

    it('should handle links', () => {
      const adf = textToADF('Check https://example.com');
      const paragraph = adf.content?.[0];
      expect(paragraph?.content).toHaveLength(2);
      expect(paragraph?.content?.[1].marks?.[0].type).toBe('link');
    });

    it('should handle empty lines and multiple paragraphs', () => {
      const adf = textToADF('Line 1\n\nLine 2');
      expect(adf.content).toHaveLength(3); // paragraph, empty paragraph, paragraph
      expect(adf.content?.[1].type).toBe('paragraph');
      expect(adf.content?.[1].content).toHaveLength(0);
    });

    it('should handle empty line inside a list', () => {
      const adf = textToADF('- Item 1\n\n- Item 2');
      expect(adf.content).toHaveLength(3);
      expect(adf.content?.[0].type).toBe('bulletList');
      expect(adf.content?.[1].type).toBe('paragraph');
      expect(adf.content?.[2].type).toBe('bulletList');
    });

    it('should handle switching list types', () => {
      const adf = textToADF('- Bullet\n1. Numbered');
      expect(adf.content).toHaveLength(2);
      expect(adf.content?.[0].type).toBe('bulletList');
      expect(adf.content?.[1].type).toBe('orderedList');
    });

    it('should handle transition from text to numbered list', () => {
      const adf = textToADF('Text\n1. Numbered');
      expect(adf.content).toHaveLength(2);
      expect(adf.content?.[0].type).toBe('paragraph');
      expect(adf.content?.[1].type).toBe('orderedList');
    });

    it('should handle numbered list switching to bullet', () => {
      const adf = textToADF('1. Numbered\n- Bullet');
      expect(adf.content).toHaveLength(2);
      expect(adf.content?.[0].type).toBe('orderedList');
      expect(adf.content?.[1].type).toBe('bulletList');
    });
  });

  describe('JiraService Methods', () => {
    let service: JiraService;

    beforeEach(() => {
      service = new JiraService(mockConfig);
      vi.stubGlobal('fetch', vi.fn());
      vi.stubGlobal('btoa', vi.fn((s) => Buffer.from(s).toString('base64')));
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should construct correct API base URL for basic auth', () => {
      expect(service.getApiBaseUrl()).toBe('https://test.atlassian.net/rest/api/3');
    });

    it('should construct correct API base URL for oauth', () => {
      const oauthService = new JiraService({
        authType: 'oauth',
        cloudId: 'cloud-id',
        accessToken: 'token'
      });
      expect(oauthService.getApiBaseUrl()).toBe('https://api.atlassian.com/ex/jira/cloud-id/rest/api/3');
    });

    it('should use default api base and version if env not set', () => {
      const originalBase = process.env.NEXT_PUBLIC_JIRA_API_BASE;
      const originalVersion = process.env.NEXT_PUBLIC_JIRA_API_VERSION;
      delete process.env.NEXT_PUBLIC_JIRA_API_BASE;
      delete process.env.NEXT_PUBLIC_JIRA_API_VERSION;

      const oauthService = new JiraService({
        authType: 'oauth',
        cloudId: 'cloud-id',
        accessToken: 'token'
      });
      expect(oauthService.getApiBaseUrl()).toBe('https://api.atlassian.com/ex/jira/cloud-id/rest/api/3');

      if (originalBase === undefined) {
        delete process.env.NEXT_PUBLIC_JIRA_API_BASE;
      } else {
        process.env.NEXT_PUBLIC_JIRA_API_BASE = originalBase;
      }
      
      if (originalVersion === undefined) {
        delete process.env.NEXT_PUBLIC_JIRA_API_VERSION;
      } else {
        process.env.NEXT_PUBLIC_JIRA_API_VERSION = originalVersion;
      }
    });

    it('should use Basic auth if oauth is requested but accessToken is missing', () => {
      const oauthService = new JiraService({
        authType: 'oauth',
        email: 'test@example.com',
        apiToken: 'token'
      });
      expect(oauthService.getAuthHeader()).toBe('Basic dGVzdEBleGFtcGxlLmNvbTp0b2tlbg==');
    });

    it('should fetch an issue', async () => {
      const mockIssue = { id: '1', key: 'TEST-1', fields: { summary: 'Test', project: { id: '10000' }, issuetype: { id: '1', subtask: false } } };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      const issue = await service.getIssue('TEST-1');
      expect(issue.key).toBe('TEST-1');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/issue/TEST-1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should throw error if getIssue fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as any);

      await expect(service.getIssue('TEST-1')).rejects.toThrow('Failed to fetch issue TEST-1: 404 Not Found');
    });

    describe('getProjectIssueTypes', () => {
      it('should return cached data if available', async () => {
        const mockIssueTypes = [{ id: '1', name: 'Task', subtask: false }];
        vi.mocked(cacheUtils.get).mockReturnValue(mockIssueTypes);

        const result = await service.getProjectIssueTypes('10000');
        expect(result).toEqual(mockIssueTypes);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should fetch and cache issue types if not in cache', async () => {
        const mockIssueTypes = [{ id: '1', name: 'Task', subtask: false }];
        vi.mocked(cacheUtils.get).mockReturnValue(null);
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockIssueTypes,
        } as any);

        const result = await service.getProjectIssueTypes('10000');
        expect(result).toEqual(mockIssueTypes);
        expect(cacheUtils.set).toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/issuetype/project?projectId=10000'), expect.any(Object));
      });

      it('should throw error if fetch fails', async () => {
        vi.mocked(cacheUtils.get).mockReturnValue(null);
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 500,
        } as any);

        await expect(service.getProjectIssueTypes('10000')).rejects.toThrow('Failed to fetch project issue types: 500');
      });
    });

    describe('searchIssues', () => {
      it('should return empty array for empty query', async () => {
        const result = await service.searchIssues('');
        expect(result).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should search issues and return combined list', async () => {
        const mockResponse = {
          sections: [
            { issues: [{ id: '1', key: 'TEST-1' }] },
            { issues: [{ id: '2', key: 'TEST-2' }] }
          ]
        };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        } as any);

        const result = await service.searchIssues('test', 'PROJ');
        expect(result).toHaveLength(2);
        expect(result).toEqual([{ id: '1', key: 'TEST-1' }, { id: '2', key: 'TEST-2' }]);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('issue/picker'), expect.any(Object));
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('currentJql=project%20%3D%20%22PROJ%22'), expect.any(Object));
      });

      it('should throw error if search fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 400,
        } as any);

        await expect(service.searchIssues('test')).rejects.toThrow('Search failed: 400');
      });
    });

    describe('getMyself', () => {
      it('should return user profile', async () => {
        const mockUser = { accountId: '123', displayName: 'Test User' };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockUser,
        } as any);

        const result = await service.getMyself();
        expect(result).toEqual(mockUser);
      });

      it('should throw error if getMyself fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 401,
        } as any);

        await expect(service.getMyself()).rejects.toThrow('Jira API Error 401: Failed to get user profile');
      });
    });

    describe('createSubtask', () => {
      it('should create a subtask successfully', async () => {
        const parentIssue = { 
          id: '1', 
          key: 'PARENT-1', 
          fields: { 
            project: { id: '10000' }
          } 
        };
        const issueTypes = [
          { id: '1', name: 'Task', subtask: false },
          { id: '2', name: 'Sub-task', subtask: true }
        ];
        const createdIssue = { id: '3', key: 'PARENT-2' };

        // Mock getIssue
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => parentIssue,
        } as any);

        // Mock getProjectIssueTypes (first call to fetch in createSubtask is for issue types if not cached)
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => issueTypes,
        } as any);

        // Mock create issue (POST)
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => createdIssue,
        } as any);

        const result = await service.createSubtask(
          'PARENT-1', 
          'Subtask Summary', 
          'Subtask Description', 
          '2023-12-31', 
          '2023-12-01', 
          'user-123'
        );

        expect(result).toEqual(createdIssue);
        expect(fetch).toHaveBeenCalledTimes(3);
        
        // Check POST body
        const postCall = vi.mocked(fetch).mock.calls.find(call => call[1]?.method === 'POST');
        const body = JSON.parse(postCall![1]!.body as string);
        expect(body.fields.summary).toBe('Subtask Summary');
        expect(body.fields.parent.key).toBe('PARENT-1');
        expect(body.fields.issuetype.id).toBe('2');
        expect(body.fields.assignee.accountId).toBe('user-123');
      });

      it('should create a subtask with start date using default field if env not set', async () => {
        const parentIssue = { id: '1', key: 'P-1', fields: { project: { id: '10000' } } };
        const issueTypes = [{ id: '2', name: 'Sub-task', subtask: true }];
        
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => parentIssue } as any);
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => issueTypes } as any);
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: '3' }) } as any);

        const originalEnv = process.env.JIRA_START_DATE_FIELD;
        delete process.env.JIRA_START_DATE_FIELD;
        
        await service.createSubtask('P-1', 'S', undefined, undefined, '2023-12-01');
        
        const postCall = vi.mocked(fetch).mock.calls.find(call => call[1]?.method === 'POST');
        const body = JSON.parse(postCall![1]!.body as string);
        expect(body.fields.customfield_10015).toBe('2023-12-01');
        
        process.env.JIRA_START_DATE_FIELD = originalEnv;
      });

      it('should throw error if no subtask type found', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ fields: { project: { id: '10000' } } }),
        } as any);
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: '1', name: 'Task', subtask: false }],
        } as any);

        await expect(service.createSubtask('P-1', 'S')).rejects.toThrow('Could not find a valid Sub-task issue type in this project.');
      });
    });

    describe('updateIssue', () => {
      it('should update an issue successfully', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
        } as any);

        const result = await service.updateIssue('TEST-1', 'New Summary', '2023-12-31', '2023-12-01', 'user-123', 'New Description', 5);
        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/issue/TEST-1'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('New Summary')
          })
        );
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
        expect(body.fields.summary).toBe('New Summary');
        expect(body.fields.duedate).toBe('2023-12-31');
        expect(body.fields.customfield_10016).toBe(5); // default story points field
      });

      it('should throw error if update fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => 'Bad Request',
        } as any);

        await expect(service.updateIssue('TEST-1', 'Summary')).rejects.toThrow('Jira API Error 400: Failed to update issue TEST-1 - Bad Request');
      });
    });

    describe('getTransitions', () => {
      it('should return transitions', async () => {
        const mockTransitions = { transitions: [{ id: '1', name: 'To Do' }] };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockTransitions,
        } as any);

        const result = await service.getTransitions('TEST-1');
        expect(result).toEqual(mockTransitions.transitions);
      });

      it('should throw error if fetch fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 404,
        } as any);

        await expect(service.getTransitions('TEST-1')).rejects.toThrow('Jira API Error 404: Failed to fetch transitions');
      });
    });

    describe('transitionIssue', () => {
      it('should transition an issue successfully', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
        } as any);

        const result = await service.transitionIssue('TEST-1', '1', { resolution: { name: 'Done' } });
        expect(result).toBe(true);
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
        expect(body.transition.id).toBe('1');
        expect(body.fields.resolution.name).toBe('Done');
      });

      it('should throw error if transition fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => 'Error',
        } as any);

        await expect(service.transitionIssue('TEST-1', '1')).rejects.toThrow('Failed to transition issue TEST-1: 400 Error');
      });
    });

    describe('findUsers', () => {
      it('should return users', async () => {
        const mockUsers = [{ accountId: '1', displayName: 'User 1' }];
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockUsers,
        } as any);

        const result = await service.findUsers('query');
        expect(result).toEqual(mockUsers);
      });

      it('should return empty array if fetch fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
        } as any);

        const result = await service.findUsers('query');
        expect(result).toEqual([]);
      });
    });

    describe('findStoryPointsField', () => {
      it('should find the story points field', async () => {
        const mockFields = [
          { id: 'f1', name: 'Other' },
          { id: 'f2', name: 'Story Points' }
        ];
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockFields,
        } as any);

        const result = await service.findStoryPointsField();
        expect(result).toBe('f2');
      });

      it('should return null if not found', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => [{ id: 'f1', name: 'Other' }],
        } as any);

        const result = await service.findStoryPointsField();
        expect(result).toBeNull();
      });

      it('should return null if fetch fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
        } as any);

        const result = await service.findStoryPointsField();
        expect(result).toBeNull();
      });
    });

    describe('searchIssuesByJql', () => {
      it('should search issues by JQL', async () => {
        const mockResponse = { issues: [{ id: '1', key: 'TEST-1' }] };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        } as any);

        const result = await service.searchIssuesByJql('project = TEST');
        expect(result).toEqual(mockResponse);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search/jql?jql=project%20%3D%20TEST'), expect.any(Object));
      });

      it('should throw error if fetch fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => 'JQL Error',
        } as any);

        await expect(service.searchIssuesByJql('invalid')).rejects.toThrow('Jira API Error 400: JQL Error');
      });
    });

    describe('Other methods', () => {
      it('getAccessibleResources should work', async () => {
        const mockResources = [{ id: '1', name: 'R1' }];
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockResources,
        } as any);

        const result = await service.getAccessibleResources('token');
        expect(result).toEqual(mockResources);
      });

      it('refreshAccessToken should work', async () => {
        const serviceWithRefresh = new JiraService({ ...mockConfig, refreshToken: 'rt' });
        const mockTokenResponse = { access_token: 'at', refresh_token: 'rt2' };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockTokenResponse,
        } as any);

        const result = await serviceWithRefresh.refreshAccessToken();
        expect(result).toEqual(mockTokenResponse);
      });

      it('refreshAccessToken should throw if no refresh token', async () => {
        await expect(service.refreshAccessToken()).rejects.toThrow('No refresh token available');
      });

      it('refreshAccessToken should throw if fetch fails', async () => {
        const serviceWithRefresh = new JiraService({ ...mockConfig, refreshToken: 'rt' });
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
        } as any);
        await expect(serviceWithRefresh.refreshAccessToken()).rejects.toThrow('Failed to refresh access token');
      });

      it('testConnection should work', async () => {
        const mockUser = { accountId: '123' };
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => mockUser,
        } as any);

        const result = await service.testConnection();
        expect(result).toEqual(mockUser);
      });

      it('testConnection should throw if fetch fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        } as any);

        await expect(service.testConnection()).rejects.toThrow('Connection failed: 401 Unauthorized');
      });
    });
  });
});
