const PRESENTATION_SEPARATORS = /[\s()-]/g;
const UGANDAN_NATIONAL_NUMBER = /^7\d{8}$/;

export function normalizeUgandaPhone(value: string): string | null {
  const compact = value.trim().replace(PRESENTATION_SEPARATORS, '');
  let nationalNumber: string;

  if (compact.startsWith('+256')) {
    nationalNumber = compact.slice(4);
  } else if (compact.startsWith('256')) {
    nationalNumber = compact.slice(3);
  } else if (compact.startsWith('0')) {
    nationalNumber = compact.slice(1);
  } else if (compact.startsWith('7')) {
    nationalNumber = compact;
  } else {
    return null;
  }

  return UGANDAN_NATIONAL_NUMBER.test(nationalNumber)
    ? `+256${nationalNumber}`
    : null;
}
