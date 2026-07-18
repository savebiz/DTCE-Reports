const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // 'l' excluded
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 'I', 'O' excluded
const DIGIT = '23456789'; // '0', '1' excluded
const SPECIAL = '!@#$%&*?-';

/**
 * Generates a random password of length 12 that complies with the password policy.
 * Excludes ambiguous characters (0, O, 1, l, I).
 */
export function generateCompliantPassword(): string {
  const length = 12;
  const passChars: string[] = [];

  // Guarantee at least one of each required character type is present
  passChars.push(LOWER[Math.floor(Math.random() * LOWER.length)]);
  passChars.push(UPPER[Math.floor(Math.random() * UPPER.length)]);
  passChars.push(DIGIT[Math.floor(Math.random() * DIGIT.length)]);
  passChars.push(SPECIAL[Math.floor(Math.random() * SPECIAL.length)]);

  const allAllowed = LOWER + UPPER + DIGIT + SPECIAL;
  for (let i = 0; i < length - 4; i++) {
    passChars.push(allAllowed[Math.floor(Math.random() * allAllowed.length)]);
  }

  // Shuffle using Fisher-Yates algorithm
  for (let i = passChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passChars[i], passChars[j]] = [passChars[j], passChars[i]];
  }

  return passChars.join('');
}

/**
 * Validates a password against the DTCE security rules.
 * Returns an object indicating validation success and specific feedback messages.
 */
export function validatePassword(
  password: string,
  username: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit.');
  }

  // Allowed special characters: ! @ # $ % & * ? -
  const specialPattern = /[!@#\$%&\*\?-]/;
  if (!specialPattern.test(password)) {
    errors.push('Password must contain at least one special character from: ! @ # $ % & * ? -');
  }

  if (username && username.trim().length > 0) {
    const userLower = username.toLowerCase().trim();
    if (password.toLowerCase().includes(userLower)) {
      errors.push('Password must not contain your username.');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
