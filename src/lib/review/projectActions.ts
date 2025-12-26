import { get } from "svelte/store";
import {
    lastRecording,
    currentProject,
    appView,
    generalLayoutState,
    screenLayoutState,
    webcamLayoutState,
    activeTheme,
    activeBackground,
    recordingFPS,
    canvasDimensions
} from "../stores";
import { timelineStore } from "../stores/timeline";
import { reviewSessionStore, transcriptionResult } from "../stores/reviewSession";
import { backendAPI } from "../backend/backendAPI";
import { render as renderVideo, type RenderResult } from "../rendering";
import { getResolutionPresets, frameRatePresets } from "../rendering/renderPresets";
import { buildPersistedReviewState, buildPersistedReviewStateForContinuation } from "./reviewProjectState";
import type { RecordingSegment } from "../stores";
import { getPointerRecords } from "../pointer/pointerState";

export const saveProject = async (isSaving: (v: boolean) => void, onSaved: () => void) => {
    const recording = get(lastRecording);
    if (!recording) return;
    isSaving(true);
    try {
        const projectName = recording.projectId
            ? get(currentProject)?.name || `Recording ${new Date().toLocaleString()}`
            : `Recording ${new Date().toLocaleString()}`;

        const session = get(reviewSessionStore);
        const segments = recording.segments || [{
            id: crypto.randomUUID(),
            assets: recording.assets,
            events: recording.events,
            startOffset: 0,
            duration: recording.duration,
            trimStart: 0,
            trimEnd: 0,
        }];

        const reviewState = buildPersistedReviewState({
            timeline: timelineStore.snapshot(),
            includePointerTrack: session.includePointerTrack,
            includeWebcamTrack: session.includeWebcamTrack,
            includeAudioTrack: session.includeAudioTrack,
            includeClickTrack: session.includeClickTrack,
            pointerIndicatorSize: session.pointerIndicatorSize,
            pointerIconSelection: session.pointerIconSelection,
            renderFormat: session.renderFormat,
            selectedResolutionPreset: session.selectedResolutionPreset,
            selectedFrameRatePreset: session.selectedFrameRatePreset,
            showCaptions: session.showCaptions,
            captionFontSize: session.captionFontSize,
            captionColor: session.captionColor,
            transcriptionVersions: session.transcriptionVersions,
            activeTranscriptionId: session.activeTranscriptionId,
        });

        const recordingWithSegments = { ...recording, segments, reviewState };
        const result = await backendAPI.saveProject(projectName, recordingWithSegments, recording.projectId);

        if (result.success) {
            lastRecording.update(rec => rec ? { ...rec, projectId: result.projectId, segments } : rec);
            currentProject.set({
                id: result.projectId,
                name: projectName,
                segments,
                totalDuration: recording.duration,
                fileName: recording.fileName,
                previewPath: recording.previewPath,
                reviewState,
            });
            onSaved();
        }
    } catch (error) {
        console.error("Failed to save project:", error);
    } finally {
        isSaving(false);
    }
};

export const continueRecording = () => {
    const recording = get(lastRecording);
    if (!recording) return;

    const existingSegments: RecordingSegment[] = recording.segments || [{
        id: crypto.randomUUID(),
        assets: recording.assets,
        events: recording.events,
        startOffset: 0,
        duration: recording.duration,
        trimStart: 0,
        trimEnd: 0,
    }];

    const trimmedTotalDurationMs = existingSegments.reduce(
        (sum, seg) => sum + Math.max(0, seg.duration - seg.trimStart - seg.trimEnd),
        0
    );

    const session = get(reviewSessionStore);
    const reviewState = buildPersistedReviewStateForContinuation({
        timeline: timelineStore.snapshot(),
        includePointerTrack: session.includePointerTrack,
        includeWebcamTrack: session.includeWebcamTrack,
        includeAudioTrack: session.includeAudioTrack,
        includeClickTrack: session.includeClickTrack,
        pointerIndicatorSize: session.pointerIndicatorSize,
        pointerIconSelection: session.pointerIconSelection,
        renderFormat: session.renderFormat,
        selectedResolutionPreset: session.selectedResolutionPreset,
        selectedFrameRatePreset: session.selectedFrameRatePreset,
        showCaptions: session.showCaptions,
        captionFontSize: session.captionFontSize,
        captionColor: session.captionColor,
        transcriptionVersions: session.transcriptionVersions,
        activeTranscriptionId: session.activeTranscriptionId,
    });

    currentProject.set({
        id: recording.projectId,
        name: get(currentProject)?.name || `Recording ${new Date().toLocaleString()}`,
        segments: existingSegments,
        totalDuration: trimmedTotalDurationMs,
        fileName: recording.fileName,
        previewPath: recording.previewPath,
        reviewState,
    });

    appView.set("recorder");
};

export const downloadEditedVideo = async (
    isRendering: (v: boolean) => void,
    setProgress: (v: number) => void,
    cancelTokenRef: { current: { cancelled: boolean } | null },
    options?: { pointerIconUrl?: string | null; pointerIconPressedUrl?: string | null }
) => {
    const recording = get(lastRecording);
    if (!recording) return;

    isRendering(true);
    setProgress(0);

    const token = { cancelled: false };
    cancelTokenRef.current = token;

    const recordingBaseName = recording.fileName ? recording.fileName.replace(/\.[^.]+$/, "") : "recording";
    const getDownloadName = (ext: string) => `edited-${recordingBaseName}.${ext}`;

    try {
        const session = get(reviewSessionStore);
        const presets = getResolutionPresets(get(canvasDimensions));
        const preset = presets.find(p => p.id === session.selectedResolutionPreset);
        const scale = preset?.scale ?? 1;

        const dims = get(canvasDimensions);
        const exportCanvasSize = {
            title: dims.title,
            width: Math.max(2, Math.round(dims.width * scale)),
            height: Math.max(2, Math.round(dims.height * scale)),
        };

        const fpsPreset = frameRatePresets.find(p => p.id === session.selectedFrameRatePreset);
        const exportFrameRate = (!fpsPreset || fpsPreset.fps === "original") ? (get(recordingFPS) || 30) : fpsPreset.fps;

        const pointerRecords = getPointerRecords(recording.events);

        const result = await renderVideo(
            recording.assets,
            recording.duration,
            timelineStore.snapshot(),
            {
                frameRate: exportFrameRate,
                canvasSize: exportCanvasSize,
                generalLayoutState: get(generalLayoutState),
                screenLayoutState: get(screenLayoutState),
                webcamLayoutState: get(webcamLayoutState),
                theme: get(activeTheme),
                background: get(activeBackground),
                toggles: {
                    showScreen: true,
                    showWebcam: session.includeWebcamTrack,
                    showMouse: session.includePointerTrack,
                    showClicks: session.includeClickTrack,
                    showCaptions: session.showCaptions,
                    captionFontSize: session.captionFontSize,
                    captionColor: session.captionColor,
                    includeAudio: session.includeAudioTrack,
                },
                captions: get(transcriptionResult)?.segments ?? undefined,
                pointerRecords,
                pointerIconUrl: options?.pointerIconUrl ?? null,
                pointerIconPressedUrl: options?.pointerIconPressedUrl ?? null,
                pointerSize: session.pointerIndicatorSize,
                cancelToken: token,
                onProgress: (current, total) => {
                    setProgress(Math.round((current / total) * 100));
                },
            },
            recording.segments
        );

        if (result && "blob" in result) {
            const url = URL.createObjectURL(result.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = getDownloadName(result.ext ?? "mp4");
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
                anchor.remove();
            }, 1000);
        } else if (result && result.type === "file") {
            const savedPath = await backendAPI.saveRenderedFile(
                result.filePath,
                getDownloadName(result.ext ?? "mp4")
            );
            if (!savedPath) {
                console.warn("Rendered file save cancelled");
                return;
            }
        }
    } catch (error) {
        if (error instanceof Error && error.message === "Render cancelled") return;
        console.error("Failed to render video", error);
    } finally {
        isRendering(false);
        setProgress(0);
        cancelTokenRef.current = null;
    }
};
