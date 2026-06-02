import { http, HttpResponse } from 'msw';

export const handlers = [
  // Example Jira API mock
  http.get('https://*.atlassian.net/rest/api/3/issue/*', () => {
    return HttpResponse.json({
      id: '10001',
      key: 'MOCK-1',
      fields: {
        summary: 'Mock Issue',
        status: { name: 'To Do' },
      },
    });
  }),

  // Add more handlers for Miro SDK or other APIs as needed
];
