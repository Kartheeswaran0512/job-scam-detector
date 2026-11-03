// Third-party error messages can echo request details, so every error message from an API call goes
// through this before it is logged or sent to a client. It replaces the value of every *_KEY, *_TOKEN and
// *_SECRET environment variable. Values shorter than 8 characters are skipped: they are not real keys, and
// replacing them would mangle ordinary words (the tests use keys like "fake").
const SECRET_ENV_NAME = /(_KEY|_TOKEN|_SECRET)$/;

export function redactSecrets(text) {
  let out = String(text);
  for (const [name, value] of Object.entries(process.env)) {
    if (SECRET_ENV_NAME.test(name) && value && value.length >= 8) out = out.replaceAll(value, "[redacted]");
  }
  return out;
}
