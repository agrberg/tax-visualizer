import type { ParsedReturn } from './parsedReturn'

/**
 * Read income values out of a Form 1040 PDF.
 *
 * Stub for now — this is the seam. PR2 replaces the body with pdf.js text
 * extraction (plus heavy logging of what the reader sees), while the signature
 * and return type stay fixed so the intake/review UI in ImportReturn.tsx doesn't
 * have to change.
 */
export async function parse1040(_file: File): Promise<ParsedReturn> {
  return {
    fields: {},
    provenance: {},
    warnings: ["Reading your 1040 isn't wired up yet — coming soon."],
  }
}
