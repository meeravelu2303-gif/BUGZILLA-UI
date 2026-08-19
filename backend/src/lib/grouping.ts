/**
 * Parses the structured block the test bench writes into a bug's description,
 * so the frontend receives JSON and never has to regex a description body.
 *
 * The bench files one grouped ticket per defect rather than one per affected
 * endpoint, and carries the blast radius in the description:
 *
 *   Classification: Security/Access Control
 *   Endpoint: GET /v2/signupLogin/userLogoutFromAllDevices
 *   Module: Authentication V2
 *
 *   <prose>
 *
 *   Affected endpoints (12), observed by 37 test case(s):
 *     - GET /v2/a (Authentication V2) x4
 *     - POST /v2/b (Groups V2) x2
 *     … and 3 more — see the attached repro text for the full list.
 *
 * The block is emitted only when a defect spans more than one endpoint, and the
 * bench caps it at 40 entries with the full list in the repro attachment. Bugs
 * filed before grouping existed have no block at all, which is not an error:
 * they return an explicit empty shape, never a broken or partial one.
 */

export interface AffectedEndpoint {
  method: string;
  path: string;
  module: string;
  occurrences: number;
}

export interface Grouping {
  /** Test cases that observed this defect. Null when the bug predates grouping. */
  occurrences: number | null;
  /** How many endpoints the defect spans, as stated in the header line. */
  endpointCount: number | null;
  affectedEndpoints: AffectedEndpoint[];
  /** True when the description lists fewer endpoints than endpointCount. */
  truncated: boolean;
  /** True when this bug carries a grouping block at all. */
  isGrouped: boolean;
}

export interface DescriptionFacts {
  classification: string | null;
  /** The single `Endpoint:` line; grouped bugs also have affectedEndpoints. */
  endpoint: string | null;
  module: string | null;
  owner: string | null;
  environment: string | null;
  grouping: Grouping;
}

const EMPTY_GROUPING: Grouping = {
  occurrences: null,
  endpointCount: null,
  affectedEndpoints: [],
  truncated: false,
  isGrouped: false,
};

/** `Affected endpoints (12), observed by 37 test case(s):` */
const SCOPE_HEADER = /^\s*Affected endpoints\s*\((\d+)\)\s*,\s*observed by\s*(\d+)\s*test case/im;

/** `  - GET /v2/path (Module Name) x4` */
const ENDPOINT_ROW = /^\s*[-•]\s*([A-Z]+)\s+(\S+)\s*\(([^)]*)\)\s*x\s*(\d+)\s*$/gim;

function labelledLine(description: string, label: string): string | null {
  const re = new RegExp(`^\\s*${label}:\\s*(.+?)\\s*$`, 'm');
  const m = re.exec(description);
  return m ? m[1] : null;
}

/**
 * Bugzilla stores the description with literal `\n` escapes in some paths and
 * real newlines in others; normalise so one set of line-anchored patterns works.
 *
 * Exported because classification.ts reads the same descriptions and must agree
 * on what a "line" is - a body arriving with escaped newlines would otherwise
 * make a line-anchored match swallow the entire description.
 */
export function normaliseDescription(description: string): string {
  return description.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n/g, '\n');
}

const normalise = normaliseDescription;

export function parseGrouping(description: string | undefined): Grouping {
  if (!description) return EMPTY_GROUPING;
  const text = normalise(description);

  const header = SCOPE_HEADER.exec(text);
  if (!header) return EMPTY_GROUPING;

  const endpointCount = Number(header[1]);
  const occurrences = Number(header[2]);

  const affectedEndpoints: AffectedEndpoint[] = [];
  // Only scan the text after the header, so a stray bullet earlier in the prose
  // cannot be mistaken for an endpoint row.
  const body = text.slice(header.index + header[0].length);
  ENDPOINT_ROW.lastIndex = 0;
  let row: RegExpExecArray | null;
  while ((row = ENDPOINT_ROW.exec(body)) !== null) {
    affectedEndpoints.push({
      method: row[1],
      path: row[2],
      module: row[3].trim(),
      occurrences: Number(row[4]),
    });
  }

  return {
    occurrences: Number.isFinite(occurrences) ? occurrences : null,
    endpointCount: Number.isFinite(endpointCount) ? endpointCount : null,
    affectedEndpoints,
    truncated: Number.isFinite(endpointCount) && affectedEndpoints.length < endpointCount,
    isGrouped: true,
  };
}

/**
 * Everything structured we can recover from a description, including the
 * grouping block. Safe on any input - a description in an unexpected shape
 * yields nulls rather than throwing.
 */
export function parseDescription(description: string | undefined): DescriptionFacts {
  if (!description) {
    return { classification: null, endpoint: null, module: null, owner: null, environment: null, grouping: EMPTY_GROUPING };
  }
  const text = normalise(description);
  return {
    classification: labelledLine(text, 'Classification'),
    endpoint: labelledLine(text, 'Endpoint'),
    module: labelledLine(text, 'Module'),
    owner: labelledLine(text, 'Owner'),
    environment: labelledLine(text, 'Environment'),
    grouping: parseGrouping(description),
  };
}
