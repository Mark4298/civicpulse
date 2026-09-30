const steps = ["What happened", "Details", "Where", "Review & send"];

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <nav aria-label="Report progress" className="mb-6">
      <div
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Report completion"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={currentStep}
      >
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${(currentStep / steps.length) * 100}%` }}
        />
      </div>
      <ol className="grid grid-cols-4 gap-1 text-center">
        {steps.map((step, index) => {
          const number = index + 1;
          return (
            <li
              className={`min-w-0 text-[10px] leading-tight sm:text-xs ${
                number === currentStep ? "font-semibold text-cyan-200" : "text-slate-400"
              }`}
              aria-current={number === currentStep ? "step" : undefined}
              key={step}
            >
              <span className="block truncate">{step}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
