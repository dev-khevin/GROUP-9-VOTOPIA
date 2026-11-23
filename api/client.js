const TOKEN_KEY = 'campusvote_token';
const STUDENT_KEY = 'campusvote_student';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);

export const getStudent = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STUDENT_KEY));
  } catch {
    return null;
  }
};

export function saveSession(token, student) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(STUDENT_KEY, JSON.stringify(student));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STUDENT_KEY);
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}