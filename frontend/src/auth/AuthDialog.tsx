import { useEffect, useRef, useState, type FormEvent } from 'react'
import Dialog from '../Dialog'
import {
  CaptchaRequiredError,
  login,
  MfaRequiredError,
  register,
  resetPassword,
  type LoginResult,
  type RegisterResult,
} from '../api/auth'
import { AVATARS } from './avatars'
import RecoveryCodes from './RecoveryCodes'
import Turnstile from './Turnstile'
import LegalLinks from '../legal/LegalLinks'

type Props = {
  onLoggedIn: (result: LoginResult) => void
  onClose: () => void
}

type Mode = 'login' | 'register' | 'reset'

const TITLES: Record<Mode, string> = {
  login: 'Anmelden',
  register: 'Registrieren',
  reset: 'Passwort zurücksetzen',
}

type AuthRequest = {
  mode: Mode
  nickname: string
  password: string
  avatar: string
  isAdult: boolean
  code: string
  needsCode: boolean
  captchaToken: string | null
}

function requestAuthentication(request: AuthRequest): Promise<LoginResult | RegisterResult> {
  const { mode, nickname, password, avatar, isAdult, code, needsCode, captchaToken } = request
  const token = captchaToken ?? undefined
  if (mode === 'login') {
    return login(nickname, password, needsCode ? code : undefined, token)
  }
  if (mode === 'reset') {
    return resetPassword({
      nickname,
      code,
      new_password: password,
      turnstile_token: captchaToken,
    })
  }
  return register({ nickname, password, avatar, is_adult: isAdult, turnstile_token: captchaToken })
}

function isCurrentRequest(mounted: boolean, request: number, currentRequest: number) {
  return mounted && request === currentRequest
}

function applyAuthenticationError(
  error: unknown,
  usedCaptcha: boolean,
  actions: {
    requireMfa: () => void
    requireCaptcha: () => void
    refreshCaptcha: () => void
    showError: (message: string) => void
  },
) {
  if (error instanceof MfaRequiredError) actions.requireMfa()
  if (error instanceof CaptchaRequiredError) actions.requireCaptcha()
  if (usedCaptcha) actions.refreshCaptcha()
  actions.showError((error as Error).message)
}

function AuthFields({
  mode,
  nickname,
  password,
  code,
  needsCode,
  onNickname,
  onPassword,
  onCode,
}: {
  mode: Mode
  nickname: string
  password: string
  code: string
  needsCode: boolean
  onNickname: (value: string) => void
  onPassword: (value: string) => void
  onCode: (value: string) => void
}) {
  return (
    <>
      {mode === 'reset' && (
        <p>
          Gib einen deiner Wiederherstellungscodes ein. Mit Zwei-Faktor-Anmeldung geht auch der
          Code aus deiner Authenticator-App. Ohne beides können wir dein Konto nicht
          wiederherstellen.
        </p>
      )}
      <label>
        Nickname
        <input
          value={nickname}
          onChange={(event) => onNickname(event.target.value)}
          required
          autoComplete="username"
          {...(mode === 'register' && {
            pattern: '[A-Za-z0-9_\\-]{3,20}',
            title: '3–20 Zeichen: Buchstaben, Ziffern, _ und -',
          })}
        />
      </label>
      {mode === 'reset' && (
        <label>
          Wiederherstellungscode oder Code aus der App
          <input
            value={code}
            onChange={(event) => onCode(event.target.value)}
            required
            autoComplete="one-time-code"
            placeholder="ABCD-EFGH-JKMN-PQRS"
          />
        </label>
      )}
      <label>
        {mode === 'reset' ? 'Neues Passwort' : 'Passwort'}
        <input
          type="password"
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          {...(mode !== 'login' && { minLength: 8, maxLength: 128 })}
        />
      </label>
      {mode === 'login' && needsCode && (
        <label>
          Code aus der Authenticator-App
          <input
            value={code}
            onChange={(event) => onCode(event.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            placeholder="123456"
          />
          <small>Kein Zugriff auf die App? Gib einen Wiederherstellungscode ein.</small>
        </label>
      )}
    </>
  )
}

function RegistrationFields({
  visible,
  avatar,
  isAdult,
  onAvatar,
  onAdult,
}: {
  visible: boolean
  avatar: string
  isAdult: boolean
  onAvatar: (value: string) => void
  onAdult: (value: boolean) => void
}) {
  if (!visible) return null
  return (
    <>
      <fieldset className="avatars">
        <legend>Avatar</legend>
        {Object.entries(AVATARS).map(([key, { emoji, label }]) => (
          <label key={key} title={label} className={key === avatar ? 'selected' : ''}>
            <input
              type="radio"
              name="avatar"
              value={key}
              checked={key === avatar}
              onChange={() => onAvatar(key)}
            />
            <span aria-label={label}>{emoji}</span>
          </label>
        ))}
      </fieldset>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={isAdult}
          onChange={(event) => onAdult(event.target.checked)}
          required
        />
        Ich bin 18 Jahre oder älter
      </label>
    </>
  )
}

function AuthActions({
  mode,
  busy,
  captchaMissing,
  switchMode,
  onClose,
}: {
  mode: Mode
  busy: boolean
  captchaMissing: boolean
  switchMode: (mode: Mode) => void
  onClose: () => void
}) {
  return (
    <>
      <button type="submit" disabled={busy || captchaMissing}>
        {TITLES[mode]}
      </button>
      <button
        type="button"
        className="link"
        disabled={busy}
        onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
      </button>
      {mode === 'login' && (
        <button type="button" className="link" disabled={busy} onClick={() => switchMode('reset')}>
          Passwort vergessen?
        </button>
      )}
      <button type="button" className="link" disabled={busy} onClick={onClose}>
        Abbrechen
      </button>
    </>
  )
}

export default function AuthDialog({ onLoggedIn, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState('fox')
  const [isAdult, setIsAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState<RegisterResult | null>(null)
  // True after the server answered that this user has MFA on (SCRUM-26).
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState('')
  // Captcha (SCRUM-27): always at registration and reset; at login after the server asked for it.
  const [loginNeedsCaptcha, setLoginNeedsCaptcha] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // A token works once, so each try gets a new widget (a new key mounts a new one).
  const [captchaRound, setCaptchaRound] = useState(0)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)
  const showCaptcha = mode !== 'login' || loginNeedsCaptcha

  useEffect(
    () => () => {
      mountedRef.current = false
      requestRef.current += 1
    },
    [],
  )

  function newCaptcha() {
    setCaptchaToken(null)
    setCaptchaRound((round) => round + 1)
  }

  function switchMode(next: Mode) {
    if (busy) return
    requestRef.current += 1
    setMode(next)
    setError(null)
    setNeedsCode(false)
    setCode('')
    setCaptchaToken(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const request = ++requestRef.current
    try {
      const result = await requestAuthentication({
        mode, nickname, password, avatar, isAdult, code, needsCode, captchaToken,
      })
      if (!isCurrentRequest(mountedRef.current, request, requestRef.current)) return
      if (mode === 'register') setRegistered(result as RegisterResult)
      else onLoggedIn(result)
    } catch (err) {
      if (!isCurrentRequest(mountedRef.current, request, requestRef.current)) return
      applyAuthenticationError(err, Boolean(captchaToken), {
        requireMfa: () => setNeedsCode(true),
        requireCaptcha: () => setLoginNeedsCaptcha(true),
        refreshCaptcha: newCaptcha,
        showError: setError,
      })
    } finally {
      if (isCurrentRequest(mountedRef.current, request, requestRef.current)) setBusy(false)
    }
  }

  function close() {
    if (busy) return
    requestRef.current += 1
    onClose()
  }

  if (registered) {
    return (
      <RecoveryCodes
        codes={registered.recovery_codes}
        onConfirmed={() => onLoggedIn(registered)}
      />
    )
  }

  return (
    <Dialog title={TITLES[mode]} onSubmit={submit} onClose={close} dismissible={!busy}>
      <AuthFields
        mode={mode}
        nickname={nickname}
        password={password}
        code={code}
        needsCode={needsCode}
        onNickname={setNickname}
        onPassword={setPassword}
        onCode={setCode}
      />
      <RegistrationFields
        visible={mode === 'register'}
        avatar={avatar}
        isAdult={isAdult}
        onAvatar={setAvatar}
        onAdult={setIsAdult}
      />
      {showCaptcha && <Turnstile key={`${mode}-${captchaRound}`} onToken={setCaptchaToken} />}
      {error && <p className="form-error">{error}</p>}
      <AuthActions
        mode={mode}
        busy={busy}
        captchaMissing={showCaptcha && !captchaToken}
        switchMode={switchMode}
        onClose={close}
      />
      <LegalLinks className="legal-links-inline" />
    </Dialog>
  )
}
