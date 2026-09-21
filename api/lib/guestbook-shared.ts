export const GUESTBOOK_PATH_SEGMENT = 'guestbook';
export const GUESTBOOK_PAGE_SIZE = 20;
export const GUESTBOOK_MAX_BODY_BYTES = 4 * 1024;
export const GUESTBOOK_NICKNAME_MAX_LENGTH = 32;
export const GUESTBOOK_EMAIL_MAX_LENGTH = 254;
export const GUESTBOOK_CONTENT_MAX_LENGTH = 500;

export type GuestbookErrorCode =
  | 'invalid_input'
  | 'duplicate'
  | 'blocked'
  | 'rate_limited'
  | 'server_error';

export interface GuestbookPublicEntry {
  id: number;
  nickname: string;
  content: string;
  createdAt: string;
  avatarUrl: string;
  fallbackAvatarUrl: string;
}

export interface GuestbookListResponse {
  entries: GuestbookPublicEntry[];
  nextCursor: number | null;
}

export interface GuestbookSubmitSuccessResponse {
  ok: true;
  entry: GuestbookPublicEntry;
}

export interface GuestbookSubmitErrorResponse {
  ok: false;
  code: GuestbookErrorCode;
}

export type GuestbookSubmitResponse = GuestbookSubmitSuccessResponse | GuestbookSubmitErrorResponse;
