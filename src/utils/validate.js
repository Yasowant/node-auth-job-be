/**
 * Small boundary checks so malformed input is rejected with a clear 400 rather
 * than reaching Mongoose and surfacing as a cast or validation error.
 */

// Deliberately permissive: the only authority on whether an address exists is
// sending mail to it. This just rejects obvious nonsense.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

const isEmail = (value) =>
  typeof value === "string" && EMAIL_PATTERN.test(value.trim());

const isStrongEnough = (value) =>
  typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;

/** Returns an error message, or null when the credentials look usable. */
const validateCredentials = ({ email, password }) => {
  if (email !== undefined && !isEmail(email)) {
    return "A valid email address is required";
  }

  if (password !== undefined && !isStrongEnough(password)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return null;
};

module.exports = {
  isEmail,
  isStrongEnough,
  validateCredentials,
  MIN_PASSWORD_LENGTH,
};
