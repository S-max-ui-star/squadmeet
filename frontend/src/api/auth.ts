export type User = {
  id: number
  nickname: string
  avatar: string
  mfa_enabled: boolean
  is_admin: boolean
}

export type LoginResult = {
  token: string
  user: User
}

export type RegisterResult = LoginResult & {
  // Shown once. The server keeps only the hashes.
  recovery_codes: string[]
}

export type RegisterInput = {
  nickname: string
  password: string
  avatar: string
  is_adult: boolean
  // From the Turnstile widget (SCRUM-27).
  turnstile_token: string | null
}

export type MfaSetup = {
  // For manual entry when the QR code cannot be scanned.
  secret: string
  otpauth_uri: string
  // An SVG data URI for <img src>.
  qr_code: string
}

/** Login needs a code from the authenticator app (or a Recovery code) as well. */
export class MfaRequiredError extends Error {
  constructor() {
    super('Bitte gib den Code aus deiner Authenticator-App ein.')
  }
}

/** Too many failed logins for this Nickname: login needs the captcha as well (SCRUM-27). */
export class CaptchaRequiredError extends Error {
  constructor() {
    super('Zu viele Fehlversuche. Bitte bestätige zuerst, dass du kein Bot bist.')
  }
}

const MFA_REQUIRED = 'mfa_required'
const CAPTCHA_REQUIRED = 'captcha_required'

const TOKEN_KEY = 'squadmeet.token'

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// The API sends German messages for errors the user can fix (wrong password, Nickname taken).
async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null)
  if (typeof body?.detail === 'string') {
    return body.detail
  }
  if (response.status === 422) {
    return 'Bitte prüfe deine Eingaben.'
  }
  return `Fehler ${response.status}`
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const message = await errorMessage(response)
    if (message === MFA_REQUIRED) throw new MfaRequiredError()
    if (message === CAPTCHA_REQUIRED) throw new CaptchaRequiredError()
    throw new Error(message)
  }
  return response.json()
}

export function register(input: RegisterInput): Promise<RegisterResult> {
  return postJson('/api/auth/register', input)
}

/**
 * `code` is needed only when MFA is on; without it, a user with MFA gets MfaRequiredError.
 * `turnstileToken` is needed only after failed logins; without it, CaptchaRequiredError.
 */
export function login(
  nickname: string,
  password: string,
  code?: string,
  turnstileToken?: string,
): Promise<LoginResult> {
  return postJson('/api/auth/login', {
    nickname,
    password,
    ...(code && { code }),
    ...(turnstileToken && { turnstile_token: turnstileToken }),
  })
}

export type PasswordResetInput = {
  nickname: string
  // A Recovery code, or the current code from the authenticator app when MFA is on.
  code: string
  new_password: string
  turnstile_token: string | null
}

/** A forgotten password (SCRUM-33). Ends all old sessions; the answer is a new one. */
export function resetPassword(input: PasswordResetInput): Promise<LoginResult> {
  return postJson('/api/auth/password-reset', input)
}

/**
 * A new set of Recovery codes; the old set stops working. The password is asked again;
 * `code` is needed only when MFA is on.
 */
export async function newRecoveryCodes(
  token: string,
  password: string,
  code?: string,
): Promise<string[]> {
  const body = await postJson<{ recovery_codes: string[] }>(
    '/api/auth/recovery-codes',
    { password, ...(code && { code }) },
    token,
  )
  return body.recovery_codes
}

/** The public Turnstile key from the server; null when the server has none. */
export async function fetchCaptchaSiteKey(): Promise<string | null> {
  const response = await fetch('/api/auth/captcha')
  if (!response.ok) {
    throw new Error(`GET /api/auth/captcha failed: ${response.status}`)
  }
  return (await response.json()).site_key
}

/** A new secret for the authenticator app. MFA is on only after mfaEnable. The password is asked again. */
export function mfaSetup(token: string, password: string): Promise<MfaSetup> {
  return postJson('/api/auth/mfa/setup', { password }, token)
}

export function mfaEnable(token: string, code: string): Promise<User> {
  return postJson('/api/auth/mfa/enable', { code }, token)
}

/** `code` from the authenticator app or a Recovery code. The password is asked again. */
export function mfaDisable(token: string, password: string, code: string): Promise<User> {
  return postJson('/api/auth/mfa/disable', { password, code }, token)
}

/**
 * Deletes the account and all its data (SCRUM-28). The password is asked again; `code` is
 * needed only when MFA is on (from the app or a Recovery code).
 */
export async function deleteAccount(token: string, password: string, code?: string): Promise<void> {
  const response = await fetch('/api/auth/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password, ...(code && { code }) }),
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response))
  }
}

export async function logout(token: string): Promise<void> {
  // A 401 means the session already ended on the server; the client clears its token anyway.
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** The logged-in user, or null when the token is no longer valid. */
export async function fetchMe(token: string): Promise<User | null> {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new Error(`GET /api/auth/me failed: ${response.status}`)
  }
  return response.json()
}
