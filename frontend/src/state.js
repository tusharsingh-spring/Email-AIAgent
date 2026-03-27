import { api } from './api.js';

export const state = {
  current: 'dashboard',
  stats: null,
  actions: [],
  projects: [],
  subscribers: new Set(),
};

export function subscribe(fn) { state.subscribers.add(fn); return () => state.subscribers.delete(fn); }
function notify() { state.subscribers.forEach(fn => fn(state)); }

export async function loadStats() { state.stats = await api.stats(); notify(); }
export async function loadActions() { state.actions = (await api.actions()).actions || []; notify(); }
export async function loadProjects() { state.projects = (await api.projects()).projects || []; notify(); }

export function setView(view) { state.current = view; notify(); }
