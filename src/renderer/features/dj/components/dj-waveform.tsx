import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';

import { type DjWaveformAnalysis } from '../dj-waveform-analysis';
import styles from './dj-waveform.module.css';

type ZoomLevel = 1 | 2 | 4 | 8;

const ZOOM_LEVELS: ZoomLevel[] = [1, 2, 4, 8];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const prepareCanvas = (canvas: HTMLCanvasElement) => {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, height, width };
};

const getFrequencyColor = (
    amplitude: number,
    low: number,
    mid: number,
    high: number,
    alpha = 1,
) => {
    const boostedLow = Math.pow(low * 1.4, 1.25);
    const boostedMid = Math.pow(mid * 0.9, 1.25);
    const boostedHigh = Math.pow(high * 2.5, 1.25);
    const total = boostedLow + boostedMid + boostedHigh || 1;
    const lowMix = boostedLow / total;
    const midMix = boostedMid / total;
    const highMix = boostedHigh / total;
    const brightness = 0.72 + amplitude * 0.28;
    const red = Math.round((255 * lowMix + 55 * midMix + 35 * highMix) * brightness);
    const green = Math.round((55 * lowMix + 245 * midMix + 170 * highMix) * brightness);
    const blue = Math.round((85 * lowMix + 80 * midMix + 255 * highMix) * brightness);
    return `rgb(${clamp(red, 0, 255)} ${clamp(green, 0, 255)} ${clamp(blue, 0, 255)} / ${alpha})`;
};

const drawBeatMarkers = (
    context: CanvasRenderingContext2D,
    bpm: number | undefined,
    beatOffset: number | undefined,
    height: number,
    viewEnd: number,
    viewStart: number,
    width: number,
) => {
    if (!bpm || beatOffset === undefined || viewEnd <= viewStart) return;
    const interval = 60 / bpm;
    const firstBeat = Math.ceil((viewStart - beatOffset) / interval);
    const lastBeat = Math.floor((viewEnd - beatOffset) / interval);

    for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
        const time = beatOffset + beat * interval;
        const x = ((time - viewStart) / (viewEnd - viewStart)) * width;
        const major = ((beat % 4) + 4) % 4 === 0;
        context.beginPath();
        context.moveTo(Math.round(x) + 0.5, 0);
        context.lineTo(Math.round(x) + 0.5, height);
        context.lineWidth = major ? 1.5 : 1;
        context.strokeStyle = major ? 'rgb(255 255 255 / 38%)' : 'rgb(255 255 255 / 14%)';
        context.stroke();
    }
};

const drawBars = (
    context: CanvasRenderingContext2D,
    analysis: DjWaveformAnalysis,
    eqKills: { high: boolean; low: boolean; mid: boolean },
    height: number,
    viewEnd: number,
    viewStart: number,
    width: number,
    alpha = 1,
) => {
    const centre = height / 2;
    const binDuration = analysis.duration / analysis.amplitudes.length;
    const visibleBins = Math.max(1, (viewEnd - viewStart) / binDuration);
    const targetBars = Math.max(1, Math.floor(width / 3));
    const groupSize = Math.max(1, Math.ceil(visibleBins / targetBars));
    const firstGroup = Math.floor(viewStart / binDuration / groupSize) * groupSize;
    const lastGroup = Math.ceil(viewEnd / binDuration / groupSize) * groupSize;
    const barWidth = clamp(((binDuration * groupSize) / (viewEnd - viewStart)) * width * 0.7, 1, 3);

    for (let group = firstGroup; group <= lastGroup; group += groupSize) {
        const startBin = Math.max(0, group);
        const endBin = Math.min(analysis.amplitudes.length, group + groupSize);
        if (startBin >= endBin) continue;
        let amplitude = 0;
        let low = 0;
        let mid = 0;
        let high = 0;

        for (let bin = startBin; bin < endBin; bin += 1) {
            amplitude = Math.max(amplitude, analysis.amplitudes[bin]);
            if (!eqKills.low) low += analysis.low[bin];
            if (!eqKills.mid) mid += analysis.mid[bin];
            if (!eqKills.high) high += analysis.high[bin];
        }

        const time = ((group + groupSize / 2) / analysis.amplitudes.length) * analysis.duration;
        const x = ((time - viewStart) / (viewEnd - viewStart)) * width;
        const barHeight = Math.max(1, amplitude * (height * 0.44));
        const frequencyTotal = low + mid + high || 1;
        context.beginPath();
        context.moveTo(x + 0.5, centre - barHeight);
        context.lineTo(x + 0.5, centre + barHeight);
        context.lineWidth = barWidth;
        context.strokeStyle = getFrequencyColor(
            amplitude,
            low / frequencyTotal,
            mid / frequencyTotal,
            high / frequencyTotal,
            alpha,
        );
        context.stroke();
    }
};

export const DjWaveform = ({
    accent,
    analysis,
    audio,
    bpm,
    currentTime,
    deck,
    duration,
    eqKills,
    isPlaying,
    onSeek,
}: {
    accent: string;
    analysis?: DjWaveformAnalysis;
    audio: HTMLAudioElement;
    bpm?: number;
    currentTime: number;
    deck: 'A' | 'B';
    duration: number;
    eqKills: { high: boolean; low: boolean; mid: boolean };
    isPlaying: boolean;
    onSeek: (time: number) => void;
}) => {
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const pointerIdRef = useRef<number | undefined>(undefined);
    const [zoom, setZoom] = useState<ZoomLevel>(4);
    const visualZoomRef = useRef<number>(zoom);
    const remaining = Math.max(0, duration - currentTime);
    const warning =
        currentTime > 0 && remaining <= 10
            ? 'critical'
            : currentTime > 0 && remaining <= 30
              ? 'warning'
              : undefined;

    const seek = useCallback(
        (time: number) => {
            const nextTime = clamp(time, 0, duration || 0);
            onSeek(nextTime);
        },
        [duration, onSeek],
    );

    const draw = useCallback(
        (playhead = audio.currentTime, visualZoom = visualZoomRef.current) => {
            const mainCanvas = mainCanvasRef.current;
            const overviewCanvas = overviewCanvasRef.current;
            if (!mainCanvas || !overviewCanvas) return;

            const main = prepareCanvas(mainCanvas);
            const overview = prepareCanvas(overviewCanvas);
            if (!main || !overview) return;

            const visibleDuration = duration > 0 ? duration / visualZoom : 0;
            const viewStart = visualZoom === 1 ? 0 : playhead - visibleDuration / 2;
            const viewEnd = visualZoom === 1 ? duration : viewStart + visibleDuration;

            main.context.fillStyle = 'rgb(0 0 0 / 24%)';
            main.context.fillRect(0, 0, main.width, main.height);
            overview.context.fillStyle = 'rgb(0 0 0 / 34%)';
            overview.context.fillRect(0, 0, overview.width, overview.height);

            if (analysis && duration > 0) {
                drawBeatMarkers(
                    main.context,
                    bpm,
                    analysis.beatOffset,
                    main.height,
                    viewEnd,
                    viewStart,
                    main.width,
                );
                drawBars(
                    main.context,
                    analysis,
                    eqKills,
                    main.height,
                    viewEnd,
                    viewStart,
                    main.width,
                );
                drawBars(
                    overview.context,
                    analysis,
                    eqKills,
                    overview.height,
                    duration,
                    0,
                    overview.width,
                    0.86,
                );
            }

            if (duration > 0) {
                const playheadX =
                    visualZoom === 1
                        ? (playhead / duration) * main.width
                        : ((playhead - viewStart) / visibleDuration) * main.width;
                main.context.beginPath();
                main.context.moveTo(playheadX + 0.5, 0);
                main.context.lineTo(playheadX + 0.5, main.height);
                main.context.lineWidth = 2;
                main.context.strokeStyle = '#ffffff';
                main.context.stroke();

                const overviewPlayhead = (playhead / duration) * overview.width;
                overview.context.fillStyle = 'rgb(0 0 0 / 28%)';
                overview.context.fillRect(0, 0, overviewPlayhead, overview.height);
                overview.context.beginPath();
                overview.context.moveTo(overviewPlayhead + 0.5, 0);
                overview.context.lineTo(overviewPlayhead + 0.5, overview.height);
                overview.context.lineWidth = 1.5;
                overview.context.strokeStyle = accent;
                overview.context.stroke();

                if (visualZoom > 1) {
                    const viewportStart = clamp(viewStart / duration, 0, 1) * overview.width;
                    const viewportEnd = clamp(viewEnd / duration, 0, 1) * overview.width;
                    overview.context.strokeStyle = 'rgb(255 255 255 / 62%)';
                    overview.context.lineWidth = 1;
                    overview.context.strokeRect(
                        viewportStart + 0.5,
                        0.5,
                        Math.max(1, viewportEnd - viewportStart - 1),
                        overview.height - 1,
                    );
                }
            }
        },
        [accent, analysis, audio, bpm, duration, eqKills],
    );

    useEffect(() => {
        draw();
        const resizeObserver = new ResizeObserver(() => draw());
        if (mainCanvasRef.current) resizeObserver.observe(mainCanvasRef.current);
        if (overviewCanvasRef.current) resizeObserver.observe(overviewCanvasRef.current);
        return () => resizeObserver.disconnect();
    }, [draw]);

    useEffect(() => {
        if (!isPlaying) draw(currentTime);
    }, [currentTime, draw, isPlaying]);

    useEffect(() => {
        let animationFrame = 0;
        const animate = () => {
            const zoomDifference = zoom - visualZoomRef.current;
            if (Math.abs(zoomDifference) < 0.005) visualZoomRef.current = zoom;
            else visualZoomRef.current += zoomDifference * 0.14;
            draw(audio.currentTime, visualZoomRef.current);
            if (isPlaying || visualZoomRef.current !== zoom) {
                animationFrame = window.requestAnimationFrame(animate);
            }
        };
        animationFrame = window.requestAnimationFrame(animate);
        return () => window.cancelAnimationFrame(animationFrame);
    }, [audio, draw, isPlaying, zoom]);

    const seekFromMain = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!duration) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        const visualZoom = visualZoomRef.current;
        const visibleDuration = duration / visualZoom;
        const viewStart = visualZoom === 1 ? 0 : audio.currentTime - visibleDuration / 2;
        seek(viewStart + position * visibleDuration);
    };

    return (
        <div
            className={styles.waveformTools}
            data-high-killed={eqKills.high}
            data-low-killed={eqKills.low}
            data-mid-killed={eqKills.mid}
            data-warning={warning}
        >
            <div className={styles.overview}>
                <canvas aria-hidden ref={overviewCanvasRef} />
                <input
                    aria-label={`Deck ${deck} position`}
                    aria-valuetext={`${Math.round(currentTime)} seconds of ${Math.round(duration)} seconds`}
                    disabled={!duration}
                    max={duration || 1}
                    min={0}
                    onChange={(event) => seek(Number(event.currentTarget.value))}
                    step={0.1}
                    type="range"
                    value={Math.min(currentTime, duration || 0)}
                />
            </div>
            <div aria-label={`Deck ${deck} waveform`} className={styles.mainWaveform}>
                <canvas
                    onPointerDown={(event) => {
                        pointerIdRef.current = event.pointerId;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        seekFromMain(event);
                    }}
                    onPointerMove={(event) => {
                        if (pointerIdRef.current === event.pointerId) seekFromMain(event);
                    }}
                    onPointerUp={(event) => {
                        if (pointerIdRef.current === event.pointerId) {
                            pointerIdRef.current = undefined;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                    }}
                    ref={mainCanvasRef}
                />
                <div aria-label={`Deck ${deck} waveform zoom`} className={styles.zoomControls}>
                    {ZOOM_LEVELS.map((level) => (
                        <button
                            aria-label={`Deck ${deck} waveform zoom ${level === 1 ? 'Fit' : `${level}x`}`}
                            aria-pressed={zoom === level}
                            disabled={!duration}
                            key={level}
                            onClick={() => setZoom(level)}
                            type="button"
                        >
                            {level === 1 ? 'Fit' : `${level}×`}
                        </button>
                    ))}
                </div>
                {warning && (
                    <output aria-live="polite" className={styles.endWarning}>
                        Ending in {Math.ceil(remaining)}s
                    </output>
                )}
            </div>
        </div>
    );
};
