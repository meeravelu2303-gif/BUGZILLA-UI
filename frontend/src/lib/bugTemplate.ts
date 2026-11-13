/** The ticket shape every bug in this tracker shares. */
export type BugKind = 'api' | 'ui';

export const BUG_CATEGORIES = ['Functional', 'Security', 'Performance', 'Compatibility', 'Accessibility'] as const;

export const BUG_BROWSERS = ['chromium', 'firefox', 'webkit', 'mobile-chrome'] as const;
/** Mobile UI bugs: the device platforms the app was tested on. */
export const BUG_DEVICES = ['android', 'ios'] as const;
export const DEVICE_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS' };
/** A UI bug is either in the web app (browsers) or the mobile app (devices). */
export type UiPlatform = 'web' | 'mobile';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** One level sets both Bugzilla fields - the bench's BUGZILLA_SEVERITY / BUGZILLA_PRIORITY maps. */
export const SEVERITY_LEVELS = {
  CRITICAL: {
    severity: 'critical',
    priority: 'Highest',
    hint: 'Data loss, crash, security hole, or a core flow fully blocked',
  },
  HIGH: { severity: 'major', priority: 'High', hint: 'A main feature is broken or gives wrong results' },
  MEDIUM: { severity: 'minor', priority: 'Normal', hint: 'Works, but incorrectly in a secondary case' },
  LOW: { severity: 'trivial', priority: 'Low', hint: 'Cosmetic, wording, or a minor inconsistency' },
} as const;
export type SeverityLevel = keyof typeof SEVERITY_LEVELS;

/** Steps to reproduce are REQUIRED only for Critical and Major (HIGH) bugs. */
export const STEPS_REQUIRED_LEVELS: ReadonlySet<SeverityLevel> = new Set<SeverityLevel>(['CRITICAL', 'HIGH']);
export const stepsRequired = (level: SeverityLevel) => STEPS_REQUIRED_LEVELS.has(level);
export const NOT_GIVEN = '(not given)';

/** Priority, separate from severity (2026-10-23). */
export const PRIORITY_OPTIONS = [
  { value: 'Highest', label: 'P0', hint: 'Fix immediately' },
  { value: 'High', label: 'P1', hint: 'Fix in this cycle' },
  { value: 'Normal', label: 'P2', hint: 'Fix in a coming cycle' },
  { value: 'Low', label: 'P3', hint: 'Fix when there is time' },
] as const;
export const priorityLabel = (value: string) =>
  PRIORITY_OPTIONS.find((priorityOption) => priorityOption.value === value)?.label ?? value;

/** Every classification in use - collected from the bugs already in this tracker AND the rule ids the. */
export const CLASSIFICATIONS: Record<BugKind, string[]> = {
  api: [
    'response.status-code',
    'response.status',
    'response.error-format',
    'response.structure',
    'response.schema',
    'response.content-type',
    'response.headers',
    'response.metadata',
    'response.pagination',
    'response.binary-content',
    'request.null-value',
    'request.empty-body',
    'request.empty-value',
    'request.required-fields',
    'request.data-type',
    'request.format',
    'request.enum',
    'request.boundary-value',
    'request.invalid-payload',
    'request.malformed-json',
    'request.unknown-fields',
    'request.unsupported-media-type',
    'request.method-not-allowed',
    'common.api-error',
    'common.id',
    'common.date',
    'common.email',
    'common.url',
    'common.boolean',
    'metadata.timestamp',
    'flow.server-error',
    'logic.gate-not-enforced',
    'authentication.missing-token',
    'authentication.invalid-token',
    'authentication.malformed-token',
    'authentication.expired-token',
    'authentication.valid-token',
    'authorization.cross-resource-access',
    'authorization.forbidden',
    'authorization.permission',
    'authorization.privilege-escalation',
    'authorization.role',
    'security.information-disclosure',
    'security.sensitive-data',
    'security.injection',
    'security.stored-injection',
    'security.xss',
    'security.idor',
    'security.object-authorization',
    'security.jwt',
    'security.broken-authentication',
    'security.missing-authentication',
    'security.missing-verification',
    'security.privacy-control-bypass',
    'security.cryptography',
    'security.security-headers',
    'security.rate-limit',
    'performance.response-time',
    'performance.timeout',
    'performance.payload-size',
    'concurrency.burst-resilience',
    'concurrency.duplicate-write',
    'concurrency.read-consistency',
    'concurrency.session-isolation',
  ],
  ui: [
    'ui.content',
    'ui.layout',
    'ui.dom',
    'ui.images',
    'ui.health',
    'ui.console',
    'ui.performance',
    'ui.security',
    'ui.accessibility',
    'ui.malformed-url',
    'ui.pii-exposure',
    'ui.debugger-statement',
    'functional.image-loading-broken',
    'accessibility.button-name',
    'accessibility.color-contrast',
    'accessibility.select-name',
    'accessibility.scrollable-region-focusable',
  ],
};

/** This kind's classifications first, then the other kind's - every value is always offered. */
export function classificationOptions(kind: BugKind): string[] {
  return [...CLASSIFICATIONS[kind], ...CLASSIFICATIONS[kind === 'api' ? 'ui' : 'api']];
}

/** "security.idor" -> "security"; shown beside each option so the long list scans by family. */
export function classificationFamily(value: string): string {
  return value.split('.')[0];
}

export const DEFAULT_ENVIRONMENT: Record<BugKind, string> = {
  api: 'test deployment (https://testingapi.kpostindia.com)',
  ui: 'test deployment (https://test.kpostindia.com)',
};

const API_BASE_URL = 'https://testingapi.kpostindia.com';

/** Products whose name says UI are front-end products; everything else here is an API product. */
export function kindForProduct(product: string): BugKind {
  return /\bUI\b/i.test(product) ? 'ui' : 'api';
}

export interface BugReportInput {
  kind: BugKind;
  tag: string;
  product: string;
  component: string;
  title: string;
  category: string;
  level: SeverityLevel;
  priority?: string;
  classification: string;
  method: string;
  path: string;
  page: string;
  uiPlatform: UiPlatform;
  browsers: string[];
  devices: string[];
  summary: string;
  whyItMatters: string;
  howToFix: string;
  preconditions: string;
  steps: string;
  expected: string;
  actual: string;
  responseStatus: string;
  responseBody: string;
  curl: string;
  correlationId: string;
  environment: string;
  ownerName: string;
  ownerEmail: string;
  filedByName: string;
  filedByEmail: string;
  evidence: string[];
  runDate: string;
}

const SUMMARY_LIMIT = 255;

export function mintTag(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `KP-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** "2026-10-15 12:37 IST" - the run-date shape the bench's hand-reviewed tickets use. */
export function runDateNow(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} IST`;
}

function endpointOf(input: BugReportInput): string {
  return input.path.trim() ? `${input.method} ${input.path.trim()}` : '';
}

/** [KP-XXXXXX] title, trimmed to Bugzilla's 255-character column with the tag kept intact. */
export function buildSummary(input: BugReportInput): string {
  const tag = `[${input.tag}]`;
  const lead = input.kind === 'api' && endpointOf(input) ? `${endpointOf(input)}: ` : '';
  const title = `${lead}${input.title}`.replace(/\s+/g, ' ').trim();
  const full = `${tag} ${title}`;
  if (full.length <= SUMMARY_LIMIT) return full;
  return `${tag} ${title.slice(0, SUMMARY_LIMIT - tag.length - 2).trimEnd()}…`;
}

export function buildWhiteboard(input: BugReportInput): string {
  const tags = [`[cat:${input.category}]`];
  if (input.kind === 'ui') {
    tags.push(`[platform:${input.uiPlatform}]`);
    if (input.uiPlatform === 'web' && input.browsers.length) tags.push(`[browser:${input.browsers.join(',')}]`);
    if (input.uiPlatform === 'mobile' && input.devices.length) tags.push(`[device:${input.devices.join(',')}]`);
  }
  return tags.join('');
}

function wrap(text: string, width = 78): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (line && `${line} ${word}`.length > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function numberSteps(steps: string): string {
  const lines = steps
    .replace(/\r/g, '')
    .split('\n')
    .map((value) => value.trimEnd())
    .filter((value) => value.trim() !== '');
  if (lines.some((line) => /^\s*\d+[.)]\s/.test(line))) return lines.join('\n');
  return lines.map((line, i) => `${i + 1}. ${line.trim()}`).join('\n');
}

function defaultPreconditions(input: BugReportInput): string {
  if (input.kind === 'ui' && input.uiPlatform === 'mobile') {
    const on = input.devices.map((device) => DEVICE_LABELS[device] ?? device).join('/');
    return `Signed in with a valid test account on the mobile app${on ? ` (${on})` : ''}${input.component ? `, on the ${input.component} screen` : ''}.`;
  }
  if (input.kind === 'ui') {
    const where = input.browsers.length ? `in ${input.browsers.join('/')}, ` : '';
    return `Signed in with a valid test account${where ? `, ${where.replace(/, $/, '')}` : ''}${input.component ? `, on the ${input.component} screen` : ''}.`;
  }
  return 'A valid, authenticated test account calling the endpoint below with a live session token.';
}

export function buildDescription(input: BugReportInput): string {
  const level = SEVERITY_LEVELS[input.level];
  const endpoint = input.kind === 'api' ? endpointOf(input) : input.page.trim();
  const lines = [
    `Classification: ${input.classification.trim()}`,
    `Category: ${input.category}`,
    `${input.kind === 'api' ? 'Representative endpoint:' : 'Endpoint:'} ${endpoint || '(not applicable)'}`,
    `Module: ${input.component}`,
    `Severity: ${level.severity} / Priority: ${input.priority ?? level.priority}`,
    '',
    `Preconditions: ${input.preconditions.trim() || defaultPreconditions(input)}`,
    '',
    'Summary:',
    ...wrap(input.summary.trim()),
  ];

  if (input.whyItMatters.trim()) lines.push('', ...wrap(`Why it matters: ${input.whyItMatters.trim()}`));
  if (input.howToFix.trim()) lines.push('', ...wrap(`How to fix: ${input.howToFix.trim()}`));

  if (input.kind === 'ui' && input.uiPlatform === 'mobile') {
    lines.push(
      '',
      `Platform: Mobile app${input.devices.length ? ` - ${input.devices.map((device) => DEVICE_LABELS[device] ?? device).join(', ')}` : ''}.`,
    );
  } else if (input.kind === 'ui') {
    lines.push('', 'Platform: Web app.');
    if (input.browsers.length) lines.push(`Browsers affected: ${input.browsers.join(', ')}.`);
  }
  if (input.correlationId.trim()) {
    lines.push('', `Correlation ID (search the application logs for it): ${input.correlationId.trim()}`);
  }

  lines.push('', 'Expected:', input.expected.trim() || NOT_GIVEN, '', 'Actual:', input.actual.trim() || NOT_GIVEN);

  if (input.kind === 'api' && input.responseBody.trim()) {
    lines.push('', `Response body (HTTP ${input.responseStatus.trim() || '?'}):`, input.responseBody.trim());
  }

  lines.push('', 'Steps to reproduce:', input.steps.trim() ? numberSteps(input.steps) : NOT_GIVEN);

  if (input.kind === 'api' && input.curl.trim()) lines.push('', 'curl:', input.curl.trim());

  lines.push(
    '',
    `Owner: ${input.ownerName || input.ownerEmail} <${input.ownerEmail}> — maintainer of the ${input.product} module`,
    `Environment: ${input.environment.trim()}`,
    `Run date: ${input.runDate}`,
    `Filed by: manual — ${input.filedByName || input.filedByEmail} <${input.filedByEmail}> via BUGZILLA-UI`,
  );

  if (input.evidence.length) lines.push('', `Evidence attached: ${input.evidence.join(', ')}`);

  return lines.join('\n');
}

/** A starting curl for the chosen endpoint. */
export function curlTemplate(method: string, path: string): string {
  const url = `${API_BASE_URL}${path.trim() || '/'}`;
  const lines = [
    `curl -X ${method} '${url}' \\`,
    `  -H 'Authorization: Bearer $KPOST_TOKEN' \\`,
    `  -H 'Content-Type: application/json'`,
  ];
  if (method !== 'GET' && method !== 'DELETE') {
    lines[lines.length - 1] += ' \\';
    lines.push(`  --data '{}'`);
  }
  return lines.join('\n');
}

export type ReportErrors = Partial<Record<keyof BugReportInput, string>>;

/** Everything a bench ticket always has, a manual one must have too. */
export function validateReport(input: BugReportInput): ReportErrors {
  const errors: ReportErrors = {};
  if (!input.product) errors.product = 'Select a product.';
  if (!input.component) errors.component = 'Select a component.';
  if (input.title.trim().length < 10) errors.title = 'Describe the problem in at least 10 characters.';
  if (!input.classification.trim()) errors.classification = 'Pick or type a classification, e.g. response.status-code.';
  if (input.summary.trim().length < 20) errors.summary = 'Explain what goes wrong in a sentence or two.';
  if (stepsRequired(input.level) && !input.steps.trim())
    errors.steps = 'Critical and High severity bugs need the steps that reproduce them.';
  if (!input.environment.trim()) errors.environment = 'Name the environment it was seen on.';

  if (input.kind === 'api') {
    if (!/^\/\S*$/.test(input.path.trim()))
      errors.path = 'Enter the endpoint path, starting with "/" (e.g. /v2/kmail/inbox/).';
    if (!/^\s*curl\s/i.test(input.curl))
      errors.curl = 'Paste a curl command that reproduces it (Generate fills a starting one).';
    if (input.responseStatus.trim() && !/^[1-5]\d\d$/.test(input.responseStatus.trim())) {
      errors.responseStatus = 'A 3-digit HTTP status, e.g. 500.';
    }
  } else if (input.uiPlatform === 'mobile') {
    if (input.devices.length === 0) errors.devices = 'Tick Android, iOS or both.';
  } else if (input.browsers.length === 0) {
    errors.browsers = 'Tick every browser you saw it in.';
  }
  return errors;
}
