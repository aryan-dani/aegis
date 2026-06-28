export type Strength = {
  score: number;
  label: string;
  warning: string;
};

const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export function passwordStrength(password: string): Strength {
  if (!password) {
    return { score: 0, label: "No password", warning: "" };
  }

  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const repeated = /(.)\1{2,}/.test(password);
  const common = /(password|qwerty|admin|welcome|letmein|1234)/i.test(password);
  if (repeated || common) {
    score = Math.max(0, score - 2);
  }

  score = Math.min(4, score);

  return {
    score,
    label: labels[score] ?? "Unknown",
    warning: common
      ? "Avoid common words or keyboard patterns."
      : repeated
        ? "Avoid repeated characters."
        : "",
  };
}
