import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DropdownOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  renderLabel?: (option: DropdownOption<T>) => React.ReactNode;
}

/**
 * Generic dropdown component for selecting options
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  disabled,
  renderLabel,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedOption?.label || value}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[140px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="max-h-[240px] overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-gray-50 ${
                  value === option.value ? "bg-purple-50" : ""
                }`}
              >
                <div className="flex-1 text-left">
                  {renderLabel ? (
                    renderLabel(option)
                  ) : (
                    <>
                      <div className="text-sm text-gray-800">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-gray-500">{option.description}</div>
                      )}
                    </>
                  )}
                </div>
                {value === option.value && <Check className="h-4 w-4 text-purple-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
