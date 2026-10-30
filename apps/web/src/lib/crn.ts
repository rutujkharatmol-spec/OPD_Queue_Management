/**
 * A CR No (Central Registration Number, stored as `uhid`) as it is saved and matched.
 *
 * The booklet's number is 15 digits ("199192300897363"). A barcode scan sends it as is; a
 * person typing it may add spaces ("1991 9230 0897 363"). Spaces are removed and letters
 * capitalised, so a typed number and a scanned one always find the same patient.
 */
export function normalizeCrn(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * A CR No is digits only. The booklet barcode (Code 39) has no check digit, so a camera
 * or scanner can misread one bar group as a letter ("1Y9199300897363" for
 * "199199300897363"); anything with a letter is a misread, never a real CR No.
 * The length is kept loose (6–20) in case older booklets used shorter numbers.
 */
export function isValidCrn(value?: string | null): boolean {
  return /^\d{6,20}$/.test(normalizeCrn(value));
}

export const INVALID_CRN_MESSAGE = 'A CR No has digits only. Please scan again, or check the number and type it.';
