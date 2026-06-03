import { getApplicationServer } from '../../../constants';
import RequestOptions from '../../../shared/api/RequestOptions';
import { accessTokenHelper } from '../../../shared/api/accessTokenHelper';
import { apiHelper } from '../../../shared/api/apiHelper';
import type { GetQueryableFieldsRequest } from '../model/GetQueryableFieldsRequest';
import type { GetQueryableFieldsResponse } from '../model/GetQueryableFieldsResponse';
import type { LogQueryRequest } from '../model/LogQueryRequest';
import type { LogQueryResponse } from '../model/LogQueryResponse';
import type { LogsStats } from '../model/ProjectLogStats';

const parseSSEFrame = (frame: string): { event: string; data: string } | null => {
  const lines = frame.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
};

export const queryApi = {
  async executeQuery(projectId: string, request: LogQueryRequest): Promise<LogQueryResponse> {
    const requestOptions: RequestOptions = new RequestOptions();
    requestOptions.setBody(JSON.stringify(request));
    return apiHelper.fetchPostJson(
      `${getApplicationServer()}/api/v1/logs/query/execute/${projectId}`,
      requestOptions,
    );
  },

  async getQueryableFields(
    projectId: string,
    request?: GetQueryableFieldsRequest,
  ): Promise<GetQueryableFieldsResponse> {
    const requestOptions: RequestOptions = new RequestOptions();

    let url = `${getApplicationServer()}/api/v1/logs/query/fields/${projectId}`;
    if (request?.query) {
      const searchParams = new URLSearchParams({ query: request.query });
      url += `?${searchParams.toString()}`;
    }

    return apiHelper.fetchGetJson(url, requestOptions);
  },

  async getProjectStats(projectId: string): Promise<LogsStats> {
    const requestOptions: RequestOptions = new RequestOptions();
    return apiHelper.fetchGetJson(
      `${getApplicationServer()}/api/v1/logs/query/stats/${projectId}`,
      requestOptions,
    );
  },

  async getSystemStats(): Promise<LogsStats> {
    const requestOptions: RequestOptions = new RequestOptions();
    return apiHelper.fetchGetJson(
      `${getApplicationServer()}/api/v1/logs/query/system-stats`,
      requestOptions,
    );
  },

  async streamQuery(
    projectId: string,
    request: LogQueryRequest,
    options: {
      signal: AbortSignal;
      onLogs: (response: LogQueryResponse) => void;
    },
  ): Promise<void> {
    const response = await fetch(
      `${getApplicationServer()}/api/v1/logs/query/stream/${projectId}`,
      {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        cache: 'no-cache',
        body: JSON.stringify(request),
        signal: options.signal,
      },
    );

    if (response.status === 401) {
      accessTokenHelper.clearUserId();
      window.location.reload();
      return;
    }

    if (!response.ok) {
      let message = response.statusText;
      try {
        const json = (await response.json()) as { error?: string; message?: string };
        message = json.error || json.message || message;
      } catch {
        try {
          message = await response.text();
        } catch {
          /* ignore */
        }
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('Realtime stream is not supported by this browser');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let frameEnd = buffer.indexOf('\n\n');
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        const parsedFrame = parseSSEFrame(frame);
        if (parsedFrame?.event === 'logs') {
          options.onLogs(JSON.parse(parsedFrame.data) as LogQueryResponse);
        } else if (parsedFrame?.event === 'error') {
          const payload = JSON.parse(parsedFrame.data) as { error?: string };
          throw new Error(payload.error || 'Realtime stream failed');
        }

        frameEnd = buffer.indexOf('\n\n');
      }
    }
  },
};
