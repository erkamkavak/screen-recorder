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
  followCursor?: boolean;
}

export type TimelineEvent = TimelineZoomEvent;

export interface TimelineSnapshot {
  segmentEvents: Record<string, TimelineEvent[]>;
  events?: TimelineEvent[];
  trimStart?: number;
  trimEnd?: number | null;
}

export interface TimelineState extends TimelineSnapshot {
  selectedEvent: { segmentId: string; eventId: string } | null;
  history: TimelineSnapshot[];
  historyIndex: number;
}

const cloneEvents = (events: TimelineEvent[]) => events.map((event) => ({ ...event }));

const cloneSegmentEvents = (segmentEvents: Record<string, TimelineEvent[]>): Record<string, TimelineEvent[]> => {
  const next: Record<string, TimelineEvent[]> = {};
  for (const [segmentId, events] of Object.entries(segmentEvents ?? {})) {
    next[segmentId] = cloneEvents(events ?? []);
  }
  return next;
};

const cloneSnapshot = (snapshot: TimelineSnapshot): TimelineSnapshot => ({
  segmentEvents: cloneSegmentEvents(snapshot.segmentEvents ?? {}),
  events: snapshot.events ? cloneEvents(snapshot.events) : undefined,
  trimStart: snapshot.trimStart,
  trimEnd: snapshot.trimEnd,
});

const initialSnapshot = (): TimelineSnapshot => ({
  segmentEvents: {},
});

const sortEvents = (events: TimelineEvent[]) => [...events].sort((a, b) => a.startTime - b.startTime);

const clampDuration = (duration: number): number => Math.max(0.1, duration);

const createTimelineStore = () => {
  const initial = initialSnapshot();
  const { subscribe, set, update } = writable<TimelineState>({
    ...cloneSnapshot(initial),
    selectedEvent: null,
    history: [cloneSnapshot(initial)],
    historyIndex: 0,
  });

  const commit = (
    state: TimelineState,
    snapshot: TimelineSnapshot,
    selectedEvent: TimelineState["selectedEvent"] = state.selectedEvent
  ): TimelineState => {
    const history = state.history.slice(0, state.historyIndex + 1);
    history.push(cloneSnapshot(snapshot));
    return {
      ...state,
      segmentEvents: cloneSegmentEvents(snapshot.segmentEvents ?? {}),
      selectedEvent,
      history,
      historyIndex: history.length - 1,
    };
  };

  const normalizeSnapshot = (snapshot: TimelineSnapshot): TimelineSnapshot => {
    // Backward compat: old snapshots had flat `events`.
    if (snapshot.segmentEvents && Object.keys(snapshot.segmentEvents).length) {
      return {
        segmentEvents: cloneSegmentEvents(snapshot.segmentEvents),
      };
    }
    const legacyEvents = sortEvents((snapshot.events ?? []) as TimelineEvent[]);
    return {
      segmentEvents: legacyEvents.length ? { __legacy: legacyEvents } : {},
      events: snapshot.events,
      trimStart: snapshot.trimStart,
      trimEnd: snapshot.trimEnd,
    };
  };

  return {
    subscribe,

    addZoom: (segmentId: string, zoom: Omit<TimelineZoomEvent, "id" | "type">) => {
      update((state) => {
        const id = `zoom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const nextSegmentEvents = cloneSegmentEvents(state.segmentEvents ?? {});
        const current = nextSegmentEvents[segmentId] ?? [];
        nextSegmentEvents[segmentId] = sortEvents([
          ...current,
          { ...zoom, id, type: "zoom", duration: clampDuration(zoom.duration) },
        ]);

        const snapshot: TimelineSnapshot = {
          segmentEvents: nextSegmentEvents,
        };
        return commit(state, snapshot, { segmentId, eventId: id });
      });
    },

    updateZoom: (
      segmentId: string,
      eventId: string,
      patch: Partial<Omit<TimelineZoomEvent, "id" | "type">>
    ) => {
      update((state) => {
        const nextSegmentEvents = cloneSegmentEvents(state.segmentEvents ?? {});
        const current = nextSegmentEvents[segmentId] ?? [];
        nextSegmentEvents[segmentId] = sortEvents(
          current.map((event) =>
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
          segmentEvents: nextSegmentEvents,
        };
        return commit(state, snapshot, state.selectedEvent);
      });
    },

    deleteEvent: (segmentId: string, eventId: string) => {
      update((state) => {
        const nextSegmentEvents = cloneSegmentEvents(state.segmentEvents ?? {});
        const current = nextSegmentEvents[segmentId] ?? [];
        nextSegmentEvents[segmentId] = sortEvents(current.filter((event) => event.id !== eventId));
        const snapshot: TimelineSnapshot = {
          segmentEvents: nextSegmentEvents,
        };
        const selected =
          state.selectedEvent?.segmentId === segmentId && state.selectedEvent?.eventId === eventId
            ? null
            : state.selectedEvent;
        return commit(state, snapshot, selected);
      });
    },

    selectEvent: (selected: { segmentId: string; eventId: string } | null) => {
      update((state) => ({
        ...state,
        selectedEvent: selected,
      }));
    },

    undo: () => {
      update((state) => {
        if (state.historyIndex === 0) return state;
        const nextIndex = state.historyIndex - 1;
        const snapshot = state.history[nextIndex];
        return {
          ...state,
          segmentEvents: cloneSegmentEvents(normalizeSnapshot(snapshot).segmentEvents),
          historyIndex: nextIndex,
          selectedEvent: null,
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
          segmentEvents: cloneSegmentEvents(normalizeSnapshot(snapshot).segmentEvents),
          historyIndex: nextIndex,
          selectedEvent: null,
        };
      });
    },

    reset: () => {
      const initialSnap = initialSnapshot();
      set({
        ...initialSnap,
        selectedEvent: null,
        history: [initialSnap],
        historyIndex: 0,
      });
    },

    snapshot: () => {
      let current: TimelineSnapshot = initialSnapshot();
      update((state) => {
        current = {
          segmentEvents: cloneSegmentEvents(state.segmentEvents ?? {}),
          trimStart: state.trimStart,
          trimEnd: state.trimEnd,
        };
        return state;
      });
      return current;
    },

    loadSnapshot: (snapshot: TimelineSnapshot) => {
      const normalized = normalizeSnapshot(snapshot);
      const snap = cloneSnapshot({
        segmentEvents: cloneSegmentEvents(normalized.segmentEvents ?? {}),
        events: normalized.events,
        trimStart: normalized.trimStart,
        trimEnd: normalized.trimEnd,
      });
      set({
        ...snap,
        selectedEvent: null,
        history: [cloneSnapshot(snap)],
        historyIndex: 0,
      });
    },
  };
};

export const timelineStore = createTimelineStore();
