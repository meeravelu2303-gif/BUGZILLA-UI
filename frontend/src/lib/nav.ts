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
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Permissions } from '../types';

export interface NavItem {
  to?: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: keyof Permissions;
  description?: string;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/** Single source of truth for primary navigation. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'work',
    title: 'Work',
    items: [
      {
        to: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        end: true,
        description: 'Activity overview and key metrics',
      },
      {
        to: '/my-bugs',
        label: 'My Bugs',
        icon: UserCircle,
        description: 'Bugs assigned to, reported by, or CC-ing you',
      },
      { to: '/bugs', label: 'All Bugs', icon: ListChecks, description: 'Browse, filter, sort and triage every bug' },
      { to: '/search', label: 'Advanced Search', icon: Search, description: 'Build a precise multi-field bug query' },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      {
        to: '/reports',
        label: 'Reports & Charts',
        icon: BarChart3,
        description: 'Breakdowns by status, severity, product and more',
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    adminOnly: true,
    items: [
      {
        to: '/admin/users',
        label: 'Users',
        icon: UsersIcon,
        permission: 'canViewUsers',
        description: 'Create, search and enable/disable accounts',
      },
      {
        to: '/admin/teams',
        label: 'Teams',
        icon: UsersRound,
        permission: 'canManageUsers',
        description: 'Teams, their team leaders and members',
      },
      {
        to: '/admin/products',
        label: 'Products',
        icon: Boxes,
        permission: 'canViewProducts',
        description: 'Manage products and their components',
      },
      {
        to: '/admin/field-values',
        label: 'Field Values',
        icon: Tags,
        description: 'Allowed values for status, severity, priority and more',
      },
      {
        to: '/admin/workflow',
        label: 'Status Workflow',
        icon: Workflow,
        description: 'The allowed status transitions, visualized',
      },
      {
        to: '/admin/groups',
        label: 'Groups & Permissions',
        icon: ShieldCheck,
        description: 'Group memberships for your account',
      },
      {
        to: '/admin/parameters',
        label: 'Parameters',
        icon: SlidersHorizontal,
        description: 'Instance-wide configuration parameters',
      },
      {
        to: '/admin/sanity-check',
        label: 'Sanity Check',
        icon: Stethoscope,
        description: 'Run Bugzilla database consistency checks',
      },
    ],
  },
];

/** Preference sub-pages that live in Bugzilla proper, embedded in the app shell. */
export const PREFERENCE_TABS: { tab: string; title: string; blurb: string }[] = [
  { tab: 'settings', title: 'General Preferences', blurb: 'Default query, timezone, and display options.' },
  { tab: 'email', title: 'Email Preferences', blurb: 'Control which bug changes email you.' },
  { tab: 'saved-searches', title: 'Saved Searches', blurb: 'Manage your saved bug searches.' },
  { tab: 'apikey', title: 'API Keys', blurb: 'Create and revoke personal API keys.' },
  { tab: 'permissions', title: 'Permissions', blurb: 'The groups and privileges your account holds.' },
];

/** The items of one section this user may see. */
export function visibleNavItems(section: NavSection, permissions?: Permissions): NavItem[] {
  const isAdmin = Boolean(permissions?.canManageUsers || permissions?.canManageProducts);
  return section.items.filter((item) => {
    if (item.permission) return Boolean(permissions?.[item.permission]);
    return !section.adminOnly || isAdmin;
  });
}
