import { md5Hex } from './md5';

export interface AfdianSponsorRaw {
  sponsor_plans?: Array<{
    plan_id?: string;
    name?: string;
    price?: string;
    show_price?: string;
    pic?: string;
    expire_time?: number;
  }>;
  current_plan?: {
    plan_id?: string;
    name?: string;
    price?: string;
    expire_time?: number;
  } | null;
  all_sum_amount?: string;
  create_time?: number;
  first_pay_time?: number;
  last_pay_time?: number;
  user?: {
    user_id?: string;
    name?: string;
    avatar?: string;
  };
}

export interface AfdianQueryResponse {
  ec: number;
  em?: string;
  data?: {
    total_count?: number;
    total_page?: number;
    list?: AfdianSponsorRaw[];
  };
}

export interface PublicSponsor {
  avatar: string;
  name: string;
}

export interface SponsorsPayload {
  sponsors: PublicSponsor[];
  total: number;
  updated_at: number;
}

const AFDIAN_API_BASE = 'https://afdian.com/api/open';

/**
 * Build the signed body for an Afdian Open API request.
 * sign = md5(token + 'params' + paramsJson + 'ts' + ts + 'user_id' + user_id)
 */
const buildSignedBody = (
  userId: string,
  token: string,
  paramsObject: Record<string, unknown>,
) => {
  const params = JSON.stringify(paramsObject);
  const ts = Math.floor(Date.now() / 1000);
  const sign = md5Hex(`${token}params${params}ts${ts}user_id${userId}`);
  return { user_id: userId, params, ts, sign };
};

const fetchSponsorPage = async (
  userId: string,
  token: string,
  page: number,
  perPage: number,
): Promise<AfdianQueryResponse> => {
  const body = buildSignedBody(userId, token, { page, per_page: perPage });
  const response = await fetch(`${AFDIAN_API_BASE}/query-sponsor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Afdian HTTP ${response.status}`);
  }
  return (await response.json()) as AfdianQueryResponse;
};

interface InternalSponsor {
  user_id: string;
  avatar: string;
  name: string;
  amount: number;
  first_pay_time: number;
}

const normalize = (raw: AfdianSponsorRaw): InternalSponsor | null => {
  const user = raw.user;
  if (!user || !user.user_id) return null;
  const avatar = user.avatar ?? '';
  if (!avatar) return null;
  const amount = Number.parseFloat(raw.all_sum_amount ?? '0') || 0;
  return {
    user_id: user.user_id,
    avatar,
    name: user.name ?? '',
    amount,
    first_pay_time: raw.first_pay_time ?? raw.create_time ?? 0,
  };
};

export const fetchAllSponsors = async (
  userId: string,
  token: string,
  options: { perPage?: number; maxPages?: number } = {},
): Promise<SponsorsPayload> => {
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 50;

  const seen = new Map<string, InternalSponsor>();
  let totalCount = 0;
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const result = await fetchSponsorPage(userId, token, page, perPage);
    if (result.ec !== 200) {
      throw new Error(`Afdian API error ${result.ec}: ${result.em ?? 'unknown'}`);
    }
    const data = result.data ?? {};
    totalCount = data.total_count ?? totalCount;
    totalPages = data.total_page ?? totalPages;
    const list = data.list ?? [];
    for (const item of list) {
      const normalized = normalize(item);
      if (normalized) {
        seen.set(normalized.user_id, normalized);
      }
    }
    if (list.length === 0) break;
    page += 1;
  }

  const ordered = [...seen.values()].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return (b.first_pay_time || 0) - (a.first_pay_time || 0);
  });

  const sponsors: PublicSponsor[] = ordered.map((entry) => ({
    avatar: entry.avatar,
    name: entry.name,
  }));

  return {
    sponsors,
    total: sponsors.length,
    updated_at: Math.floor(Date.now() / 1000),
  };
};
