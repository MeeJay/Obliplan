import axios from 'axios';

const TOKEN_KEY = 'obliplan_auth_token';

// Detect cross-site iframe (ObliTools shell) where cookies are blocked.
const isInIframe = (() => {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
})();

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  if (isInIframe) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) config.headers['X-Auth-Token'] = token;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (isInIframe) sessionStorage.removeItem(TOKEN_KEY);
      else if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export function storeSessionToken(token?: string): void {
  if (isInIframe && token) sessionStorage.setItem(TOKEN_KEY, token);
}

export { TOKEN_KEY, isInIframe };
export default apiClient;
