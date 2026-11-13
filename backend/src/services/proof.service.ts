import { BugzillaClient } from '../clients/bugzilla.client';
import { env } from '../config/app.config';

export interface RawAttachment {
  id: number;
  bug_id: number;
  file_name?: string;
  summary?: string;
  creation_time?: string;
  content_type?: string;
  size?: number;
  is_obsolete?: number | boolean;
  is_private?: number | boolean;
  data?: string;
}

export const INLINE_CONTENT_TYPES = /^(image\/(png|jpeg|gif|webp)|video\/(webm|mp4)|text\/plain|application\/json)$/i;

export const proofClient = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
