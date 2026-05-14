import { NextResponse } from "next/server";

const SOURCES = ["snapshot", "tally", "all"] as const;
const STATUS_GROUPS = ["Upcoming", "Active", "Closed", "Executed", "All"] as const;
const PROTOCOL_PROPOSAL_SORTS = ["time", "heat", "votes", "endingSoon"] as const;

export type ProtocolSourceParam = (typeof SOURCES)[number];
export type ProtocolStatusGroupParam = (typeof STATUS_GROUPS)[number];
export type ProtocolProposalSortParam = (typeof PROTOCOL_PROPOSAL_SORTS)[number];

type ParseResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function parseProtocolSourceParam(searchParams: URLSearchParams): ParseResult<ProtocolSourceParam | undefined> {
  return parseEnumParam(searchParams, "source", SOURCES);
}

export function parseProtocolStatusGroupParam(
  searchParams: URLSearchParams
): ParseResult<ProtocolStatusGroupParam | undefined> {
  return parseEnumParam(searchParams, "statusGroup", STATUS_GROUPS);
}

export function parseProtocolProposalSortParam(
  searchParams: URLSearchParams
): ParseResult<ProtocolProposalSortParam | undefined> {
  return parseEnumParam(searchParams, "sort", PROTOCOL_PROPOSAL_SORTS);
}

export function parseLimitParam(searchParams: URLSearchParams, defaultValue?: number): ParseResult<number | undefined> {
  const raw = searchParams.get("limit");
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: defaultValue };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    return badRequest('Invalid "limit". Expected an integer between 1 and 200.');
  }

  return { ok: true, value: parsed };
}

export function parseTextParam(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim();
  return value || undefined;
}

export function parseRouteId(id: string, label = "id"): ParseResult<string> {
  const normalized = id.trim();
  if (!normalized) {
    return badRequest(`Invalid "${label}".`);
  }

  return { ok: true, value: normalized };
}

function parseEnumParam<const T extends readonly string[]>(
  searchParams: URLSearchParams,
  name: string,
  allowed: T
): ParseResult<T[number] | undefined> {
  const raw = searchParams.get(name);
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: undefined };
  }

  if (!allowed.includes(raw as T[number])) {
    return badRequest(`Invalid "${name}". Expected one of: ${allowed.join(", ")}.`);
  }

  return { ok: true, value: raw as T[number] };
}

function badRequest<T = never>(error: string): ParseResult<T> {
  return {
    ok: false,
    response: NextResponse.json({ error }, { status: 400 }),
  };
}
