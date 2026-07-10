// Logging for the 1040 import path. Deliberately verbose while we tune the reader
// against real returns — everything the parser sees and every match decision goes
// to the console under a common prefix. A Form 1040 carries PII, so this defaults
// to on only for the local dev server and off in production builds; silence it
// further (e.g. in tests) with setImportLogging(false).

let enabled = import.meta.env.DEV

export function setImportLogging(on: boolean): void {
  enabled = on
}

export function ilog(...args: unknown[]): void {
  if (enabled) console.log('[1040 import]', ...args)
}
