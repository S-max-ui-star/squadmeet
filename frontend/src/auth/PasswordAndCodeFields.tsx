import type { User } from '../api/auth'
import UsernameField from './UsernameField'

type Props = {
  user: User
  password: string
  onPassword: (password: string) => void
  code: string
  onCode: (code: string) => void
}

/** The password again, and with MFA a code, before a risky account action (SCRUM-28, SCRUM-33). */
export default function PasswordAndCodeFields({ user, password, onPassword, code, onCode }: Props) {
  return (
    <>
      <UsernameField nickname={user.nickname} />
      <label>
        Passwort
        <input
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          required
          autoFocus
          autoComplete="current-password"
        />
      </label>
      {user.mfa_enabled && (
        <label>
          Code aus der App oder Wiederherstellungscode
          <input
            value={code}
            onChange={(e) => onCode(e.target.value)}
            required
            autoComplete="one-time-code"
            placeholder="123456"
          />
        </label>
      )}
    </>
  )
}
