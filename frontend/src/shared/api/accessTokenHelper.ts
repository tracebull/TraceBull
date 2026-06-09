const AUTHORIZED_USER_ID_KEY = 'tracebull_user_id';
const AUTHORIZED_TOKEN_KEY = 'tracebull_token';

export const accessTokenHelper = {
  saveUserId: (id: string) => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(AUTHORIZED_USER_ID_KEY, id);
  },

  getUserId: (): string | undefined => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    return localStorage.getItem(AUTHORIZED_USER_ID_KEY) || undefined;
  },

  clearUserId: () => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(AUTHORIZED_USER_ID_KEY);
  },

  isAuthenticated: (): boolean => {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    return !!localStorage.getItem(AUTHORIZED_USER_ID_KEY);
  },

  saveToken: (token: string) => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(AUTHORIZED_TOKEN_KEY, token);
  },

  getToken: (): string | undefined => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    return localStorage.getItem(AUTHORIZED_TOKEN_KEY) || undefined;
  },

  clearToken: () => {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(AUTHORIZED_TOKEN_KEY);
  },
};
