export type PasswordValidation = {
  valid: boolean;
  errors: string[];
};

export function validatePasswordStrength(password: string, requireStrong = true): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }
  if (requireStrong) {
    if (!/[A-Z]/.test(password)) errors.push("Include at least one uppercase letter.");
    if (!/[a-z]/.test(password)) errors.push("Include at least one lowercase letter.");
    if (!/[0-9]/.test(password)) errors.push("Include at least one number.");
    if (!/[^A-Za-z0-9]/.test(password)) errors.push("Include at least one special character.");
  }

  return { valid: errors.length === 0, errors };
}
