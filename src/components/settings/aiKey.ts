import { ApiError, apiErrorMessage } from '../../api/apiClient.js';

/** A pasted key without the whitespace, line breaks or quotes that come along when it is copied. */
export function cleanApiKey(raw: string): string {
  const compact = raw.replace(/\s+/g, '');
  return compact.replace(/^["'“‘`]+|["'”’`]+$/g, '');
}

const MIN_REDACTED_KEY_LENGTH = 6;

/**
 * The words to show when saving the key fails. A rate limit gets its own plain sentence, and the key itself is
 * removed from whatever the server said, so it never lands in the page.
 */
export function aiKeyErrorMessage(error: unknown, key: string, fallback: string): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many requests right now. Wait a minute, then try again.';
  }
  const message = apiErrorMessage(error, fallback);
  return key.length >= MIN_REDACTED_KEY_LENGTH ? message.split(key).join('[key hidden]') : message;
}
