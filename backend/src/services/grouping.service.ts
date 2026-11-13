/** Parses the structured block the test bench writes into a bug's description. */
export interface AffectedEndpoint {
  method: string;
  path: string;
  module: string;
  occurrences: number;
}

export interface Grouping {
  occurrences: number | null;
  endpointCount: number | null;
  affectedEndpoints: AffectedEndpoint[];
  truncated: boolean;
  isGrouped: boolean;
}

export interface DescriptionFacts {
  classification: string | null;
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

const SCOPE_HEADER = /^\s*Affected endpoints\s*\((\d+)\)\s*,\s*observed by\s*(\d+)\s*test case/im;

const ENDPOINT_ROW = /^\s*[-•]\s*([A-Z]+)\s+(\S+)\s*\(([^)]*)\)\s*x\s*(\d+)\s*$/gim;

function labelledLine(description: string, label: string): string | null {
  const pattern = new RegExp(`^\\s*${label}:\\s*(.+?)\\s*$`, 'm');
  const match = pattern.exec(description);
  return match ? match[1] : null;
}

/** Bugzilla stores the description with literal \n escapes in some paths and real newlines in others. */
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

/** Everything structured we can recover from a description, including the grouping block. */
export function parseDescription(description: string | undefined): DescriptionFacts {
  if (!description) {
    return {
      classification: null,
      endpoint: null,
      module: null,
      owner: null,
      environment: null,
      grouping: EMPTY_GROUPING,
    };
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
