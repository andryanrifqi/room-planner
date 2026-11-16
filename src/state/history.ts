import type { Layout } from '../types';
import { layoutReducer, type LayoutAction } from './reducer';

const MAX_HISTORY = 200;

export interface HistoryState {
  past: Layout[];
  present: Layout;
  future: Layout[];
  /** Coalesce key of the last recorded action, if any. */
  lastCoalesce?: string;
}

export type HistoryAction = LayoutAction | { type: 'undo' } | { type: 'redo' } | { type: 'reset'; layout: Layout };

export function initHistory(layout: Layout): HistoryState {
  return { past: [], present: layout, future: [] };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    }
    case 'reset':
      return initHistory(action.layout);
    default: {
      const next = layoutReducer(state.present, action);
      if (next === state.present) return state;
      if (action.coalesce && action.coalesce === state.lastCoalesce) {
        return { ...state, present: next, future: [] };
      }
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: [],
        lastCoalesce: action.coalesce,
      };
    }
  }
}
