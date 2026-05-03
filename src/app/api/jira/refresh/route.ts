import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    if (!process.env.JIRA_CLIENT_SECRET) {
      return NextResponse.json({ error: "Server configuration error: Missing JIRA_CLIENT_SECRET" }, { status: 500 });
    }
    const { refresh_token } = await request.json();

    const authUrl = process.env.NEXT_PUBLIC_JIRA_AUTH_URL || "https://auth.atlassian.com";
    const response = await fetch(`${authUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.NEXT_PUBLIC_JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error refreshing token:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
