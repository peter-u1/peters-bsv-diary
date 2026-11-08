type StepperProps = {
  label: string;
  value: string | number;
  onChange: (direction: 1 | -1) => void;
  canDecrease: boolean;
  canIncrease: boolean;
  className?: string;
};

/** Kleine −/+ Einstellung, z. B. für Schriftgröße oder Listenbreite */
function Stepper({
  label,
  value,
  onChange,
  canDecrease,
  canIncrease,
  className = "",
}: StepperProps) {
  return (
    <div className={`stepper ${className}`}>
      <span className="stepper-label">{label}</span>
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={!canDecrease}
        aria-label={`${label} kleiner`}
      >
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={!canIncrease}
        aria-label={`${label} größer`}
      >
        +
      </button>
    </div>
  );
}

export default Stepper;
