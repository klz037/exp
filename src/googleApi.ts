export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  parent?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

interface ListResponse<T> {
  items?: T[];
  nextPageToken?: string;
}

export class GoogleApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

type TokenProvider = (interactive: boolean) => Promise<string>;
type TokenInvalidator = (token: string) => Promise<void>;

export class GoogleApiClient {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly invalidateToken: TokenInvalidator,
  ) {}

  async listTaskLists(): Promise<GoogleTaskList[]> {
    return this.getAllPages<GoogleTaskList>(
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    );
  }

  async listTasks(listId: string): Promise<GoogleTask[]> {
    const url = new URL(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    );
    url.searchParams.set('showHidden', 'true');
    return this.getAllPages<GoogleTask>(url.toString());
  }

  async patchTask(
    listId: string,
    taskId: string,
    status: GoogleTask['status'],
  ): Promise<GoogleTask> {
    const url = new URL(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    );
    return this.request<GoogleTask>(url.toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        completed: status === 'completed' ? new Date().toISOString() : null,
      }),
    });
  }

  async getTodayEvents(now = new Date()): Promise<GoogleCalendarEvent[]> {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', start.toISOString());
    url.searchParams.set('timeMax', end.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    return this.getAllPages<GoogleCalendarEvent>(url.toString());
  }

  private async getAllPages<T>(baseUrl: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(baseUrl);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.get<ListResponse<T>>(url.toString());
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async get<T>(url: string): Promise<T> {
    return this.request<T>(url);
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let token = await this.getToken(false);
    const fetchWithToken = (accessToken: string) => fetch(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: `Bearer ${accessToken}`,
      },
    });
    let response = await fetchWithToken(token);

    if (response.status === 401) {
      await this.invalidateToken(token);
      token = await this.getToken(false);
      response = await fetchWithToken(token);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as
        | { error?: { message?: string } }
        | undefined;
      const detail = body?.error?.message;
      if (response.status === 401) {
        throw new GoogleApiError('Your Google session needs refreshing. Select Sign in to reconnect.', 401);
      }
      if (response.status === 403) {
        throw new GoogleApiError('Google denied access. Check that Calendar and Tasks APIs are enabled and the requested scopes were approved.', 403);
      }
      throw new GoogleApiError(detail || `Google API request failed (${response.status}).`, response.status);
    }

    return response.json() as Promise<T>;
  }
}
