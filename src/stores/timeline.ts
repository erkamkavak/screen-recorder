import { writable } from "svelte/store";

export type TimelineEventType = "zoom";

export interface TimelineZoomEvent {
  id: string;
  type: "zoom";
  startTime: number;
  duration: number;
  focusX: number;
  focusY: number;
  zoom: number;
  easing?: "ease-in-out" | "ease" | "linear";
  label?: string;
}

export type TimelineEvent = TimelineZoomEvent;

export interface TimelineSnapshot {
  events: TimelineEvent[];
  trimStart: number;
  trimEnd: number | null;
}

export interface TimelineState extends TimelineSnapshot {
  selectedEventId: string | null;
  history: TimelineSnapshot[];
  historyIndex: number;
}

const cloneEvents = (events: TimelineEvent[]) => events.map((event) => ({ ...event }));

const cloneSnapshot = (snapshot: TimelineSnapshot): TimelineSnapshot => ({
  events: cloneEvents(snapshot.events),
  trimStart: snapshot.trimStart,
  trimEnd: snapshot.trimEnd,
});

const initialSnapshot = (): TimelineSnapshot => ({
  events: [],
  trimStart: 0,
  trimEnd: null,
});

const sortEvents = (events: TimelineEvent[]) =>
  [...events].sort((a, b) => a.startTime - b.startTime);

const clampDuration = (duration: number): number => Math.max(0.1, duration);

const createTimelineStore = () => {
  const initial = initialSnapshot();
  const { subscribe, set, update } = writable<TimelineState>({
    ...cloneSnapshot(initial),
    selectedEventId: null,
    history: [cloneSnapshot(initial)],
    historyIndex: 0,
  });

  const commit = (
    state: TimelineState,
    snapshot: TimelineSnapshot,
    selectedEventId: string | null = state.selectedEventId
  ): TimelineState => {
    const history = state.history.slice(0, state.historyIndex + 1);
    history.push(cloneSnapshot(snapshot));
    return {
      ...state,
      events: cloneEvents(snapshot.events),
      trimStart: snapshot.trimStart,
      trimEnd: snapshot.trimEnd,
      selectedEventId,
      history,
      historyIndex: history.length - 1,
    };
  };

  return {
    subscribe,

    addZoom: (zoom: Omit<TimelineZoomEvent, "id" | "type">) => {
      update((state) => {
        const id = `zoom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const snapshot: TimelineSnapshot = {
          events: sortEvents([
            ...state.events,
            { ...zoom, id, type: "zoom", duration: clampDuration(zoom.duration) },
          ]),
          trimStart: state.trimStart,
          trimEnd: state.trimEnd,
        };
        return commit(state, snapshot, id);
      });
    },

    updateZoom: (eventId: string, patch: Partial<Omit<TimelineZoomEvent, "id" | "type">>) => {
      update((state) => {
        const events = sortEvents(
          state.events.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  ...patch,
                  startTime: patch.startTime ?? event.startTime,
                  duration: clampDuration(patch.duration ?? event.duration),
                  focusX: patch.focusX ?? event.focusX,
                  focusY: patch.focusY ?? event.focusY,
                  zoom: patch.zoom ?? event.zoom,
                  easing: patch.easing ?? event.easing,
                  label: patch.label ?? event.label,
                }
              : event
          )
        );
        const snapshot: TimelineSnapshot = {
          events,
          trimStart: state.trimStart,
          trimEnd: state.trimEnd,
        };
        return commit(state, snapshot, state.selectedEventId);
      });
    },

    deleteEvent: (eventId: string) => {
      update((state) => {
        const events = sortEvents(state.events.filter((event) => event.id !== eventId));
        const snapshot: TimelineSnapshot = {
          events,
          trimStart: state.trimStart,
          trimEnd: state.trimEnd,
        };
        const selected = state.selectedEventId === eventId ? null : state.selectedEventId;
        return commit(state, snapshot, selected);
      });
    },

    selectEvent: (eventId: string | null) => {
      update((state) => ({
        ...state,
        selectedEventId: eventId,
      }));
    },

    setTrim: (edge: "start" | "end", value: number, mediaDuration: number) => {
      update((state) => {
        const clamped = Math.max(0, Math.min(value, mediaDuration));
        const currentEnd = state.trimEnd ?? mediaDuration;
        const epsilon = 0.01;

        let trimStart = state.trimStart;
        let trimEnd = currentEnd;

        if (edge === "start") {
          trimStart = Math.min(clamped, Math.max(0, trimEnd - epsilon));
        } else {
          trimEnd = Math.max(clamped, Math.min(mediaDuration, trimStart + epsilon));
        }

        const snapshot: TimelineSnapshot = {
          events: sortEvents(state.events),
          trimStart,
          trimEnd,
        };
        return commit(state, snapshot, state.selectedEventId);
      });
    },

    undo: () => {
      update((state) => {
        if (state.historyIndex === 0) return state;
        const nextIndex = state.historyIndex - 1;
        const snapshot = state.history[nextIndex];
        return {
          ...state,
          events: cloneEvents(snapshot.events),
          trimStart: snapshot.trimStart,
          trimEnd: snapshot.trimEnd,
          historyIndex: nextIndex,
          selectedEventId: null,
        };
      });
    },

    redo: () => {
      update((state) => {
        if (state.historyIndex >= state.history.length - 1) return state;
        const nextIndex = state.historyIndex + 1;
        const snapshot = state.history[nextIndex];
        return {
          ...state,
          events: cloneEvents(snapshot.events),
          trimStart: snapshot.trimStart,
          trimEnd: snapshot.trimEnd,
          historyIndex: nextIndex,
          selectedEventId: null,
        };
      });
    },

    reset: () => {
      const initialSnap = initialSnapshot();
      set({
        ...initialSnap,
        selectedEventId: null,
        history: [initialSnap],
        historyIndex: 0,
      });
    },

    snapshot: () => {
      let current: TimelineSnapshot = cloneSnapshot(initialSnapshot());
      update((state) => {
        current = cloneSnapshot({
          events: state.events,
          trimStart: state.trimStart,
          trimEnd: state.trimEnd,
        });
        return state;
      });
      return current;
    },
  };
};

export const timelineStore = createTimelineStore();
