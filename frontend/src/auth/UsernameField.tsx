/**
 * The nickname as a hidden username field for a password form of a signed-in user.
 * Safari (Apple Passwords) fills a saved password only next to a username field (SCRUM-91).
 * Put it before the password field. It is not visible and not reachable with Tab.
 */
export default function UsernameField({ nickname }: { nickname: string }) {
  return (
    <input
      className="visually-hidden"
      type="text"
      name="username"
      value={nickname}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      autoComplete="username"
    />
  )
}
