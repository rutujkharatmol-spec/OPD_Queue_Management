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
