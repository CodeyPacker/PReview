// Strips credentials from anything that is about to be logged.

const REDACTED = '[REDACTED]';

const SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub fine-grained tokens
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic API keys
  /\b(?:Bearer|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi, // Authorization header values
];

const SECRET_KEYS =
  /^(?:authorization|token|access_?token|refresh_?token|api_?key|password|secret|client_?secret)$/i;

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);

  if (value instanceof Error) {
    const copy = new Error(redactString(value.message));
    copy.name = value.name;
    if (value.stack) copy.stack = redactString(value.stack);
    return copy;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? REDACTED : redact(item, seen),
      ]),
    );
  }

  return value;
}
