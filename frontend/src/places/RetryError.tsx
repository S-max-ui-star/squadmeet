type Props = { message: string; onRetry: () => void }

// A failed load in the Place detail, with the button that tries again (SCRUM-156, 157, 161).
export default function RetryError({ message, onRetry }: Props) {
  return (
    <p className="form-error">
      {message}{' '}
      <button type="button" className="link-button" onClick={onRetry}>
        Erneut laden
      </button>
    </p>
  )
}
