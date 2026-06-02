import { cacheUtils } from '../../utils/cacheUtils';

export interface JiraConfig {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  cloudId?: string;
  authType: 'basic' | 'oauth';
}

export interface ADFNode {
  type: string;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: ADFNode[];
  attrs?: Record<string, unknown>;
  version?: number;
}

// Helper to convert Plain Text (with newlines, links, and bullets) to Jira ADF
export function textToADF(text: string): ADFNode {
  const content: ADFNode[] = [];
  const lines = text.split('\n');

  let currentList: ADFNode | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({ type: "paragraph", content: [] });
      continue;
    }

    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    const isNumbered = /^\d+\.\s/.test(trimmed);

    const inlineContent: ADFNode[] = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        let textPart = line.substring(lastIndex, match.index);
        if (lastIndex === 0 && (isBullet || isNumbered)) textPart = textPart.replace(/^[-*]\s|^\d+\.\s/, '');
        if (textPart) inlineContent.push({ type: "text", text: textPart });
      }
      inlineContent.push({
        type: "text",
        text: match[0],
        marks: [{ type: "link", attrs: { href: match[0] } }]
      });
      lastIndex = urlRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      let textPart = line.substring(lastIndex);
      if (lastIndex === 0 && (isBullet || isNumbered)) textPart = textPart.replace(/^[-*]\s|^\d+\.\s/, '');
      if (textPart) inlineContent.push({ type: "text", text: textPart });
    }

    if (isBullet) {
      if (!currentList || currentList.type !== 'bulletList') {
        if (currentList) content.push(currentList);
        currentList = { type: 'bulletList', content: [] };
      }
      currentList.content?.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inlineContent.length ? inlineContent : [] }]
      });
    } else if (isNumbered) {
      if (!currentList || currentList.type !== 'orderedList') {
        if (currentList) content.push(currentList);
        currentList = { type: 'orderedList', content: [] };
      }
      currentList.content?.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inlineContent.length ? inlineContent : [] }]
      });
    } else {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({ type: "paragraph", content: inlineContent.length ? inlineContent : [] });
    }
  }

  if (currentList) content.push(currentList);
  return { type: "doc", version: 1, content: content.length > 0 ? content : [{ type: "paragraph", content: [] }] };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraUser {
  id?: string;
  key?: string;
  name?: string;
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    project: JiraProject;
    issuetype: JiraIssueType;
    [key: string]: unknown;
  };
}

export interface JiraResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
    id: string;
  };
}

export class JiraService {
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
  }

  private get authHeader(): string {
    if (this.config.authType === 'oauth' && this.config.accessToken) {
      return `Bearer ${this.config.accessToken}`;
    }
    const credentials = `${this.config.email}:${this.config.apiToken}`;
    return `Basic ${btoa(credentials)}`;
  }

  private get apiBaseUrl(): string {
    const apiBase = process.env.NEXT_PUBLIC_JIRA_API_BASE || "https://api.atlassian.com";
    const apiVersion = process.env.NEXT_PUBLIC_JIRA_API_VERSION || "3";
    
    if (this.config.authType === 'oauth' && this.config.cloudId) {
      return `${apiBase}/ex/jira/${this.config.cloudId}/rest/api/${apiVersion}`;
    }
    
    let url = (this.config.baseUrl || "").replace(/\/$/, "");
    const restPath = `/rest/api/${apiVersion}`;
    if (!url.includes(restPath)) {
      url += restPath;
    }
    return url;
  }

  public getAuthHeader(): string {
    return this.authHeader;
  }

  public getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  async getAccessibleResources(token: string): Promise<JiraResource[]> {
    const apiBase = process.env.NEXT_PUBLIC_JIRA_API_BASE || "https://api.atlassian.com";
    const response = await fetch(`${apiBase}/oauth/token/accessible-resources`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error("Failed to fetch accessible resources");
    return await response.json() as JiraResource[];
  }

  async refreshAccessToken(): Promise<{ access_token: string; refresh_token: string }> {
    if (!this.config.refreshToken) throw new Error("No refresh token available");

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const response = await fetch(`${basePath}/api/jira/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: this.config.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh access token");
    }

    return await response.json() as { access_token: string; refresh_token: string };
  }

  async testConnection(): Promise<JiraUser> {
    const response = await fetch(`${this.apiBaseUrl}/myself`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Connection failed: ${response.status} ${error}`);
    }

    return await response.json() as JiraUser;
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const response = await fetch(`${this.apiBaseUrl}/issue/${issueKey}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch issue ${issueKey}: ${response.status} ${error}`);
    }

    return await response.json() as JiraIssue;
  }

  async getProjectIssueTypes(projectId: string): Promise<JiraIssueType[]> {
    const CACHE_KEY = `jira_cache_issue_types_${projectId}`;
    const cached = cacheUtils.get<JiraIssueType[]>(CACHE_KEY);
    if (cached) return cached;

    const response = await fetch(`${this.apiBaseUrl}/issuetype/project?projectId=${projectId}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch project issue types: ${response.status}`);
    const data = await response.json() as JiraIssueType[];
    cacheUtils.set(CACHE_KEY, data, 3600 * 24 * 7); // 7 days cache
    return data;
  }

  async searchIssues(query: string, projectKey?: string): Promise<unknown[]> {
    if (!query || query.length < 1) return [];
    
    const jql = projectKey ? encodeURIComponent(`project = "${projectKey}"`) : "";
    const response = await fetch(`${this.apiBaseUrl.replace('/rest/api/3', '/rest/api/3/issue/picker')}?query=${encodeURIComponent(query)}&currentJql=${jql}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);
    interface PickerResponse {
      sections: { issues: unknown[] }[];
    }
    const data = await response.json() as PickerResponse;
    
    return data.sections.reduce((acc: unknown[], section) => {
      return [...acc, ...section.issues];
    }, []);
  }

  async getMyself(): Promise<JiraUser> {
    const response = await fetch(`${this.apiBaseUrl}/myself`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = new Error(`Jira API Error ${response.status}: Failed to get user profile`);
      (err as unknown as { status: number }).status = response.status;
      throw err;
    }
    return await response.json() as JiraUser;
  }

  async createSubtask(parentKey: string, summary: string, description?: string, dueDate?: string, startDate?: string, assigneeAccountId?: string): Promise<JiraIssue> {
    const parent = await this.getIssue(parentKey);
    const projectId = parent.fields.project.id;

    const issueTypes = await this.getProjectIssueTypes(projectId);
    const subtaskType = issueTypes.find(it => it.subtask === true);

    if (!subtaskType) {
      throw new Error("Could not find a valid Sub-task issue type in this project.");
    }

    const fields: Record<string, unknown> = {
      project: { id: projectId },
      parent: { key: parentKey },
      summary: summary,
      issuetype: { id: subtaskType.id },
    };

    if (description) {
      fields.description = textToADF(description);
    }

    if (dueDate) {
      fields.duedate = dueDate.split('T')[0];
    }
    
    if (startDate) {
      const fieldId = process.env.JIRA_START_DATE_FIELD || "customfield_10015";
      fields[fieldId] = startDate.split('T')[0];
    }
    
    if (assigneeAccountId) {
      fields.assignee = { accountId: assigneeAccountId };
    }

    const response = await fetch(`${this.apiBaseUrl}/issue`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create subtask: ${response.status} ${error}`);
    }

    return await response.json() as JiraIssue;
  }

  async updateIssue(issueKey: string, summary?: string, dueDate?: string, startDate?: string, assigneeAccountId?: string, description?: string, storyPoints?: number, pointsFieldId?: string): Promise<boolean> {
    const fields: Record<string, unknown> = {};
    
    if (summary) {
      fields.summary = summary;
    }

    if (description) {
      fields.description = textToADF(description);
    }
    
    if (dueDate) {
      fields.duedate = dueDate.split('T')[0];
    }
    
    if (startDate) {
      const fieldId = process.env.NEXT_PUBLIC_JIRA_START_DATE_FIELD || "customfield_10015";
      fields[fieldId] = startDate.split('T')[0];
    }

    if (storyPoints !== undefined) {
      const fieldId = pointsFieldId || process.env.NEXT_PUBLIC_JIRA_STORY_POINTS_FIELD || "customfield_10016";
      fields[fieldId] = storyPoints;
    }
    
    if (assigneeAccountId) {
      fields.assignee = { accountId: assigneeAccountId };
    }

    const response = await fetch(`${this.apiBaseUrl}/issue/${issueKey}`, {
      method: "PUT",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira API Error ${response.status}: Failed to update issue ${issueKey} - ${error}`);
    }

    return true;
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response = await fetch(`${this.apiBaseUrl}/issue/${issueKey}/transitions`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = new Error(`Jira API Error ${response.status}: Failed to fetch transitions`);
      (err as unknown as { status: number }).status = response.status;
      throw err;
    }
    const data = await response.json() as { transitions: JiraTransition[] };
    return data.transitions || [];
  }

  async transitionIssue(issueKey: string, transitionId: string, fields?: Record<string, unknown>): Promise<boolean> {
    const body: Record<string, unknown> = {
      transition: { id: transitionId },
    };
    
    if (fields && Object.keys(fields).length > 0) {
      body.fields = fields;
    }

    const response = await fetch(`${this.apiBaseUrl}/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to transition issue ${issueKey}: ${response.status} ${error}`);
    }
    return true;
  }

  async findUsers(query: string): Promise<JiraUser[]> {
    const response = await fetch(`${this.apiBaseUrl}/user/search?query=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];
    return await response.json() as JiraUser[];
  }

  async findStoryPointsField(): Promise<string | null> {
    const response = await fetch(`${this.apiBaseUrl}/field`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    
    if (!response.ok) return null;
    interface FieldResponse {
      id: string;
      name: string;
    }
    const fields = await response.json() as FieldResponse[];
    
    const spField = fields.find(f => 
      f.name === "Story Points" || 
      f.name === "Story point estimate" ||
      f.name === "Points"
    );
    
    return spField ? spField.id : null;
  }

  async searchIssuesByJql(jql: string, fields: string[] = ['summary']): Promise<{ issues: JiraIssue[] }> {
    const url = `${this.getApiBaseUrl()}/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields.join(',')}`;
    const response = await fetch(url, {
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira API Error ${response.status}: ${error}`);
    }

    return await response.json() as { issues: JiraIssue[] };
  }
}
