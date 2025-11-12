export type ChunkAppender = (blob: Blob) => Promise<void>;

type QueueState = {
  pending: number;
  queue: Blob[];
  processing: Promise<void> | null;
};

export interface RenderChunkQueue {
  enqueue: (blob: Blob) => void;
  flush: () => Promise<void>;
  pendingCount: () => number;
  queueLength: () => number;
  reset: () => void;
}

export const createRenderChunkQueue = (appender: ChunkAppender): RenderChunkQueue => {
  const state: QueueState = {
    pending: 0,
    queue: [],
    processing: null,
  };
  let processingError: unknown | null = null;

  const process = () => {
    if (!state.queue.length) {
      return Promise.resolve();
    }
    if (!state.processing) {
      state.processing = (async () => {
        try {
          while (state.queue.length) {
            const blob = state.queue.shift()!;
            await appender(blob);
            state.pending = Math.max(0, state.pending - 1);
          }
        } finally {
          state.processing = null;
        }
      })().catch((error) => {
        processingError = error;
        throw error;
      });
    }
    return state.processing;
  };

  return {
    enqueue(blob: Blob) {
      state.queue.push(blob);
      state.pending += 1;
      process();
    },
    flush: async () => {
      await process();
      if (processingError) {
        throw processingError;
      }
    },
    pendingCount: () => state.pending,
    queueLength: () => state.queue.length,
    reset: () => {
      state.queue.length = 0;
      state.pending = 0;
      state.processing = null;
      processingError = null;
    },
  };
};
