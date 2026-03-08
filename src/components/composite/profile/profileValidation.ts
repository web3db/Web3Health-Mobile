export type ValidationStatus = "missing" | "invalid" | "valid";

export type ValidationResult = {
  status: ValidationStatus;
  message: string | null;
};

export type HeightUnit = "cm" | "in";
export type WeightUnit = "kg" | "lb";

export const PROFILE_LIMITS = {
  minAge: 13,
  maxAge: 120,

  metricHeightCm: { min: 50, max: 272 },
  imperialHeightIn: { min: 20, max: 107 },

  metricWeightKg: { min: 20, max: 300 },
  imperialWeightLb: { min: 44, max: 660 },
} as const;

export function getBirthYearBounds(nowYear = new Date().getFullYear()) {
  return {
    minYear: nowYear - PROFILE_LIMITS.maxAge,
    maxYear: nowYear - PROFILE_LIMITS.minAge,
  };
}

export function sanitizeYearInput(raw: string): string {
  return String(raw ?? "")
    .replace(/[^\d]/g, "")
    .slice(0, 4);
}

export function sanitizeDecimalInput(raw: string): string {
  const text = String(raw ?? "");

  // Keep digits and dot only.
  const cleaned = text.replace(/[^\d.]/g, "");

  // Keep only the first decimal point.
  const firstDot = cleaned.indexOf(".");
  const normalized =
    firstDot === -1
      ? cleaned
      : cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, "");

  // If user starts with ".", normalize to "0." so typing can continue naturally.
  if (normalized === ".") return "0.";
  if (normalized.startsWith(".")) return `0${normalized}`;

  return normalized;
}

export function isBlankText(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim().length === 0;
}

export function isIncompleteDecimalInput(
  raw: string | null | undefined,
): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;

  return /^\d+\.$/.test(text);
}

/**
 * Detect unsupported numeric formats before sanitization.
 * Useful for onboarding text inputs where we want to catch things like:
 * - 5'11
 * - 170cm
 * - 72kg
 * - 5 ft 11 in
 */
export function getRawIntegerFormatError(
  raw: string | null | undefined,
): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // Integer-only text, plain digits
  if (/^\d+$/.test(text)) return null;

  if (/[a-zA-Z]/.test(text)) {
    return "Enter digits only.";
  }

  if (/['"`]/.test(text) || /\bft\b/i.test(text) || /\bin\b/i.test(text)) {
    return "Enter a single numeric value only.";
  }

  if (/[.,]/.test(text)) {
    return "Enter a whole number.";
  }

  return "Enter digits only.";
}

export function getRawDecimalFormatError(
  raw: string | null | undefined,
  unitLabel?: string,
): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // Plain integer or decimal, including an in-progress trailing decimal like "174."
  // This is allowed during typing; final parsing decides whether it is complete.
  if (/^\d+(\.\d*)?$/.test(text)) return null;

  if (/['"`]/.test(text) || /\bft\b/i.test(text) || /\bin\b/i.test(text)) {
    return unitLabel
      ? `Enter a single numeric value in ${unitLabel}.`
      : "Enter a single numeric value only.";
  }

  if (/[a-zA-Z]/.test(text)) {
    return unitLabel
      ? `Enter numbers only, without typing ${unitLabel}.`
      : "Enter numbers only.";
  }

  if ((text.match(/\./g) ?? []).length > 1) {
    return "Enter a complete valid number.";
  }

  if (/,/.test(text)) {
    return "Enter a valid number without commas.";
  }

  return "Enter a complete valid number.";
}

export function parseOptionalInteger(
  raw: string | null | undefined,
): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  if (!/^\d+$/.test(text)) return null;

  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

export function parseOptionalDecimal(
  raw: string | null | undefined,
): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // Final valid decimal must not end with a trailing dot.
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function validateBirthYear(
  value: number | null | undefined,
  opts?: {
    required?: boolean;
    nowYear?: number;
    missingMessage?: string;
  },
): ValidationResult {
  const required = !!opts?.required;
  const missingMessage = opts?.missingMessage ?? "Birth year is required.";
  const nowYear = opts?.nowYear ?? new Date().getFullYear();

  if (value == null) {
    return {
      status: "missing",
      message: required ? missingMessage : null,
    };
  }

  if (!Number.isInteger(value)) {
    return {
      status: "invalid",
      message: "Birth year must be a whole number.",
    };
  }

  const { minYear, maxYear } = getBirthYearBounds(nowYear);

  if (value < minYear || value > maxYear) {
    return {
      status: "invalid",
      message: `Enter a valid birth year between ${minYear} and ${maxYear}.`,
    };
  }

  return { status: "valid", message: null };
}

export function validateHeight(
  value: number | null | undefined,
  unit: HeightUnit | null | undefined,
  opts?: {
    required?: boolean;
    missingMessage?: string;
  },
): ValidationResult {
  const required = !!opts?.required;
  const missingMessage = opts?.missingMessage ?? "Height is required.";

  if (value == null) {
    return {
      status: "missing",
      message: required ? missingMessage : null,
    };
  }

  if (!Number.isFinite(value)) {
    return {
      status: "invalid",
      message: "Height must be a valid number.",
    };
  }

  if (value <= 0) {
    return {
      status: "invalid",
      message: "Height must be greater than 0.",
    };
  }

  if (!unit) {
    return {
      status: "invalid",
      message: "Select a measurement system first.",
    };
  }

  if (unit === "cm") {
    const { min, max } = PROFILE_LIMITS.metricHeightCm;
    if (value < min || value > max) {
      return {
        status: "invalid",
        message: `Height must be between ${min} and ${max} cm.`,
      };
    }
  }

  if (unit === "in") {
    const { min, max } = PROFILE_LIMITS.imperialHeightIn;
    if (value < min || value > max) {
      return {
        status: "invalid",
        message: `Height must be between ${min} and ${max} in.`,
      };
    }
  }

  return { status: "valid", message: null };
}

export function validateWeight(
  value: number | null | undefined,
  unit: WeightUnit | null | undefined,
  opts?: {
    required?: boolean;
    missingMessage?: string;
  },
): ValidationResult {
  const required = !!opts?.required;
  const missingMessage = opts?.missingMessage ?? "Weight is required.";

  if (value == null) {
    return {
      status: "missing",
      message: required ? missingMessage : null,
    };
  }

  if (!Number.isFinite(value)) {
    return {
      status: "invalid",
      message: "Weight must be a valid number.",
    };
  }

  if (value <= 0) {
    return {
      status: "invalid",
      message: "Weight must be greater than 0.",
    };
  }

  if (!unit) {
    return {
      status: "invalid",
      message: "Select a measurement system first.",
    };
  }

  if (unit === "kg") {
    const { min, max } = PROFILE_LIMITS.metricWeightKg;
    if (value < min || value > max) {
      return {
        status: "invalid",
        message: `Weight must be between ${min} and ${max} kg.`,
      };
    }
  }

  if (unit === "lb") {
    const { min, max } = PROFILE_LIMITS.imperialWeightLb;
    if (value < min || value > max) {
      return {
        status: "invalid",
        message: `Weight must be between ${min} and ${max} lb.`,
      };
    }
  }

  return { status: "valid", message: null };
}

export function canShowAge(
  birthYear: number | null | undefined,
  nowYear = new Date().getFullYear(),
): boolean {
  return (
    validateBirthYear(birthYear, { required: false, nowYear }).status ===
    "valid"
  );
}

export function canShowBMI(params: {
  heightValue: number | null | undefined;
  heightUnit: HeightUnit | null | undefined;
  weightValue: number | null | undefined;
  weightUnit: WeightUnit | null | undefined;
}): boolean {
  const heightCheck = validateHeight(params.heightValue, params.heightUnit, {
    required: false,
  });
  const weightCheck = validateWeight(params.weightValue, params.weightUnit, {
    required: false,
  });

  return heightCheck.status === "valid" && weightCheck.status === "valid";
}

export function getMissingHelperText(fieldLabel: string): string {
  return `${fieldLabel} not added.`;
}

export function getIncompleteDecimalMessage(fieldLabel: string): string {
  return `${fieldLabel} looks incomplete. Add a digit after the decimal point.`;
}

export function getBMIMissingHelperText(): string {
  return "Enter height and weight to calculate BMI. Decimals are allowed.";
}
