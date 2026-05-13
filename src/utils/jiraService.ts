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

// Helper to convert Plain Text (with newlines, links, and bullets) to Jira ADF
export function textToADF(text: string) {

  const content: any[] = [];
  const lines = text.split('\n');

  let currentList: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentList) { content.push(currentList); currentList = null; }
      content.push({ type: "paragraph", content: [] });
      continue;
    }

    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    const isNumbered = /^\d+\.\s/.test(trimmed);

    const inlineContent: any[] = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match;

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
      currentList.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineContent.length ? inlineContent : [] }] });
    } else if (isNumbered) {
      if (!currentList || currentList.type !== 'orderedList') {
        if (currentList) content.push(currentList);
        currentList = { type: 'orderedList', content: [] };
      }
      currentList.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineContent.length ? inlineContent : [] }] });
    } else {
      if (currentList) { content.push(currentList); currentList = null; }
      content.push({ type: "paragraph", content: inlineContent.length ? inlineContent : [] });
    }
  }

  if (currentList) content.push(currentList);
  return { type: "doc", version: 1, content: content.length > 0 ? content : [{ type: "paragraph", content: [] }] };
}

import { cacheUtils } from './cacheUtils';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    project: {
      id: string;
      key: string;
    };
    issuetype: {
      id: string;
      name: string;
      subtask: boolean;
    };
  };
}

export class JiraService {
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
  }

  private get authHeader() {
    if (this.config.authType === 'oauth' && this.config.accessToken) {
      return `Bearer ${this.config.accessToken}`;
    }
    const credentials = `${this.config.email}:${this.config.apiToken}`;
    return `Basic ${btoa(credentials)}`;
  }

  private get apiBaseUrl() {
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

  async getAccessibleResources(token: string) {
    const apiBase = process.env.NEXT_PUBLIC_JIRA_API_BASE || "https://api.atlassian.com";
    const response = await fetch(`${apiBase}/oauth/token/accessible-resources`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error("Failed to fetch accessible resources");
    return await response.json();
  }

  async refreshAccessToken() {
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

    return await response.json();
  }

  async testConnection() {
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

    return await response.json();
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

    return await response.json();
  }

  async getProjectIssueTypes(projectId: string) {
    const CACHE_KEY = `jira_cache_issue_types_${projectId}`;
    const cached = cacheUtils.get<any[]>(CACHE_KEY);
    if (cached) return cached;

    // Note: This endpoint might vary depending on Jira version, but /issuetype/project is standard for Cloud
    const response = await fetch(`${this.apiBaseUrl}/issuetype/project?projectId=${projectId}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch project issue types: ${response.status}`);
    const data = await response.json();
    cacheUtils.set(CACHE_KEY, data, 3600 * 24 * 7); // 7 days cache
    return data;
  }

  async searchIssues(query: string, projectKey?: string): Promise<any[]> {
    if (!query || query.length < 1) return [];
    
    // Scoping to project if provided
    const jql = projectKey ? encodeURIComponent(`project = "${projectKey}"`) : "";
    
    // Using Issue Picker API for better search/autocomplete experience
    const response = await fetch(`${this.apiBaseUrl.replace('/rest/api/3', '/rest/api/3/issue/picker')}?query=${encodeURIComponent(query)}&currentJql=${jql}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);
    const data = await response.json();
    
    // Issue Picker returns sections (usually "History Search" and "Current Search")
    const allIssues = data.sections.reduce((acc: any[], section: any) => {
      return [...acc, ...section.issues];
    }, []);
    
    return allIssues;
  }

  async getMyself() {
    const response = await fetch(`${this.apiBaseUrl}/myself`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = new Error(`Jira API Error ${response.status}: Failed to get user profile`);
      (err as any).status = response.status;
      throw err;
    }
    return await response.json();
  }

  async createSubtask(parentKey: string, summary: string, description?: string, dueDate?: string, startDate?: string, assigneeAccountId?: string) {
    // 1. Get parent issue to find project
    const parent = await this.getIssue(parentKey);
    const projectId = parent.fields.project.id;

    // 2. Find a valid subtask issue type for this project
    const issueTypes = await this.getProjectIssueTypes(projectId);
    const subtaskType = issueTypes.find((it: any) => it.subtask === true);

    if (!subtaskType) {
      throw new Error("Could not find a valid Sub-task issue type in this project.");
    }

    const fields: any = {
      project: {
        id: projectId,
      },
      parent: {
        key: parentKey,
      },
      summary: summary,
      issuetype: {
        id: subtaskType.id, // Use ID instead of hardcoded name
      },
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

    // 3. Create subtask using the correct issue type ID
    const response = await fetch(`${this.apiBaseUrl}/issue`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: fields,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create subtask: ${response.status} ${error}`);
    }

    return await response.json();
  }

  async updateIssue(issueKey: string, summary: string, dueDate?: string, startDate?: string, assigneeAccountId?: string, description?: string) {
    const fields: any = {
      summary: summary,
    };

    if (description) {
      fields.description = textToADF(description);
    }
    
    if (dueDate) {
      fields.duedate = dueDate.split('T')[0];
    }
    
    // Use configurable field ID for Start Date (default: customfield_10015)
    if (startDate) {
      const fieldId = process.env.JIRA_START_DATE_FIELD || "customfield_10015";
      fields[fieldId] = startDate.split('T')[0];
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
      body: JSON.stringify({
        fields: fields,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira API Error ${response.status}: Failed to update issue ${issueKey} - ${error}`);
    }

    return true;
  }

  async getTransitions(issueKey: string): Promise<any[]> {
    const response = await fetch(`${this.apiBaseUrl}/issue/${issueKey}/transitions`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = new Error(`Jira API Error ${response.status}: Failed to fetch transitions`);
      (err as any).status = response.status;
      throw err;
    }
    const data = await response.json();
    return data.transitions || [];
  }

  async transitionIssue(issueKey: string, transitionId: string, fields?: any) {
    const body: any = {
      transition: {
        id: transitionId,
      },
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

  async findUsers(query: string): Promise<any[]> {
    const response = await fetch(`${this.apiBaseUrl}/user/search?query=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];
    return await response.json();
  }
}
