import {
  LayoutDashboard,
  ListChecks,
  Search,
  UserCircle,
  BarChart3,
  Users as UsersIcon,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  Tags,
  Boxes,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import type { Permissions } from '../types';

export interface NavItem {
  /** In-app route. Present for native React pages. */
  to?: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match highlighting (used for the dashboard root). */
  end?: boolean;
  /** Only show when the current user has this permission. */
  permission?: keyof Permissions;
  /** Short description surfaced in the command palette. */
  description?: string;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
  /** Hide the whole section unless at least one admin permission is present. */
  adminOnly?: boolean;
}

/**
 * Single source of truth for primary navigation. Rendered by the sidebar and
 * searched by the command palette so the two never drift apart.
 *
 * Administration items that Bugzilla's REST API cannot safely expose
 * (groups, workflow, field values, parameters, sanity check) route to the
 * in-app `/admin/native/:page` frame rather than throwing the user out to a
 * raw Perl tab. See NativeAdmin.tsx and README "Why some admin stays native".
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'work',
    title: 'Work',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'Activity overview and key metrics' },
      { to: '/my-bugs', label: 'My Bugs', icon: UserCircle, description: 'Bugs assigned to, reported by, or CC-ing you' },
      { to: '/bugs', label: 'All Bugs', icon: ListChecks, description: 'Browse, filter, sort and triage every bug' },
      { to: '/search', label: 'Advanced Search', icon: Search, description: 'Build a precise multi-field bug query' },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      { to: '/reports', label: 'Reports & Charts', icon: BarChart3, description: 'Breakdowns by status, severity, product and more' },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    adminOnly: true,
    items: [
      { to: '/admin/users', label: 'Users', icon: UsersIcon, permission: 'canManageUsers', description: 'Create, search and enable/disable accounts' },
      { to: '/admin/products', label: 'Products', icon: ShieldCheck, permission: 'canManageProducts', description: 'Manage products and their components' },
      { to: '/admin/native/editproducts', label: 'Products (full)', icon: Boxes, description: 'Full product/component/version/milestone editing' },
      { to: '/admin/native/editvalues', label: 'Field Values', icon: Tags, description: 'Edit status, resolution, severity and priority values' },
      { to: '/admin/native/editworkflow', label: 'Status Workflow', icon: Workflow, description: 'Configure allowed status transitions' },
      { to: '/admin/native/editgroups', label: 'Groups & Permissions', icon: ShieldCheck, description: 'Group definitions and membership' },
      { to: '/admin/native/editparams', label: 'Parameters', icon: SlidersHorizontal, description: 'Instance-wide configuration parameters' },
      { to: '/admin/native/sanitycheck', label: 'Sanity Check', icon: Stethoscope, description: 'Run Bugzilla database consistency checks' },
    ],
  },
];

/** Maps `/admin/native/:page` slugs to the real Bugzilla .cgi page + a title. */
export const NATIVE_ADMIN_PAGES: Record<string, { cgi: string; title: string; blurb: string }> = {
  editproducts: {
    cgi: 'editproducts.cgi',
    title: 'Products (full editing)',
    blurb: 'Rename products, edit components, versions and milestones — surfaces Bugzilla REST cannot expose.',
  },
  editvalues: {
    cgi: 'editvalues.cgi',
    title: 'Field Values',
    blurb: 'Add or edit the allowed values for status, resolution, severity, priority and platform fields.',
  },
  editworkflow: {
    cgi: 'editworkflow.cgi',
    title: 'Status Workflow',
    blurb: 'Define which status transitions are legal, and which require a comment.',
  },
  editgroups: {
    cgi: 'editgroups.cgi',
    title: 'Groups & Permissions',
    blurb: 'Security-critical group definitions and membership. Kept native by design to avoid permission-bug risk.',
  },
  editparams: {
    cgi: 'editparams.cgi',
    title: 'Parameters',
    blurb: 'Instance-wide configuration for the whole Bugzilla installation.',
  },
  sanitycheck: {
    cgi: 'sanitycheck.cgi',
    title: 'Sanity Check',
    blurb: 'Run Bugzilla’s built-in database consistency checks and repairs.',
  },
};

/** Preference sub-pages that live in Bugzilla proper, embedded in the app shell. */
export const PREFERENCE_TABS: { tab: string; title: string; blurb: string }[] = [
  { tab: 'settings', title: 'General Preferences', blurb: 'Default query, timezone, and display options.' },
  { tab: 'email', title: 'Email Preferences', blurb: 'Control which bug changes email you.' },
  { tab: 'saved-searches', title: 'Saved Searches', blurb: 'Manage your saved bug searches.' },
  { tab: 'apikey', title: 'API Keys', blurb: 'Create and revoke personal API keys.' },
  { tab: 'permissions', title: 'Permissions', blurb: 'The groups and privileges your account holds.' },
];
