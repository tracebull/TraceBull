import RequestOptions from './RequestOptions';
import { accessTokenHelper } from './accessTokenHelper';

const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 3_000;

const handleOrThrowMessageIfResponseError = async (
  url: string,
  response: Response,
  handleNotAuthorizedError = true,
): Promise<void> => {
  if (handleNotAuthorizedError && response.status === 401) {
    accessTokenHelper.clearToken();
    accessTokenHelper.clearUserId();
    window.location.reload();
  }

  if (response.status === 502 || response.status === 504) {
    throw new Error('failed to fetch');
  }

  if (response.status >= 400 && response.status < 500) {
    let errorMessage: string | undefined;

    try {
      const json = (await response.json()) as { message?: string; error?: string };
      errorMessage = json.message || json.error;
    } catch {
      try {
        errorMessage = await response.text();
      } catch {
        /* ignore */
      }
    }

    throw new Error(errorMessage ?? `${url}: ${response.statusText}`);
  }
};

const makeRequest = async (
  url: string,
  optionsWrapper: RequestOptions,
  enableRetry: boolean,
  currentTry = 0,
): Promise<Response> => {
  try {
    const response = await fetch(url, optionsWrapper.toRequestInit());

    if (response.status >= 400 && response.status < 500) {
      await handleOrThrowMessageIfResponseError(url, response);
      return response;
    }

    if (response.status >= 500) {
      if (enableRetry && currentTry < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
        return makeRequest(url, optionsWrapper, enableRetry, currentTry + 1);
      }
      await handleOrThrowMessageIfResponseError(url, response);
      return response;
    }

    return response;
  } catch (e) {
    if (enableRetry && currentTry < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      return makeRequest(url, optionsWrapper, enableRetry, currentTry + 1);
    }
    throw e;
  }
};

const buildDefaultHeaders = (method: string): [string, string][] => {
  const headers: [string, string][] = [
    ['Content-Type', 'application/json'],
    ['Accept', 'application/json'],
  ];

  const methodOverride = method.toUpperCase();

  if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodOverride)) {
    headers.push(['Access-Control-Allow-Methods', methodOverride]);
  }

  const token = accessTokenHelper.getToken();
  if (token) {
    headers.push(['Authorization', 'Bearer ' + token]);
  }

  return headers;
};

export const apiHelper = {
  fetchPostJson: async <T>(
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<T> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('POST');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'POST')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.json();
  },

  fetchPostRaw: async (
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<string> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('POST');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'POST')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.text();
  },

  fetchPostBlob: async (
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<Blob> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('POST');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'POST')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.blob();
  },

  fetchGetJson: async <T>(
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<T> => {
    const options = requestOptions ?? new RequestOptions();
    for (const [name, value] of buildDefaultHeaders('GET')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.json();
  },

  fetchGetRaw: async (
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<string> => {
    const options = requestOptions ?? new RequestOptions();
    for (const [name, value] of buildDefaultHeaders('GET')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.text();
  },

  fetchGetBlob: async (
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<Blob> => {
    const options = requestOptions ?? new RequestOptions();
    for (const [name, value] of buildDefaultHeaders('GET')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.blob();
  },

  fetchPutJson: async <T>(
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<T> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('PUT');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'PUT')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.json();
  },

  fetchDeleteJson: async <T>(
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<T> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('DELETE');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'DELETE')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.json();
  },

  fetchDeleteRaw: async (
    url: string,
    requestOptions?: RequestOptions,
    isRetryOnError = false,
  ): Promise<string> => {
    const options = requestOptions ?? new RequestOptions();
    if (!options.getMethod()) options.setMethod('DELETE');
    for (const [name, value] of buildDefaultHeaders(options.getMethod() ?? 'DELETE')) {
      options.addHeader(name, value);
    }

    const response = await makeRequest(url, options, isRetryOnError);
    return response.text();
  },
};
