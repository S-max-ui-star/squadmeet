const MAX_PARTY_SIZE = 10

// The Party size, the user included (1–10), for a new Meetup and for a Join.
export default function PartySizeStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label="Personenzahl (mit dir)">
      <span>Personenzahl (mit dir)</span>
      <button type="button" aria-label="Eine Person weniger" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        aria-label="Eine Person mehr"
        disabled={value >= MAX_PARTY_SIZE}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}
