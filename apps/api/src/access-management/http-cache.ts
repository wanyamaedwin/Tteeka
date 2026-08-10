export interface AccessManagementHttpResponse {
  setHeader(name: string, value: string): void;
}

export function setAccessManagementCacheHeaders(
  response: AccessManagementHttpResponse,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}
