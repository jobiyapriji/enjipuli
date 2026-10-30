/**
 * Email Validation Utility
 *
 * Validates that an input string is a properly formatted email address.
 * Accepts any valid email address (e.g. personal Gmail, Outlook, or institutional email).
 * Rejects malformed input with a clear, user-friendly error message.
 */

export function validateStudentEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  const trimmed = email.trim().toLowerCase();

  if (!trimmed || !trimmed.includes('@')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  // Standard RFC email structure check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].includes(' ') || parts[1].includes(' ')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  return { valid: true };
}

export const validateEmail = validateStudentEmail;
