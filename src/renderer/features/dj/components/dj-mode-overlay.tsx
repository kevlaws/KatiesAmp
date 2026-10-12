import { useQuery } from '@tanstack/react-query';
import { useWavesurfer } from '@wavesurfer/react';
import formatDuration from 'format-duration';
import {
    DragEvent,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { detectBpm, getCachedBpm, setCachedBpm } from '../dj-bpm';
import {
    analyzeDjWaveform,
    type DjWaveformAnalysis,
    getCachedDjWaveform,
    setCachedDjWaveform,
} from '../dj-waveform-analysis';
import styles from './dj-mode-overlay.module.css';
import { DjWaveform } from './dj-waveform';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { getSongUrl } from '/@/renderer/features/player/audio-player/hooks/use-stream-url';
import { sharedQueries } from '/@/renderer/features/shared/api/shared-api';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { useCurrentServer, usePlaybackSettings, useSetDjModeExpanded } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { Select } from '/@/shared/components/select/select';
import { TextInput } from '/@/shared/components/text-input/text-input';
import {
    AlbumListSort,
    LibraryItem,
    QueueSong,
    Song,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

type DeckGraph = {
    analyser: AnalyserNode;
    channel: GainNode;
    context: AudioContext;
    filter: BiquadFilterNode;
    high: BiquadFilterNode;
    input: GainNode;
    limiter: DynamicsCompressorNode;
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    output: GainNode;
};

type DeckId = 'A' | 'B';

type MasterGraph = {
    analyser: AnalyserNode;
    context: AudioContext;
    input: GainNode;
    limiter: DynamicsCompressorNode;
    output: GainNode;
};

type MeterState = {
    level: number;
    limiting: boolean;
};

const ALL_TRACKS = '__all_tracks__';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSyncPitch = (bpm?: number, otherBpm?: number) => {
    if (!bpm || !otherBpm) return undefined;

    return [otherBpm / 2, otherBpm, otherBpm * 2]
        .map((targetBpm) => (targetBpm / bpm - 1) * 100)
        .sort((left, right) => Math.abs(left) - Math.abs(right))[0];
};

const equalPowerMix = (crossfader: number) => {
    const position = (clamp(crossfader, -1, 1) + 1) / 2;
    return {
        a: Math.cos(position * (Math.PI / 2)),
        b: Math.sin(position * (Math.PI / 2)),
    };
};

const configureLimiter = (limiter: DynamicsCompressorNode) => {
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
};

const readPeak = (analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>) => {
    analyser.getByteTimeDomainData(samples);
    let peak = 0;

    for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample - 128) / 128);
    }

    return peak;
};

const formatTime = (seconds: number) =>
    formatDuration(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000);

const toQueueSong = (song: Song, deck: DeckId): QueueSong => ({
    ...song,
    _uniqueId: `dj-${deck}-${song.id}`,
});

const LevelMeter = ({ label, meter }: { label: string; meter: MeterState }) => (
    <div className={styles.levelMeterGroup}>
        <div
            aria-label={label}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(meter.level * 100)}
            className={styles.levelMeter}
            role="meter"
        >
            <span
                className={styles.levelMeterFill}
                style={{ width: `${Math.min(100, meter.level * 100)}%` }}
            />
        </div>
        <span className={`${styles.clipIndicator} ${meter.limiting ? styles.isClipping : ''}`}>
            {meter.limiting ? 'CLIP' : 'OK'}
        </span>
    </div>
);

const Deck = ({
    deck,
    mix,
    mixer,
    onBpmChange,
    onDropSong,
    onEject,
    otherBpm,
    song,
}: {
    deck: DeckId;
    mix: number;
    mixer?: MasterGraph;
    onBpmChange: (deck: DeckId, bpm?: number) => void;
    onDropSong: () => void;
    onEject: () => void;
    otherBpm?: number;
    song?: Song;
}) => {
    const { transcode } = usePlaybackSettings();
    const audioRef = useRef<HTMLAudioElement>(document.createElement('audio'));
    const graphRef = useRef<DeckGraph | undefined>(undefined);
    const waveformRef = useRef<HTMLDivElement>(null);
    const [bpm, setBpm] = useState<number>();
    const [channelVolume, setChannelVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [deckGain, setDeckGain] = useState(1);
    const [duration, setDuration] = useState(0);
    const [eq, setEq] = useState({ high: 0, low: 0, mid: 0 });
    const [eqKills, setEqKills] = useState({ high: false, low: false, mid: false });
    const [error, setError] = useState('');
    const [filterValue, setFilterValue] = useState(0);
    const [isAnalyzingBpm, setIsAnalyzingBpm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [meter, setMeter] = useState<MeterState>({ level: 0, limiting: false });
    const [pitchBend, setPitchBend] = useState(0);
    const [pitch, setPitch] = useState(0);
    const [pitchRange, setPitchRange] = useState<8 | 15>(8);
    const [waveformAnalysis, setWaveformAnalysis] = useState<DjWaveformAnalysis>();
    const effectiveBpm = bpm ? Math.round(bpm * (1 + pitch / 100) * 10) / 10 : undefined;
    const playbackRate = 1 + (pitch + pitchBend) / 100;
    const syncPitch = getSyncPitch(bpm, otherBpm);
    const canSync = syncPitch !== undefined;

    const accent = deck === 'A' ? '#71d8bd' : '#e7b36a';
    const { wavesurfer } = useWavesurfer({
        container: waveformRef,
        cursorWidth: 0,
        height: 1,
        interact: false,
        media: audioRef.current,
        progressColor: 'transparent',
        waveColor: 'transparent',
    });

    useEffect(() => {
        if (!mixer) return;

        const audio = audioRef.current;
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';

        const { context } = mixer;
        const source = context.createMediaElementSource(audio);
        const input = context.createGain();
        const low = context.createBiquadFilter();
        const mid = context.createBiquadFilter();
        const high = context.createBiquadFilter();
        const filter = context.createBiquadFilter();
        const channel = context.createGain();
        const analyser = context.createAnalyser();
        const limiter = context.createDynamicsCompressor();
        const output = context.createGain();

        low.type = 'lowshelf';
        low.frequency.value = 250;
        mid.type = 'peaking';
        mid.frequency.value = 1_000;
        mid.Q.value = 1;
        high.type = 'highshelf';
        high.frequency.value = 4_000;
        filter.type = 'allpass';
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        configureLimiter(limiter);

        source.connect(input);
        input.connect(low);
        low.connect(mid);
        mid.connect(high);
        high.connect(filter);
        filter.connect(channel);
        channel.connect(analyser);
        analyser.connect(limiter);
        limiter.connect(output);
        output.connect(mixer.input);
        graphRef.current = {
            analyser,
            channel,
            context,
            filter,
            high,
            input,
            limiter,
            low,
            mid,
            output,
        };

        const samples = new Uint8Array(analyser.fftSize);
        let animationFrame = 0;
        let lastUpdate = 0;
        const updateMeter = (time: number) => {
            if (time - lastUpdate >= 50) {
                const level = readPeak(analyser, samples);
                const nextMeter = {
                    level,
                    limiting:
                        level > 0.01 &&
                        Number.isFinite(limiter.reduction) &&
                        limiter.reduction < -0.25,
                };
                setMeter((current) =>
                    Math.abs(current.level - nextMeter.level) < 0.005 &&
                    current.limiting === nextMeter.limiting
                        ? current
                        : nextMeter,
                );
                lastUpdate = time;
            }
            animationFrame = window.requestAnimationFrame(updateMeter);
        };
        animationFrame = window.requestAnimationFrame(updateMeter);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            audio.pause();
            audio.removeAttribute('src');
            source.disconnect();
            input.disconnect();
            low.disconnect();
            mid.disconnect();
            high.disconnect();
            filter.disconnect();
            channel.disconnect();
            analyser.disconnect();
            limiter.disconnect();
            output.disconnect();
            graphRef.current = undefined;
            setMeter({ level: 0, limiting: false });
        };
    }, [mixer]);

    useEffect(() => {
        const audio = audioRef.current;
        const handleDuration = () =>
            setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        const handleEnded = () => setIsPlaying(false);
        const handlePause = () => setIsPlaying(false);
        const handlePlay = () => setIsPlaying(true);
        const handleTime = () => setCurrentTime(audio.currentTime || 0);

        audio.addEventListener('durationchange', handleDuration);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('timeupdate', handleTime);

        return () => {
            audio.removeEventListener('durationchange', handleDuration);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('timeupdate', handleTime);
        };
    }, []);

    useEffect(() => {
        const graph = graphRef.current;
        if (!graph) return;
        const now = graph.context.currentTime;
        graph.input.gain.setTargetAtTime(deckGain, now, 0.01);
        graph.low.gain.setTargetAtTime(eqKills.low ? -30 : eq.low, now, 0.01);
        graph.mid.gain.setTargetAtTime(eqKills.mid ? -30 : eq.mid, now, 0.01);
        graph.high.gain.setTargetAtTime(eqKills.high ? -30 : eq.high, now, 0.01);
        graph.channel.gain.setTargetAtTime(channelVolume, now, 0.01);
        graph.output.gain.setTargetAtTime(clamp(mix, 0, 1), now, 0.01);

        if (Math.abs(filterValue) < 0.01) {
            graph.filter.type = 'allpass';
        } else if (filterValue < 0) {
            graph.filter.type = 'lowpass';
            graph.filter.frequency.setTargetAtTime(
                20_000 * Math.pow(0.01, Math.abs(filterValue)),
                now,
                0.01,
            );
        } else {
            graph.filter.type = 'highpass';
            graph.filter.frequency.setTargetAtTime(20 * Math.pow(250, filterValue), now, 0.01);
        }
    }, [channelVolume, deckGain, eq, eqKills, filterValue, mix]);

    useEffect(() => {
        const audio = audioRef.current;
        audio.preservesPitch = true;
        audio.playbackRate = playbackRate;
    }, [playbackRate]);

    useEffect(() => {
        onBpmChange(deck, effectiveBpm);
    }, [deck, effectiveBpm, onBpmChange]);

    useEffect(() => {
        if (!wavesurfer) return;

        const audio = audioRef.current;
        audio.pause();
        setBpm(undefined);
        setCurrentTime(0);
        setDuration(0);
        setError('');
        setPitchBend(0);
        setPitch(0);
        setWaveformAnalysis(undefined);

        if (!song) {
            setIsAnalyzingBpm(false);
            setIsLoading(false);
            wavesurfer.empty();
            return;
        }

        let cancelled = false;
        const knownBpm = getCachedBpm(song) || song.bpm || undefined;
        const cachedWaveform = getCachedDjWaveform(song);
        setBpm(knownBpm);
        setWaveformAnalysis(cachedWaveform);
        setIsAnalyzingBpm(!knownBpm);
        setIsLoading(true);

        void getSongUrl(
            toQueueSong(song, deck),
            {
                bitrate: transcode.bitrate,
                enabled: transcode.enabled,
                format: transcode.format,
                maxSampleRate: transcode.maxSampleRate,
            },
            false,
            true,
        )
            .then(async (url) => {
                if (cancelled) return;
                await wavesurfer.load(url);
                if (cancelled) return;
                await new Promise((resolve) => window.setTimeout(resolve, 0));
                const decoded = wavesurfer.getDecodedData();
                const detectedBpm = knownBpm || (decoded ? detectBpm(decoded) : undefined);
                if (cancelled) return;
                setBpm(detectedBpm);
                if (!knownBpm && detectedBpm) setCachedBpm(song, detectedBpm);
                if (!cachedWaveform && decoded) {
                    await new Promise((resolve) => window.setTimeout(resolve, 0));
                    const analysis = analyzeDjWaveform(decoded, detectedBpm);
                    if (cancelled) return;
                    setWaveformAnalysis(analysis);
                    setCachedDjWaveform(song, analysis);
                }
            })
            .catch((loadError) => {
                if (cancelled || (loadError instanceof Error && loadError.name === 'AbortError')) {
                    return;
                }
                setError('Unable to load this track');
            })
            .finally(() => {
                if (!cancelled) {
                    setIsAnalyzingBpm(false);
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [deck, song, transcode, wavesurfer]);

    const togglePlayback = async () => {
        if (!song || isLoading || error) return;
        const audio = audioRef.current;
        const context = graphRef.current?.context;

        if (audio.paused) {
            if (context?.state === 'suspended') await context.resume();
            await audio.play().catch(() => setError('Playback could not start'));
        } else {
            audio.pause();
        }
    };

    const cue = () => {
        const audio = audioRef.current;
        audio.pause();
        audio.currentTime = 0;
        setCurrentTime(0);
    };

    const matchOtherDeck = () => {
        if (syncPitch === undefined) return;
        setPitch(Math.round(clamp(syncPitch, -pitchRange, pitchRange) * 10) / 10);
    };

    const selectPitchRange = (nextRange: 8 | 15) => {
        setPitchRange(nextRange);
        setPitch((currentPitch) => clamp(currentPitch, -nextRange, nextRange));
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        onDropSong();
    };

    return (
        <>
            <section
                aria-label={`Deck ${deck}`}
                className={styles.deck}
                data-deck={deck.toLowerCase()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
            >
                <header className={styles.deckHeader}>
                    <div className={styles.deckIdentity}>
                        <span className={styles.deckBadge}>Deck {deck}</span>
                        <Button
                            aria-label={`Eject Deck ${deck}`}
                            disabled={!song}
                            onClick={onEject}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Eject
                        </Button>
                    </div>
                    <div className={styles.deckHeaderActions}>
                        <span className={styles.deckState}>
                            {error ||
                                (!song
                                    ? 'Not ready'
                                    : isLoading
                                      ? 'Loading…'
                                      : isPlaying
                                        ? 'Playing'
                                        : 'Ready')}
                        </span>
                        <div className={styles.transport}>
                            <Button
                                disabled={!canSync}
                                onClick={matchOtherDeck}
                                size="sm"
                                title={
                                    canSync
                                        ? 'Match this deck to the other deck'
                                        : 'Load and analyse both decks to enable BPM sync'
                                }
                                variant="default"
                            >
                                Sync BPM
                            </Button>
                            <Button disabled={!song} onClick={cue} size="sm" variant="default">
                                Cue
                            </Button>
                            <Button
                                disabled={!song || isLoading || Boolean(error)}
                                onClick={() => void togglePlayback()}
                                size="sm"
                                variant="filled"
                            >
                                {isPlaying ? 'Pause' : 'Play'}
                            </Button>
                        </div>
                    </div>
                </header>

                <div className={styles.deckBody}>
                    <div className={styles.deckMain}>
                        <div className={styles.deckTrack}>
                            <div className={styles.artworkStack}>
                                <div aria-label={`Deck ${deck} artwork`} className={styles.artwork}>
                                    {song ? (
                                        <ItemImage
                                            alt=""
                                            id={song.id}
                                            itemType={LibraryItem.SONG}
                                            serverId={song._serverId}
                                            src={song.imageUrl}
                                            type="itemCard"
                                        />
                                    ) : (
                                        <Icon icon="disc" size="3xl" />
                                    )}
                                </div>
                                <output
                                    aria-label={`Deck ${deck} BPM`}
                                    className={styles.bpmReadout}
                                >
                                    {bpm
                                        ? `${effectiveBpm?.toFixed(1)} BPM`
                                        : isAnalyzingBpm
                                          ? 'BPM…'
                                          : 'No BPM'}
                                </output>
                            </div>
                            <div className={styles.trackCopy}>
                                <strong>{song?.name || `Drop a track onto Deck ${deck}`}</strong>
                                <span>{song?.artistName || 'No track loaded'}</span>
                                <span>{song?.album || ' '}</span>
                            </div>
                        </div>

                        <div className={styles.timeRow}>
                            <span>{formatTime(currentTime)}</span>
                            <span
                                aria-label="Frequency colours: treble blue, mids green, bass red"
                                className={styles.frequencyLegend}
                            >
                                <b data-killed={eqKills.high}>Treble</b>
                                <b data-killed={eqKills.mid}>Mid</b>
                                <b data-killed={eqKills.low}>Bass</b>
                            </span>
                            <span>{formatTime(duration)}</span>
                        </div>
                        <DjWaveform
                            accent={accent}
                            analysis={waveformAnalysis}
                            audio={audioRef.current}
                            bpm={bpm}
                            currentTime={currentTime}
                            deck={deck}
                            duration={duration}
                            eqKills={eqKills}
                            isPlaying={isPlaying}
                            onSeek={(time) => {
                                audioRef.current.currentTime = time;
                                setCurrentTime(time);
                            }}
                        />
                        <div aria-hidden className={styles.waveformDecoder} ref={waveformRef} />
                    </div>
                    <div className={styles.pitchControls}>
                        <div className={styles.pitchFader}>
                            <span>Pitch</span>
                            <output>{`${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}%`}</output>
                            <div className={styles.pitchSliderArea}>
                                <input
                                    aria-label={`Deck ${deck} pitch`}
                                    disabled={!song}
                                    max={pitchRange}
                                    min={-pitchRange}
                                    onChange={(event) =>
                                        setPitch(Number(event.currentTarget.value))
                                    }
                                    step={0.1}
                                    type="range"
                                    value={pitch}
                                />
                                <button
                                    aria-label={`Deck ${deck} centre pitch`}
                                    className={styles.pitchCentreButton}
                                    disabled={!song}
                                    onClick={() => setPitch(0)}
                                    title="Centre pitch"
                                    type="button"
                                >
                                    0
                                </button>
                            </div>
                            <div className={styles.pitchRangeActions}>
                                <button
                                    aria-label={`Deck ${deck} use 8 percent pitch range`}
                                    aria-pressed={pitchRange === 8}
                                    onClick={() => selectPitchRange(8)}
                                    title="Use ±8% pitch range"
                                    type="button"
                                >
                                    ±8
                                </button>
                                <button
                                    aria-label={`Deck ${deck} use 15 percent pitch range`}
                                    aria-pressed={pitchRange === 15}
                                    onClick={() => selectPitchRange(15)}
                                    title="Use ±15% pitch range"
                                    type="button"
                                >
                                    ±15
                                </button>
                            </div>
                        </div>
                        <div className={styles.bendControls}>
                            <span>Bend</span>
                            <div className={styles.bendActions}>
                                <button
                                    aria-label={`Deck ${deck} pitch bend down`}
                                    aria-pressed={pitchBend < 0}
                                    disabled={!song}
                                    onBlur={() => setPitchBend(0)}
                                    onKeyDown={(event) => {
                                        if (event.key === ' ' || event.key === 'Enter')
                                            setPitchBend(-2);
                                    }}
                                    onKeyUp={() => setPitchBend(0)}
                                    onPointerCancel={() => setPitchBend(0)}
                                    onPointerDown={() => setPitchBend(-2)}
                                    onPointerLeave={() => setPitchBend(0)}
                                    onPointerUp={() => setPitchBend(0)}
                                    type="button"
                                >
                                    −
                                </button>
                                <button
                                    aria-label={`Deck ${deck} pitch bend up`}
                                    aria-pressed={pitchBend > 0}
                                    disabled={!song}
                                    onBlur={() => setPitchBend(0)}
                                    onKeyDown={(event) => {
                                        if (event.key === ' ' || event.key === 'Enter')
                                            setPitchBend(2);
                                    }}
                                    onKeyUp={() => setPitchBend(0)}
                                    onPointerCancel={() => setPitchBend(0)}
                                    onPointerDown={() => setPitchBend(2)}
                                    onPointerLeave={() => setPitchBend(0)}
                                    onPointerUp={() => setPitchBend(0)}
                                    type="button"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <aside
                aria-label={`Deck ${deck} controls`}
                className={styles.deckMixer}
                data-deck={deck.toLowerCase()}
            >
                <span className={styles.mixerDeckLabel}>{deck}</span>
                <div className={styles.deckMixerControls}>
                    <div className={styles.trimControls}>
                        <RotaryDial
                            ariaLabel={`Deck ${deck} Gain`}
                            label="Gain"
                            max={1.25}
                            min={0}
                            onChange={setDeckGain}
                            resetValue={1}
                            step={0.01}
                            value={deckGain}
                            valueLabel={`${Math.round(deckGain * 100)}%`}
                        />
                        <RotaryDial
                            ariaLabel={`Deck ${deck} Filter`}
                            label="Filter"
                            max={1}
                            min={-1}
                            onChange={setFilterValue}
                            resetValue={0}
                            step={0.01}
                            value={filterValue}
                            valueLabel={
                                filterValue < -0.01
                                    ? `LP ${Math.round(Math.abs(filterValue) * 100)}%`
                                    : filterValue > 0.01
                                      ? `HP ${Math.round(filterValue * 100)}%`
                                      : 'Off'
                            }
                        />
                    </div>
                    <div className={styles.eqControls}>
                        {(
                            [
                                ['Treble', 'high'],
                                ['Mid', 'mid'],
                                ['Bass', 'low'],
                            ] as const
                        ).map(([label, band]) => (
                            <div className={styles.eqControl} key={band}>
                                <RotaryDial
                                    ariaLabel={`Deck ${deck} ${label}`}
                                    label={label}
                                    max={12}
                                    min={-12}
                                    onChange={(value) =>
                                        setEq((current) => ({ ...current, [band]: value }))
                                    }
                                    resetValue={0}
                                    step={1}
                                    value={eq[band]}
                                    valueLabel={`${eq[band]} dB`}
                                />
                                <button
                                    aria-label={`Deck ${deck} ${label} kill`}
                                    aria-pressed={eqKills[band]}
                                    className={styles.killButton}
                                    onClick={() =>
                                        setEqKills((current) => ({
                                            ...current,
                                            [band]: !current[band],
                                        }))
                                    }
                                    type="button"
                                >
                                    Kill
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className={styles.channelFaderGroup}>
                        <label className={styles.channelFader}>
                            <span>Channel volume</span>
                            <output>{Math.round(channelVolume * 100)}%</output>
                            <input
                                aria-label={`Deck ${deck} channel volume`}
                                max={1}
                                min={0}
                                onChange={(event) =>
                                    setChannelVolume(Number(event.currentTarget.value))
                                }
                                onDoubleClick={() => setChannelVolume(1)}
                                step={0.01}
                                title="Double-click to restore full channel volume"
                                type="range"
                                value={channelVolume}
                            />
                        </label>
                        <button
                            aria-label={`Reset Deck ${deck} channel volume`}
                            className={styles.channelReset}
                            onClick={() => setChannelVolume(1)}
                            type="button"
                        >
                            Reset
                        </button>
                    </div>
                    <LevelMeter label={`Deck ${deck} output level`} meter={meter} />
                </div>
            </aside>
        </>
    );
};

const RotaryDial = ({
    ariaLabel,
    label,
    max,
    min,
    onChange,
    resetValue,
    step,
    value,
    valueLabel,
}: {
    ariaLabel: string;
    label: string;
    max: number;
    min: number;
    onChange: (value: number) => void;
    resetValue: number;
    step: number;
    value: number;
    valueLabel: string;
}) => {
    const drag = useRef<undefined | { startValue: number; startY: number }>(undefined);
    const angle = -135 + ((value - min) / (max - min)) * 270;
    const updateValue = (nextValue: number) => {
        const steppedValue = min + Math.round((nextValue - min) / step) * step;
        onChange(clamp(steppedValue, min, max));
    };

    return (
        <label className={styles.rotaryDial}>
            <span>{label}</span>
            <span className={styles.dialControl}>
                <span aria-hidden className={styles.dialKnob}>
                    <span
                        className={styles.dialIndicator}
                        style={{ transform: `rotate(${angle}deg)` }}
                    />
                </span>
                <input
                    aria-label={ariaLabel}
                    aria-valuetext={valueLabel}
                    max={max}
                    min={min}
                    onChange={(event) => updateValue(Number(event.currentTarget.value))}
                    onDoubleClick={() => onChange(resetValue)}
                    onPointerCancel={() => {
                        drag.current = undefined;
                    }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.focus();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = { startValue: value, startY: event.clientY };
                    }}
                    onPointerMove={(event) => {
                        if (!drag.current) return;
                        const movement = (drag.current.startY - event.clientY) / 80;
                        updateValue(drag.current.startValue + movement * (max - min));
                    }}
                    onPointerUp={(event) => {
                        drag.current = undefined;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onWheel={(event) => {
                        event.preventDefault();
                        updateValue(value + (event.deltaY < 0 ? step : -step));
                    }}
                    step={step}
                    title="Drag vertically, use the mouse wheel or arrow keys. Double-click to reset."
                    type="range"
                    value={value}
                />
            </span>
            <output>{valueLabel}</output>
        </label>
    );
};

export const DjModeOverlay = () => {
    const closeDjMode = useSetDjModeExpanded();
    const currentServer = useCurrentServer();
    const [crossfadeEnabled, setCrossfadeEnabled] = useState(true);
    const [crossfader, setCrossfader] = useState(0);
    const [deckA, setDeckA] = useState<Song>();
    const [deckB, setDeckB] = useState<Song>();
    const [deckBpms, setDeckBpms] = useState<Partial<Record<DeckId, number>>>({});
    const [djAlbumId, setDjAlbumId] = useState(ALL_TRACKS);
    const [djMusicFolderId, setDjMusicFolderId] = useState(currentServer?.musicFolderId?.[0]);
    const [draggedPreparedIndex, setDraggedPreparedIndex] = useState<number>();
    const [draggedSong, setDraggedSong] = useState<Song>();
    const [master, setMaster] = useState(0.8);
    const [masterMeter, setMasterMeter] = useState<MeterState>({
        level: 0,
        limiting: false,
    });
    const [mixer, setMixer] = useState<MasterGraph>();
    const [prepared, setPrepared] = useState<Song[]>([]);
    const [preparedDropIndex, setPreparedDropIndex] = useState<number>();
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim());
    const mix = useMemo(
        () => (crossfadeEnabled ? equalPowerMix(crossfader) : { a: 1, b: 1 }),
        [crossfadeEnabled, crossfader],
    );
    const handleBpmChange = useCallback((deck: DeckId, bpm?: number) => {
        setDeckBpms((current) => (current[deck] === bpm ? current : { ...current, [deck]: bpm }));
    }, []);
    const musicFoldersQuery = useQuery(
        currentServer
            ? sharedQueries.musicFolders({ query: null, serverId: currentServer.id })
            : { enabled: false, queryKey: ['disabled', 'dj-music-folders'] },
    );
    const musicFolders = musicFoldersQuery.data;
    const albumsQuery = useQuery(
        albumQueries.list({
            options: { enabled: Boolean(currentServer?.id && djMusicFolderId) },
            query: {
                limit: 100,
                musicFolderId: djMusicFolderId,
                sortBy: AlbumListSort.NAME,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId: currentServer?.id || '',
        }),
    );
    const albums = albumsQuery.data?.items;

    useEffect(() => {
        const context = new AudioContext({ latencyHint: 'interactive' });
        const input = context.createGain();
        const limiter = context.createDynamicsCompressor();
        const output = context.createGain();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        configureLimiter(limiter);
        input.connect(limiter);
        limiter.connect(output);
        output.connect(analyser);
        analyser.connect(context.destination);

        const graph = { analyser, context, input, limiter, output };
        setMixer(graph);

        const samples = new Uint8Array(analyser.fftSize);
        let animationFrame = 0;
        let lastUpdate = 0;
        const updateMeter = (time: number) => {
            if (time - lastUpdate >= 50) {
                const level = readPeak(analyser, samples);
                const nextMeter = {
                    level,
                    limiting:
                        level > 0.01 &&
                        Number.isFinite(limiter.reduction) &&
                        limiter.reduction < -0.25,
                };
                setMasterMeter((current) =>
                    Math.abs(current.level - nextMeter.level) < 0.005 &&
                    current.limiting === nextMeter.limiting
                        ? current
                        : nextMeter,
                );
                lastUpdate = time;
            }
            animationFrame = window.requestAnimationFrame(updateMeter);
        };
        animationFrame = window.requestAnimationFrame(updateMeter);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            input.disconnect();
            limiter.disconnect();
            output.disconnect();
            analyser.disconnect();
            void context.close().catch(() => {});
        };
    }, []);

    useEffect(() => {
        if (!mixer) return;
        mixer.output.gain.setTargetAtTime(master, mixer.context.currentTime, 0.01);
    }, [master, mixer]);

    useEffect(() => {
        if (!musicFolders) return;

        setDjMusicFolderId((current) => {
            if (current && musicFolders.items.some((folder) => folder.id === current)) {
                return current;
            }

            return (
                currentServer?.musicFolderId?.find((id) =>
                    musicFolders.items.some((folder) => folder.id === id),
                ) || musicFolders.items[0]?.id
            );
        });
    }, [currentServer?.musicFolderId, musicFolders]);

    useEffect(() => {
        if (djAlbumId === ALL_TRACKS || albumsQuery.isLoading) return;
        if (!albums?.some((album) => album.id === djAlbumId)) setDjAlbumId(ALL_TRACKS);
    }, [albums, albumsQuery.isLoading, djAlbumId]);

    const songsQuery = useQuery(
        songsQueries.list({
            options: { enabled: Boolean(currentServer?.id && djMusicFolderId) },
            query: {
                albumIds: djAlbumId === ALL_TRACKS ? undefined : [djAlbumId],
                limit: 200,
                musicFolderId: djMusicFolderId,
                searchTerm: deferredSearch || undefined,
                sortBy: SongListSort.NAME,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId: currentServer?.id || '',
        }),
    );
    const songs = songsQuery.data?.items || [];

    const exit = useCallback(() => closeDjMode(false), [closeDjMode]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') exit();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [exit]);

    const loadDeck = (deck: DeckId, song: Song) => {
        if (deck === 'A') setDeckA(song);
        else setDeckB(song);
    };

    const addPrepared = (song: Song) => {
        setPrepared((current) =>
            current.some((item) => item.id === song.id) ? current : [...current, song],
        );
    };

    const clearDrag = () => {
        setDraggedPreparedIndex(undefined);
        setDraggedSong(undefined);
        setPreparedDropIndex(undefined);
    };

    const handleDrop = (deck: DeckId) => {
        if (!draggedSong) return;
        loadDeck(deck, draggedSong);
        clearDrag();
    };

    const handlePreparedDrop = (event: DragEvent, targetIndex: number) => {
        event.preventDefault();
        event.stopPropagation();
        if (!draggedSong) return;

        setPrepared((current) => {
            const next = [...current];
            const existingIndex = next.findIndex((song) => song.id === draggedSong.id);
            const sourceIndex = draggedPreparedIndex ?? existingIndex;
            const [song] = sourceIndex >= 0 ? next.splice(sourceIndex, 1) : [draggedSong];
            const insertionIndex = clamp(targetIndex, 0, next.length);
            next.splice(insertionIndex, 0, song);
            return next;
        });
        clearDrag();
    };

    const startDrag = (event: DragEvent, song: Song, preparedIndex?: number) => {
        event.dataTransfer.effectAllowed = preparedIndex === undefined ? 'copy' : 'copyMove';
        event.dataTransfer.setData('text/plain', song.id);
        setDraggedPreparedIndex(preparedIndex);
        setDraggedSong(song);
    };

    return (
        <div aria-label="KatiesAmp DJ Mode" className={styles.overlay} role="dialog">
            <header className={styles.header}>
                <div>
                    <span className={styles.kicker}>KatiesAmp</span>
                    <h1>DJ Mode</h1>
                </div>
                <div className={styles.headerActions}>
                    <span className={styles.serverName}>{currentServer?.name}</span>
                    <Button onClick={exit} size="compact-sm" variant="default">
                        Exit DJ Mode
                    </Button>
                </div>
            </header>

            <main className={styles.workspace}>
                <div className={styles.decks}>
                    <Deck
                        deck="A"
                        mix={mix.a}
                        mixer={mixer}
                        onBpmChange={handleBpmChange}
                        onDropSong={() => handleDrop('A')}
                        onEject={() => setDeckA(undefined)}
                        otherBpm={deckBpms.B}
                        song={deckA}
                    />
                    <section aria-label="Master mixer" className={styles.masterMixer}>
                        <span className={styles.mixerLabel}>Master</span>
                        <RotaryDial
                            ariaLabel="Master volume"
                            label="Volume"
                            max={1}
                            min={0}
                            onChange={setMaster}
                            resetValue={0.8}
                            step={0.01}
                            value={master}
                            valueLabel={`${Math.round(master * 100)}%`}
                        />
                        <LevelMeter label="Master output level" meter={masterMeter} />
                        <span
                            className={`${styles.limiterStatus} ${
                                masterMeter.limiting ? styles.isLimiting : ''
                            }`}
                        >
                            {masterMeter.limiting ? 'Limiter active' : 'Limiter ready'}
                        </span>
                        <label className={styles.crossfader}>
                            <span>Crossfader</span>
                            <div className={styles.crossfaderLabels}>
                                <b>A</b>
                                <b>B</b>
                            </div>
                            <input
                                aria-label="Crossfader"
                                disabled={!crossfadeEnabled}
                                max={1}
                                min={-1}
                                onChange={(event) =>
                                    setCrossfader(Number(event.currentTarget.value))
                                }
                                step={0.01}
                                type="range"
                                value={crossfader}
                            />
                        </label>
                        <div className={styles.crossfaderActions}>
                            <Button
                                className={styles.centreButton}
                                onClick={() => setCrossfader(0)}
                                size="compact-xs"
                                variant="filled"
                            >
                                Centre crossfade
                            </Button>
                            <Button
                                aria-pressed={!crossfadeEnabled}
                                onClick={() => setCrossfadeEnabled((enabled) => !enabled)}
                                size="compact-xs"
                                variant={crossfadeEnabled ? 'default' : 'filled'}
                            >
                                {crossfadeEnabled ? 'Disable crossfade' : 'Enable crossfade'}
                            </Button>
                        </div>
                        <label className={styles.musicFolderSelector}>
                            <span>DJ music folder</span>
                            <Select
                                aria-label="Select DJ music folder"
                                data={
                                    musicFolders?.items.map((folder) => ({
                                        label: folder.name,
                                        value: folder.id,
                                    })) || []
                                }
                                disabled={
                                    musicFoldersQuery.isLoading ||
                                    musicFoldersQuery.isError ||
                                    !musicFolders?.items.length
                                }
                                onChange={(value) => {
                                    if (value) {
                                        setDjAlbumId(ALL_TRACKS);
                                        setDjMusicFolderId(value);
                                    }
                                }}
                                placeholder={
                                    musicFoldersQuery.isLoading
                                        ? 'Loading folders…'
                                        : musicFolders?.items.length
                                          ? 'Choose a DJ folder'
                                          : 'Folders unavailable'
                                }
                                value={djMusicFolderId || null}
                                width="100%"
                            />
                        </label>
                    </section>
                    <Deck
                        deck="B"
                        mix={mix.b}
                        mixer={mixer}
                        onBpmChange={handleBpmChange}
                        onDropSong={() => handleDrop('B')}
                        onEject={() => setDeckB(undefined)}
                        otherBpm={deckBpms.A}
                        song={deckB}
                    />
                </div>

                <section className={styles.browser}>
                    <div className={styles.libraryPane}>
                        <div className={styles.browserHeader}>
                            <div>
                                <span className={styles.kicker}>Music library</span>
                                <h2>Tracks</h2>
                            </div>
                            <div className={styles.browserFilters}>
                                <Select
                                    aria-label="Filter DJ library by album"
                                    data={[
                                        { label: 'All tracks', value: ALL_TRACKS },
                                        ...(albums || []).map((album) => ({
                                            label: album.name,
                                            value: album.id,
                                        })),
                                    ]}
                                    disabled={albumsQuery.isLoading || albumsQuery.isError}
                                    onChange={(value) => setDjAlbumId(value || ALL_TRACKS)}
                                    placeholder={
                                        albumsQuery.isLoading
                                            ? 'Loading albums…'
                                            : albumsQuery.isError
                                              ? 'Albums unavailable'
                                              : 'Choose an album'
                                    }
                                    value={djAlbumId}
                                    width="100%"
                                />
                                <TextInput
                                    aria-label="Search DJ tracks"
                                    leftSection={<Icon icon="search" />}
                                    onChange={(event) => setSearch(event.currentTarget.value)}
                                    placeholder="Search tracks or artists"
                                    value={search}
                                />
                            </div>
                        </div>
                        <div className={styles.trackHeader}>
                            <span>Track</span>
                            <span>Album</span>
                            <span>Length</span>
                            <span>Load</span>
                        </div>
                        <div aria-label="DJ track library" className={styles.trackList} role="list">
                            {songsQuery.isLoading && (
                                <p className={styles.empty}>Loading tracks…</p>
                            )}
                            {songsQuery.isError && (
                                <p className={styles.empty}>
                                    The music library could not be loaded.
                                </p>
                            )}
                            {!songsQuery.isLoading && !songsQuery.isError && songs.length === 0 && (
                                <p className={styles.empty}>No matching tracks.</p>
                            )}
                            {songs.map((song) => (
                                <div
                                    aria-label={`${song.name} library track`}
                                    className={styles.trackRow}
                                    draggable
                                    key={song.id}
                                    onDoubleClick={() => loadDeck(deckA ? 'B' : 'A', song)}
                                    onDragEnd={clearDrag}
                                    onDragStart={(event) => startDrag(event, song)}
                                    role="listitem"
                                >
                                    <div className={styles.trackIdentity}>
                                        <strong>{song.name}</strong>
                                        <span>{song.artistName}</span>
                                    </div>
                                    <span>{song.album || 'Unknown album'}</span>
                                    <span>{formatTime(song.duration / 1000)}</span>
                                    <div className={styles.rowActions}>
                                        <button
                                            aria-label={`Load ${song.name} to Deck A`}
                                            onClick={() => loadDeck('A', song)}
                                            type="button"
                                        >
                                            A
                                        </button>
                                        <button
                                            aria-label={`Load ${song.name} to Deck B`}
                                            onClick={() => loadDeck('B', song)}
                                            type="button"
                                        >
                                            B
                                        </button>
                                        <button
                                            aria-label={`Add ${song.name} to preparation`}
                                            onClick={() => addPrepared(song)}
                                            type="button"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className={styles.preparePane}>
                        <div className={styles.browserHeader}>
                            <div>
                                <span className={styles.kicker}>Preparation</span>
                                <h2>Up next</h2>
                            </div>
                            <span className={styles.count}>{prepared.length}</span>
                        </div>
                        <div
                            aria-label="Preparation list"
                            className={`${styles.prepareList} ${
                                draggedSong && preparedDropIndex === prepared.length
                                    ? styles.prepareListDropTarget
                                    : ''
                            }`}
                            onDragEnter={() => setPreparedDropIndex(prepared.length)}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setPreparedDropIndex(prepared.length);
                            }}
                            onDrop={(event) => handlePreparedDrop(event, prepared.length)}
                            role="list"
                        >
                            {prepared.length === 0 && (
                                <p className={styles.empty}>
                                    Add tracks here while preparing your set.
                                </p>
                            )}
                            {prepared.map((song, index) => (
                                <div
                                    aria-label={`${song.name} preparation track`}
                                    className={`${styles.prepareRow} ${
                                        preparedDropIndex === index ? styles.prepareDropTarget : ''
                                    }`}
                                    draggable
                                    key={song.id}
                                    onDragEnd={clearDrag}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setPreparedDropIndex(index);
                                    }}
                                    onDragStart={(event) => startDrag(event, song, index)}
                                    onDrop={(event) => handlePreparedDrop(event, index)}
                                    role="listitem"
                                >
                                    <div>
                                        <strong>{song.name}</strong>
                                        <span>{song.artistName}</span>
                                    </div>
                                    <div className={styles.rowActions}>
                                        <button
                                            aria-label={`Load ${song.name} to Deck A`}
                                            onClick={() => loadDeck('A', song)}
                                            type="button"
                                        >
                                            A
                                        </button>
                                        <button
                                            aria-label={`Load ${song.name} to Deck B`}
                                            onClick={() => loadDeck('B', song)}
                                            type="button"
                                        >
                                            B
                                        </button>
                                        <button
                                            aria-label={`Remove ${song.name} from preparation`}
                                            onClick={() =>
                                                setPrepared((current) =>
                                                    current.filter((item) => item.id !== song.id),
                                                )
                                            }
                                            type="button"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </section>
            </main>
        </div>
    );
};
