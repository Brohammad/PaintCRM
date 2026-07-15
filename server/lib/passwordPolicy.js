// Password policy: at least 8 chars containing both a letter and a number.
// Returns an error string, or null when the password is acceptable.
function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number';
  }
  return null;
}

module.exports = { passwordPolicyError };
