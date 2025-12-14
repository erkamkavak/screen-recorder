import { createVideoElement, waitForMetadata, seekMedia, waitForNextVideoFrame } from "./videoUtils";

export interface VideoWorker {
    id: number;
    screenVideo: HTMLVideoElement;
    webcamVideo: HTMLVideoElement | null;
    busy: boolean;
}

export type BufferedFrame = {
    frameIndex: number;
    timeSec: number;
    screen: ImageBitmap;
    webcam: ImageBitmap | null;
};

export class VideoPool {
    private workers: VideoWorker[] = [];
    private screenUrl: string;
    private webcamUrl: string | null;
    private size: number;

    private destroyed = false;
    private running = false;
    private totalFrames = 0;
    private trimStart = 0;
    private trimEnd = 0;
    private frameDurationSec = 1 / 30;
    private shouldCaptureWebcam = false;

    private frameBuffer = new Map<number, BufferedFrame>();
    private waiters = new Map<number, (frame: BufferedFrame) => void>();
    private workerLoops: Promise<void>[] = [];

    private async createFallbackFrame(frameIndex: number, timeSec: number): Promise<BufferedFrame> {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const screen = await createImageBitmap(canvas);
        return { frameIndex, timeSec, screen, webcam: null };
    }

    constructor(size: number, screenUrl: string, webcamUrl: string | null) {
        this.size = size;
        this.screenUrl = screenUrl;
        this.webcamUrl = webcamUrl;
    }

    async initialize() {
        const initPromises = [];
        for (let i = 0; i < this.size; i++) {
            initPromises.push(this.createWorker(i));
        }
        this.workers = await Promise.all(initPromises);
    }

    private async createWorker(id: number): Promise<VideoWorker> {
        const screenVideo = createVideoElement(this.screenUrl);
        const webcamVideo = this.webcamUrl ? createVideoElement(this.webcamUrl) : null;

        await Promise.all([
            waitForMetadata(screenVideo),
            webcamVideo ? waitForMetadata(webcamVideo) : Promise.resolve(),
        ]);

        return {
            id,
            screenVideo,
            webcamVideo,
            busy: false,
        };
    }

    getWorker(index: number): VideoWorker {
        return this.workers[index % this.size];
    }

    startPrefetch(args: {
        totalFrames: number;
        trimStart: number;
        trimEnd: number;
        frameDurationSec: number;
        shouldCaptureWebcam: boolean;
    }) {
        if (this.running) return;
        this.running = true;
        this.totalFrames = args.totalFrames;
        this.trimStart = args.trimStart;
        this.trimEnd = args.trimEnd;
        this.frameDurationSec = args.frameDurationSec;
        this.shouldCaptureWebcam = args.shouldCaptureWebcam;

        console.log(
            `[VideoPool] startPrefetch: workers=${this.size}, totalFrames=${this.totalFrames}, trimStart=${this.trimStart}, trimEnd=${this.trimEnd}, frameDurationSec=${this.frameDurationSec}, webcam=${this.shouldCaptureWebcam}`
        );

        this.workerLoops = this.workers.map((worker) => this.runWorkerLoop(worker));
    }

    async getFrame(frameIndex: number): Promise<BufferedFrame> {
        const existing = this.frameBuffer.get(frameIndex);
        if (existing) return existing;

        return new Promise<BufferedFrame>((resolve) => {
            if (this.destroyed) {
                this.createFallbackFrame(frameIndex, this.trimStart + frameIndex * this.frameDurationSec)
                    .then(resolve)
                    .catch(() => {
                        // last resort
                        const timeSec = Math.min(this.trimEnd, this.trimStart + frameIndex * this.frameDurationSec);
                        this.createFallbackFrame(frameIndex, timeSec).then(resolve);
                    });
                return;
            }

            console.log(`[VideoPool] getFrame wait: ${frameIndex}`);
            this.waiters.set(frameIndex, resolve);

            // Hard guard: never hang forever
            const timeoutMs = 15000;
            window.setTimeout(() => {
                const waiterStillThere = this.waiters.get(frameIndex);
                if (!waiterStillThere) return;
                this.waiters.delete(frameIndex);
                const timeSec = Math.min(this.trimEnd, this.trimStart + frameIndex * this.frameDurationSec);
                console.warn(`[VideoPool] getFrame timeout: ${frameIndex} (producing fallback)`);
                this.createFallbackFrame(frameIndex, timeSec)
                    .then((fallback) => {
                        this.pushFrame(fallback);
                        resolve(fallback);
                    })
                    .catch(() => {
                        // last resort: resolve with whatever we have
                        const maybe = this.frameBuffer.get(frameIndex);
                        if (maybe) resolve(maybe);
                    });
            }, timeoutMs);
        });
    }

    releaseFrame(frameIndex: number) {
        const frame = this.frameBuffer.get(frameIndex);
        if (!frame) return;
        try {
            frame.screen.close();
        } catch {}
        if (frame.webcam) {
            try {
                frame.webcam.close();
            } catch {}
        }
        this.frameBuffer.delete(frameIndex);
    }

    private pushFrame(frame: BufferedFrame) {
        if (this.destroyed) {
            try {
                frame.screen.close();
            } catch {}
            if (frame.webcam) {
                try {
                    frame.webcam.close();
                } catch {}
            }
            return;
        }

        this.frameBuffer.set(frame.frameIndex, frame);
        const waiter = this.waiters.get(frame.frameIndex);
        if (waiter) {
            this.waiters.delete(frame.frameIndex);
            waiter(frame);
        }
    }

    private async runWorkerLoop(worker: VideoWorker): Promise<void> {
        // Each worker is responsible for frameIndex = worker.id, worker.id + size, ...
        console.log(`[VideoPool] worker ${worker.id} loop start`);
        for (let frameIndex = worker.id; frameIndex < this.totalFrames; frameIndex += this.size) {
            if (this.destroyed) return;

            // Backpressure: keep a small window of buffered frames
            const maxBuffered = Math.max(this.size * 3, 12);
            while (!this.destroyed && this.frameBuffer.size >= maxBuffered) {
                await new Promise<void>((r) => setTimeout(r, 1));
            }

            const timeSec = Math.min(this.trimEnd, this.trimStart + frameIndex * this.frameDurationSec);

            try {
                if (frameIndex % (this.size * 10) === 0) {
                    console.log(
                        `[VideoPool] worker ${worker.id} preparing frameIndex=${frameIndex} timeSec=${timeSec.toFixed(3)} buffered=${this.frameBuffer.size}`
                    );
                }
                const seekTimeoutMs = 8000;
                await Promise.race([
                    this.prepareFrame(worker, timeSec),
                    new Promise<void>((_, reject) =>
                        window.setTimeout(() => reject(new Error("prepareFrame timeout")), seekTimeoutMs)
                    ),
                ]);

                // const frameWaitTimeoutMs = 2000;
                // await Promise.race([
                //     waitForNextVideoFrame(worker.screenVideo),
                //     new Promise<void>((_, reject) =>
                //         window.setTimeout(() => reject(new Error("screen frame wait timeout")), frameWaitTimeoutMs)
                //     ),
                // ]);
                const screenBitmap = await createImageBitmap(worker.screenVideo);

                let webcamBitmap: ImageBitmap | null = null;
                if (this.shouldCaptureWebcam && worker.webcamVideo) {
                    await Promise.race([
                        waitForNextVideoFrame(worker.webcamVideo),
                        new Promise<void>((_, reject) =>
                            window.setTimeout(() => reject(new Error("webcam frame wait timeout")), frameWaitTimeoutMs)
                        ),
                    ]);
                    webcamBitmap = await createImageBitmap(worker.webcamVideo);
                }

                this.pushFrame({
                    frameIndex,
                    timeSec,
                    screen: screenBitmap,
                    webcam: webcamBitmap,
                });
            } catch (e) {
                console.warn(
                    `[VideoPool] worker ${worker.id} failed to prepare/capture frameIndex=${frameIndex} timeSec=${timeSec}:`,
                    e
                );
                // Never skip producing; otherwise render will wait forever.
                try {
                    const fallback = await this.createFallbackFrame(frameIndex, timeSec);
                    this.pushFrame(fallback);
                } catch {
                    // ignore
                }
            }
        }
        console.log(`[VideoPool] worker ${worker.id} loop done`);
    }

    async prepareFrame(worker: VideoWorker, time: number): Promise<void> {
        const promises: Promise<void>[] = [];
        
        // Seek screen video
        if (Math.abs(worker.screenVideo.currentTime - time) > 0.001) {
            promises.push(seekMedia(worker.screenVideo, time));
        }

        // Seek webcam video
        if (worker.webcamVideo) {
            if (Math.abs(worker.webcamVideo.currentTime - time) > 0.001) {
                promises.push(seekMedia(worker.webcamVideo, time));
            }
        }

        await Promise.all(promises);
    }

    destroy() {
        this.destroyed = true;
        this.running = false;

        // Resolve any pending waiters to avoid dangling promises
        this.waiters.forEach((resolve, frameIndex) => {
            const fallback = this.frameBuffer.get(frameIndex);
            if (fallback) {
                resolve(fallback);
            }
        });
        this.waiters.clear();

        // Release any buffered frames
        Array.from(this.frameBuffer.keys()).forEach((k) => this.releaseFrame(k));

        this.workers.forEach(worker => {
            try {
                worker.screenVideo.src = "";
                worker.screenVideo.load();
                worker.screenVideo.remove();
            } catch {}
            
            if (worker.webcamVideo) {
                try {
                    worker.webcamVideo.src = "";
                    worker.webcamVideo.load();
                    worker.webcamVideo.remove();
                } catch {}
            }
        });
        this.workers = [];
    }
}
