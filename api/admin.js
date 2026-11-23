const TOKEN_KEY = 'campusvote_admin_token';
const NAME_KEY = 'campusvote_admin_name';
const DEPARTMENT_KEY = 'campusvote_admin_department';

export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY);
export const getAdminName = () => sessionStorage.getItem(NAME_KEY);
export const getAdminDepartment = () =>
  sessionStorage.getItem(DEPARTMENT_KEY) || 'LEGACY';

export function saveAdminDepartment(departmentId) {
  sessionStorage.setItem(DEPARTMENT_KEY, departmentId);
}

export function saveAdminSession(token, username) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(NAME_KEY, username);
  sessionStorage.setItem(DEPARTMENT_KEY, 'LEGACY');
}

export function clearAdminSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(NAME_KEY);
  sessionStorage.removeItem(DEPARTMENT_KEY);
}

export async function adminApi(path, { method = 'GET', body } = {}) {
  const token = getAdminToken();
  const res = await fetch('/api/admin' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      'X-Department': getAdminDepartment(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
export async function adminUpload(path, formData) {
  const token = getAdminToken();
  const res = await fetch('/api/admin' + path, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      'X-Department': getAdminDepartment(),
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Upload failed.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}