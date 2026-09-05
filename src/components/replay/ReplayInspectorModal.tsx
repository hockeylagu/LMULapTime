import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Users,
  Video,
  Activity,
  Clock,
  HardDrive,
  Flag,
  User,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry } from '../../../server/types.js';
import { GpsTrackMap } from './GpsTrackMap';
import { GpsZoomMap } from './GpsZoomMap';
import { TelemetryStripCharts } from './TelemetryStripCharts';

export interface ReplayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  replayName: string | null;
}

export const ReplayInspectorModal: React.FC<ReplayInspectorModalProps> = ({
  isOpen,
  onClose,
  replayName,
}) => {
  const [metadata, setMetadata] = useState<ReplayMetadata | null>(null);
  const [trajectory, setTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [selectedDriverSlot, setSelectedDriverSlot] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTrajLoading, setIsTrajLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'map' | 'roster'>('map');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [colorBy, setColorBy] = useState<'speed' | 'throttle' | 'brake' | 'steering'>('speed');
  const [mapViewMode, setMapViewMode] = useState<'dual' | 'overview' | 'zoom'>('dual');

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Lock background body scroll when inspector modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Load replay metadata & initial trajectory when modal opens
  useEffect(() => {
    if (!isOpen || !replayName) {
      setMetadata(null);
      setTrajectory(null);
      setSelectedDriverSlot(null);
      setCurrentIndex(0);
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/metadata`)
        .then(r => (r.ok ? r.json() : null)),
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?maxPoints=1200`)
        .then(r => (r.ok ? r.json() : null)),
    ])
      .then(([metaData, trajData]) => {
        if (!isMounted) return;
        if (!metaData) {
          setError(`Could not load metadata for replay ${replayName}`);
        } else {
          setMetadata(metaData);
        }
        if (trajData) {
          setTrajectory(trajData);
          const defaultSlot = trajData.driverSlot ??
            metaData?.drivers?.find((d: ReplayDriverEntry) => d.isPlayer || d.name.toLowerCase().includes('samuel'))?.slot ??
            metaData?.drivers?.[0]?.slot ??
            null;
          setSelectedDriverSlot(defaultSlot);
        } else if (metaData?.drivers?.length) {
          const player = metaData.drivers.find((d: ReplayDriverEntry) => d.isPlayer || d.name.toLowerCase().includes('samuel')) || metaData.drivers[0];
          if (player && typeof player.slot === 'number') {
            setSelectedDriverSlot(player.slot);
          }
        }
        setIsLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load replay data');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, replayName]);

  // Load trajectory for a specific driver
  const handleSelectDriver = (slot: number) => {
    if (!replayName) return;
    setSelectedDriverSlot(slot);
    setIsTrajLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);

    fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?driverSlot=${slot}&maxPoints=1200`)
      .then(r => (r.ok ? r.json() : null))
      .then((trajData: ReplayTrajectoryData | null) => {
        if (trajData) {
          setTrajectory(trajData);
        }
        setIsTrajLoading(false);
      })
      .catch(() => {
        setIsTrajLoading(false);
      });
  };

  // Load trajectory for a specific lap
  const handleSelectLap = (lapNum: number) => {
    if (!replayName) return;
    setIsTrajLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);

    const slotParam = typeof selectedDriverSlot === 'number' ? `&driverSlot=${selectedDriverSlot}` : '';
    fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?maxPoints=1200&lap=${lapNum}${slotParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then((trajData: ReplayTrajectoryData | null) => {
        if (trajData) {
          setTrajectory(trajData);
        }
        setIsTrajLoading(false);
      })
      .catch(() => {
        setIsTrajLoading(false);
      });
  };

  const formatLapTime = (sec?: number | null): string => {
    if (!sec || isNaN(sec) || sec <= 0) return '--:--.---';
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(3);
    const secStr = parseFloat(rem) < 10 ? `0${rem}` : rem;
    return `${mins}:${secStr}`;
  };

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || !trajectory || trajectory.points.length === 0) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = now - lastTimeRef.current;
      // Advance frames based on playback speed (approx 50Hz baseline = 20ms per frame)
      const framesToAdvance = Math.max(1, Math.round((delta / 25) * playbackSpeed));

      if (delta >= 20 / playbackSpeed) {
        lastTimeRef.current = now;
        setCurrentIndex(prev => {
          if (prev + framesToAdvance >= trajectory.points.length) {
            setIsPlaying(false);
            return 0; // loop back
          }
          return prev + framesToAdvance;
        });
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, trajectory, playbackSpeed]);

  // Peak metrics for the selected car
  const maxSpeed = useMemo(() => {
    if (!trajectory || trajectory.points.length === 0) return 0;
    return Math.max(...trajectory.points.map(p => p.speedKmh || 0));
  }, [trajectory]);

  const isStationary = maxSpeed <= 1;

  const selectedDriver = metadata?.drivers?.find(d => d.slot === selectedDriverSlot) ||
    metadata?.drivers?.find(d => d.name === trajectory?.driverName);

  const playerDriver = useMemo(() => {
    return metadata?.drivers?.find(d => d.isPlayer || d.name.toLowerCase().includes('samuel'));
  }, [metadata?.drivers]);

  const filteredDrivers = useMemo(() => {
    if (!metadata?.drivers) return [];
    if (!rosterSearch.trim()) return metadata.drivers;
    const q = rosterSearch.toLowerCase();
    return metadata.drivers.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.carModel && d.carModel.toLowerCase().includes(q)) ||
      (d.team && d.team.toLowerCase().includes(q)) ||
      (d.carNumber && d.carNumber.includes(q))
    );
  }, [metadata?.drivers, rosterSearch]);

  if (!isOpen) return null;

  const currentPoint = trajectory?.points[currentIndex];
  const currentLapSummary = trajectory?.laps?.find(l => l.lapNumber === trajectory.currentLap) || trajectory?.laps?.[0];

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07090e] text-white w-screen h-screen overflow-hidden select-none overscroll-none animate-fadeIn">
      {/* Top Studio Header Bar */}
      <header className="h-14 px-4 bg-[#0a0e17] border-b border-lmu-border flex items-center justify-between shrink-0 z-30">
        {/* Left: Back button + Title & Info */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-white font-medium text-xs border border-lmu-border transition-colors shrink-0"
            title="Return to Lap Times"
          >
            <ArrowLeft className="w-4 h-4 text-lmu-muted group-hover:text-white" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-lmu-accent/10 border border-lmu-accent/30 text-lmu-accent shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate">
                <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                  Replay Intelligence: {replayName}
                </span>
                {metadata?.eventInfo?.eventTitle && (
                  <span className="hidden md:inline px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-[10px] shrink-0">
                    {metadata.eventInfo.eventTitle}
                    {typeof metadata.eventInfo.splitNo === 'number' && ` (Split ${metadata.eventInfo.splitNo})`}
                  </span>
                )}
              </div>
              <div className="hidden lg:flex items-center gap-3 text-[11px] text-lmu-muted">
                {metadata?.trackName && (
                  <span className="flex items-center gap-1">
                    <Flag className="w-3 h-3 text-lmu-accent" />
                    {metadata.trackName}
                  </span>
                )}
                {metadata?.durationSec ? (
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {formatDuration(metadata.durationSec)}
                  </span>
                ) : null}
                {metadata?.fileSizeBytes ? (
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-lmu-muted" />
                    {formatBytes(metadata.fileSizeBytes)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Driver Selector Dropdown */}
        <div className="flex items-center gap-2">
          {metadata?.drivers && metadata.drivers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="hidden xl:flex items-center gap-1 text-[11px] text-lmu-muted">
                <User className="w-3.5 h-3.5 text-lmu-accent" />
                Driver:
              </span>
              <select
                aria-label="Select Driver"
                value={selectedDriverSlot ?? ''}
                onChange={e => handleSelectDriver(parseInt(e.target.value, 10))}
                className="bg-lmu-card border border-lmu-border rounded-xl px-2.5 py-1 text-xs text-white font-semibold focus:outline-none focus:border-lmu-accent cursor-pointer max-w-[190px] sm:max-w-[260px] truncate"
              >
                {metadata.drivers.map((d, i) => {
                  const val = typeof d.slot === 'number' ? d.slot : i;
                  const isPlayer = Boolean(d.isPlayer || d.name.toLowerCase().includes('samuel'));
                  return (
                    <option key={val} value={val}>
                      {isPlayer ? '★ ' : ''}{d.carNumber ? `#${d.carNumber} ` : ''}{d.name} {isPlayer ? '(You) ' : ''}{d.carModel ? `[${d.carModel}]` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Lap Selector */}
          {trajectory?.laps && trajectory.laps.length > 0 && (
            <div className="flex items-center gap-1 bg-lmu-card border border-lmu-border rounded-xl px-2 py-0.5 shadow-sm">
              <span className="hidden lg:flex items-center gap-1 text-[11px] text-lmu-muted">
                <Flag className="w-3 h-3 text-lmu-accent" />
                Lap:
              </span>
              <button
                onClick={() => handleSelectLap(Math.max(1, (trajectory.currentLap ?? 1) - 1))}
                disabled={(trajectory.currentLap ?? 1) <= 1}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer"
                title="Previous Lap"
              >
                ‹
              </button>
              <select
                aria-label="Select Lap"
                value={trajectory.currentLap ?? 1}
                onChange={e => handleSelectLap(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] truncate py-0.5"
              >
                {trajectory.laps.map(l => (
                  <option key={l.lapNumber} value={l.lapNumber} className="bg-[#0b101d] text-white">
                    Lap {l.lapNumber} ({formatLapTime(l.lapTimeSec)}){l.isBest ? ' ★' : l.isOutlap ? ' • Out' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSelectLap(Math.min(trajectory.laps!.length, (trajectory.currentLap ?? 1) + 1))}
                disabled={(trajectory.currentLap ?? 1) >= trajectory.laps.length}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer"
                title="Next Lap"
              >
                ›
              </button>
            </div>
          )}

          {isStationary ? (
            <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Garage
            </span>
          ) : (
            <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Track
            </span>
          )}

          {isTrajLoading && (
            <span className="text-[10px] text-lmu-muted animate-pulse hidden md:inline">
              Loading driver...
            </span>
          )}
        </div>

        {/* Right: Playback Controls & Close */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Rewind */}
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentIndex(0);
            }}
            aria-label="Rewind to start"
            className="p-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-lmu-muted hover:text-white border border-lmu-border transition-colors"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lmu-accent hover:bg-lmu-accent/90 text-white font-bold text-xs shadow-md transition-all"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          {/* Speed Multiplier */}
          <div className="hidden md:flex items-center gap-1 text-xs">
            {[1, 2, 5].map(spd => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  playbackSpeed === spd
                    ? 'bg-lmu-accent text-white shadow'
                    : 'bg-lmu-card text-lmu-muted hover:text-white border border-lmu-border'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl text-lmu-muted hover:text-white hover:bg-white/10 transition-colors ml-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <div className="inline-block w-8 h-8 border-4 border-lmu-accent/20 border-t-lmu-accent rounded-full animate-spin" />
            <div className="text-sm font-semibold text-lmu-muted">
              Decoding binary replay stream & vehicle telemetry...
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm max-w-md">
              {error}
            </div>
          </div>
        )}

        {!isLoading && !error && trajectory && (
          <>
            {/* LEFT COLUMN: Stacked Telemetry Traces */}
            <div className="flex-1 min-w-0 flex flex-col bg-[#06080d] p-3 sm:p-4 gap-2.5 min-h-0 overflow-hidden border-r border-lmu-border">
              {/* Lap & Sector Performance Header */}
              {currentLapSummary && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 rounded-xl bg-[#090d16] border border-lmu-border/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-wider text-white uppercase flex items-center gap-1.5 pl-1">
                      <Flag className="w-3.5 h-3.5 text-lmu-accent" />
                      Lap {trajectory.currentLap ?? 1}
                    </span>
                    {currentLapSummary.isBest && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold text-[10px]">
                        ★ Fastest Lap
                      </span>
                    )}
                    {currentLapSummary.isOutlap && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                        Outlap
                      </span>
                    )}
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {formatLapTime(currentLapSummary.lapTimeSec)}
                    </span>
                    {currentLapSummary.lapDistMeters ? (
                      <span className="hidden sm:inline text-[10px] font-mono text-lmu-muted">
                        ({currentLapSummary.lapDistMeters.toLocaleString()}m)
                      </span>
                    ) : null}
                  </div>

                  {/* 3 Sectors Summary Pills */}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono pr-1">
                    <div className="px-2 py-0.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 flex items-center gap-1">
                      <span className="font-bold text-amber-400/80">S1:</span>
                      <span className="font-black">{currentLapSummary.s1Sec ? currentLapSummary.s1Sec.toFixed(3) + 's' : '--'}</span>
                    </div>
                    <div className="px-2 py-0.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 flex items-center gap-1">
                      <span className="font-bold text-cyan-400/80">S2:</span>
                      <span className="font-black">{currentLapSummary.s2Sec ? currentLapSummary.s2Sec.toFixed(3) + 's' : '--'}</span>
                    </div>
                    <div className="px-2 py-0.5 rounded-lg bg-purple-400/10 border border-purple-400/30 text-purple-300 flex items-center gap-1">
                      <span className="font-bold text-purple-400/80">S3:</span>
                      <span className="font-black">{currentLapSummary.s3Sec ? currentLapSummary.s3Sec.toFixed(3) + 's' : '--'}</span>
                    </div>
                    <div className="hidden md:flex px-2 py-0.5 rounded-lg bg-lmu-dark border border-lmu-border text-lmu-muted items-center gap-1">
                      <span>1,200 pts</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stacked Telemetry Graphs */}
              <div className="flex-1 min-h-0 w-full">
                <TelemetryStripCharts
                  points={trajectory.points}
                  currentIndex={currentIndex}
                  onSelectIndex={idx => setCurrentIndex(idx)}
                  sectors={trajectory.sectors}
                  className="w-full h-full"
                />
              </div>

              {/* Synchronized Timeline Scrubber Toolbar */}
              <div className="p-3 rounded-xl bg-lmu-card/80 border border-lmu-border flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between text-xs text-lmu-muted">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-lmu-accent" />
                    Synchronized Telemetry Cursor
                  </span>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-white font-bold">
                      {currentPoint?.timeSec?.toFixed(2) ?? '0.00'}s
                    </span>
                    <span>
                      Frame {currentIndex + 1} / {trajectory.points.length} ({((currentIndex / Math.max(1, trajectory.points.length - 1)) * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max={Math.max(0, trajectory.points.length - 1)}
                  value={currentIndex}
                  onChange={e => {
                    setCurrentIndex(parseInt(e.target.value, 10));
                    setIsPlaying(false);
                  }}
                  className="w-full accent-lmu-accent cursor-pointer h-2 rounded-lg bg-lmu-border"
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Track Map & Driver Roster Tab */}
            <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 bg-[#0a0e17] flex flex-col min-h-0 overflow-hidden">
              {/* Right Panel Tabs */}
              <div className="px-4 py-2.5 bg-lmu-dark border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      activeTab === 'map'
                        ? 'bg-lmu-accent text-white shadow-md'
                        : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    GPS Map
                  </button>

                  <button
                    onClick={() => setActiveTab('roster')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      activeTab === 'roster'
                        ? 'bg-lmu-accent text-white shadow-md'
                        : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Driver Roster ({metadata?.drivers?.length || 0})
                  </button>
                </div>

                {activeTab === 'map' && (
                  <div className="flex items-center gap-1 text-xs">
                    {(['speed', 'throttle', 'brake', 'steering'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setColorBy(mode)}
                        title={`Heatmap: ${mode}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                          colorBy === mode
                            ? 'bg-lmu-card border border-lmu-accent text-white font-bold'
                            : 'text-lmu-muted hover:text-white'
                        }`}
                      >
                        {mode.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Panel Content */}
              {activeTab === 'map' ? (
                <div className="flex-1 flex flex-col min-h-0 h-full p-3 gap-2.5 overflow-hidden">
                  {/* Driver Header Pill */}
                  <div className="p-3 rounded-xl bg-lmu-card border border-lmu-border flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-lmu-dark border border-lmu-border flex items-center justify-center font-bold text-amber-400 text-xs font-mono shrink-0">
                        {selectedDriver?.carNumber || '#-'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {selectedDriver?.name || trajectory.driverName || 'Driver'}
                          </span>
                          {Boolean(selectedDriver?.isPlayer || selectedDriver?.name?.toLowerCase().includes('samuel')) && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-600/80 text-purple-100 font-bold border border-purple-400/40 shadow-sm">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-lmu-muted truncate">
                          {selectedDriver?.carModel || 'Vehicle'} • {selectedDriver?.team || 'Competitor'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        onClick={() => setActiveTab('roster')}
                        className="px-2 py-1 rounded-lg bg-lmu-dark hover:bg-lmu-accent/20 border border-lmu-border hover:border-lmu-accent/50 text-[11px] text-lmu-muted hover:text-white font-medium flex items-center gap-1 transition-all cursor-pointer"
                        title="Open Driver Roster to select a different driver"
                      >
                        <Users className="w-3.5 h-3.5 text-lmu-accent" />
                        <span>Change</span>
                      </button>

                      <div className="text-right shrink-0 border-l border-lmu-border/60 pl-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {currentPoint?.pitLimiter && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-500/50 animate-pulse">
                              PIT LIM
                            </span>
                          )}
                          {currentPoint?.isOffTrack && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-600/30 text-amber-300 border border-amber-500/50">
                              OFF TRACK
                            </span>
                          )}
                          {currentPoint?.tcActive && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-600/30 text-amber-300 border border-amber-500/50 animate-pulse">
                              TC
                            </span>
                          )}
                          {currentPoint?.absActive && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-500/50 animate-pulse">
                              ABS
                            </span>
                          )}
                          <div className="text-xs font-mono font-bold text-white">
                            {currentPoint?.speedKmh ?? 0} <span className="text-[10px] text-lmu-muted">km/h</span>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-cyan-400">
                          GEAR {currentPoint?.speedKmh && currentPoint.speedKmh > 5 ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1) : 1}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Map Mode Selector Toolbar */}
                  <div className="flex items-center justify-between px-0.5 shrink-0 text-xs">
                    <div className="flex items-center gap-1 bg-lmu-dark p-1 rounded-lg border border-lmu-border/60">
                      <button
                        onClick={() => setMapViewMode('dual')}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                          mapViewMode === 'dual'
                            ? 'bg-lmu-accent text-white shadow'
                            : 'text-lmu-muted hover:text-white'
                        }`}
                      >
                        Dual View
                      </button>
                      <button
                        onClick={() => setMapViewMode('zoom')}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                          mapViewMode === 'zoom'
                            ? 'bg-lmu-accent text-white shadow'
                            : 'text-lmu-muted hover:text-white'
                        }`}
                      >
                        Close-Up Line
                      </button>
                      <button
                        onClick={() => setMapViewMode('overview')}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                          mapViewMode === 'overview'
                            ? 'bg-lmu-accent text-white shadow'
                            : 'text-lmu-muted hover:text-white'
                        }`}
                      >
                        Full Circuit
                      </button>
                    </div>

                    <span className="text-[10px] text-lmu-muted font-mono hidden sm:inline">
                      {mapViewMode === 'dual' ? 'Overview + Close-Up' : mapViewMode === 'zoom' ? 'Apex Detail' : 'Circuit Map'}
                    </span>
                  </div>

                  {/* MAP VIEWS: Dual / Overview / Close-Up */}
                  {mapViewMode === 'dual' ? (
                    <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
                      {/* 1. Primary Full Circuit Map (Takes 1/3 vertical space) */}
                      <div className="flex-[1] min-h-0 rounded-xl bg-[#060910] border border-lmu-border p-2 flex items-center justify-center relative overflow-hidden">
                        <GpsTrackMap
                          points={trajectory.points}
                          bounds={trajectory.bounds}
                          currentIndex={currentIndex}
                          onSelectIndex={idx => setCurrentIndex(idx)}
                          colorBy={colorBy}
                          className="w-full h-full"
                        />
                      </div>

                      {/* 2. Secondary Close-Up Racing Line Map (Takes 2/3 vertical space) */}
                      <div className="flex-[2] min-h-0 rounded-xl overflow-hidden">
                        <GpsZoomMap
                          points={trajectory.points}
                          currentIndex={currentIndex}
                          onSelectIndex={idx => setCurrentIndex(idx)}
                          colorBy={colorBy}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  ) : mapViewMode === 'overview' ? (
                    /* Full Height Overview Map (Takes 100% vertical space) */
                    <div className="flex-1 min-h-0 h-full rounded-xl bg-[#060910] border border-lmu-border p-2 flex items-center justify-center relative overflow-hidden">
                      <GpsTrackMap
                        points={trajectory.points}
                        bounds={trajectory.bounds}
                        currentIndex={currentIndex}
                        onSelectIndex={idx => setCurrentIndex(idx)}
                        colorBy={colorBy}
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    /* Full Height Close-Up Racing Line Map (Takes 100% vertical space) */
                    <div className="flex-1 min-h-0 h-full rounded-xl overflow-hidden">
                      <GpsZoomMap
                        points={trajectory.points}
                        currentIndex={currentIndex}
                        onSelectIndex={idx => setCurrentIndex(idx)}
                        colorBy={colorBy}
                        className="w-full h-full"
                      />
                    </div>
                  )}

                  {/* Live Mini Telemetry Strip */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 shrink-0">
                    {/* Speed */}
                    <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
                      <span className="text-[9px] text-sky-400 font-bold">SPEED</span>
                      <span className="text-xs font-black text-white font-mono">{currentPoint?.speedKmh ?? 0}</span>
                      <span className="text-[8px] text-lmu-muted">km/h</span>
                    </div>

                    {/* Throttle */}
                    <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-all ${
                      currentPoint?.tcActive ? 'border-amber-500/70 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.25)]' : 'border-lmu-border'
                    }`}>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-emerald-400 font-bold">THR</span>
                        {currentPoint?.tcActive && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-black bg-amber-500 text-black animate-pulse">
                            TC
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-black text-emerald-400 font-mono">{(currentPoint?.throttle ?? 0).toFixed(0)}%</span>
                      <span className="text-[8px] text-lmu-muted">{currentPoint?.tcActive ? 'tc active' : 'pedal'}</span>
                    </div>

                    {/* Brake */}
                    <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-all ${
                      currentPoint?.absActive ? 'border-cyan-500/70 bg-cyan-500/10 shadow-[0_0_8px_rgba(6,182,212,0.25)]' : 'border-lmu-border'
                    }`}>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-rose-400 font-bold">BRK</span>
                        {currentPoint?.absActive && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-black bg-cyan-400 text-black animate-pulse">
                            ABS
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-black text-rose-400 font-mono">{(currentPoint?.brake ?? 0).toFixed(0)}%</span>
                      <span className="text-[8px] text-lmu-muted">{currentPoint?.absActive ? 'abs active' : 'pedal'}</span>
                    </div>

                    {/* Steering */}
                    <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
                      <span className="text-[9px] text-indigo-400 font-bold">STEER</span>
                      <span className="text-xs font-black text-indigo-400 font-mono">{Math.abs(currentPoint?.steerYaw ?? 0)}°</span>
                      <span className="text-[8px] text-lmu-muted">{(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}</span>
                    </div>

                    {/* RPM */}
                    <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
                      <span className="text-[9px] text-amber-400 font-bold">RPM</span>
                      <span className="text-xs font-black text-white font-mono">{currentPoint?.rpm ? (currentPoint.rpm / 1000).toFixed(1) + 'k' : '-'}</span>
                      <span className="text-[8px] text-lmu-muted">engine</span>
                    </div>

                    {/* Status / Track State */}
                    <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center justify-center transition-all ${
                      currentPoint?.pitLimiter
                        ? 'border-fuchsia-500/70 bg-fuchsia-500/15 shadow-[0_0_8px_rgba(217,70,239,0.3)] animate-pulse'
                        : currentPoint?.isOffTrack
                        ? 'border-amber-500/70 bg-amber-500/15 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                        : currentPoint?.inPit
                        ? 'border-blue-500/50 bg-blue-500/10'
                        : 'border-lmu-border'
                    }`}>
                      <span className="text-[9px] text-purple-400 font-bold">STATUS</span>
                      <span className={`text-[11px] font-black font-mono truncate ${
                        currentPoint?.pitLimiter
                          ? 'text-fuchsia-300'
                          : currentPoint?.isOffTrack
                          ? 'text-amber-300'
                          : currentPoint?.inPit
                          ? 'text-blue-300'
                          : 'text-lmu-muted'
                      }`}>
                        {currentPoint?.pitLimiter ? 'LIMITER' : currentPoint?.isOffTrack ? 'OFF TRACK' : currentPoint?.inPit ? 'PIT LANE' : 'ON TRACK'}
                      </span>
                      <span className="text-[8px] text-lmu-muted">
                        {currentPoint?.pitLimiter ? '60 km/h' : currentPoint?.isOffTrack ? 'limits cut' : currentPoint?.inPit ? 'in pits' : 'green'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Driver Roster Tab */
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
                  <div className="rounded-xl border border-lmu-border overflow-hidden bg-lmu-card">
                    <div className="p-3 bg-lmu-dark/80 border-b border-lmu-border text-xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-lmu-muted font-medium">Click any driver to load telemetry</span>
                        <span className="font-semibold text-white">
                          {filteredDrivers.length} / {metadata?.drivers?.length || 0} Drivers
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-2.5 top-2" />
                          <input
                            type="text"
                            placeholder="Search driver, car model, team..."
                            value={rosterSearch}
                            onChange={e => setRosterSearch(e.target.value)}
                            className="w-full bg-lmu-card border border-lmu-border rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent"
                          />
                          {rosterSearch && (
                            <button
                              onClick={() => setRosterSearch('')}
                              className="absolute right-2 top-1 text-lmu-muted hover:text-white text-xs p-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {playerDriver && typeof playerDriver.slot === 'number' && playerDriver.slot !== selectedDriverSlot && (
                          <button
                            onClick={() => {
                              handleSelectDriver(playerDriver.slot!);
                              setActiveTab('map');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-600/30 border border-purple-500/50 hover:bg-purple-600/50 text-purple-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-sm"
                            title="Quick switch to your player car"
                          >
                            <span>★ My Car</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-lmu-border bg-lmu-dark/50 text-lmu-muted font-bold uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Driver</th>
                          <th className="py-2.5 px-3">Car Model</th>
                          <th className="py-2.5 px-3">Team</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-lmu-border/50">
                        {filteredDrivers && filteredDrivers.length > 0 ? (
                          filteredDrivers.map((d, idx) => {
                            const isCurrent = typeof selectedDriverSlot === 'number' && d.slot === selectedDriverSlot;
                            const isPlayer = Boolean(d.isPlayer || d.name.toLowerCase().includes('samuel'));
                            return (
                              <tr
                                key={typeof d.slot === 'number' ? d.slot : idx}
                                onClick={() => {
                                  if (typeof d.slot === 'number') {
                                    handleSelectDriver(d.slot);
                                    setActiveTab('map');
                                  }
                                }}
                                className={`cursor-pointer transition-colors group ${
                                  isCurrent
                                    ? 'bg-lmu-accent/15 hover:bg-lmu-accent/20 border-l-2 border-l-lmu-accent'
                                    : 'hover:bg-lmu-dark/40'
                                }`}
                              >
                                <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                                  {d.carNumber || `#${idx + 1}`}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-white">
                                  <div className="flex items-center gap-1.5">
                                    <span>{d.name}</span>
                                    {isPlayer && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-600/80 text-purple-100 font-bold border border-purple-400/40 shadow-sm">
                                        YOU
                                      </span>
                                    )}
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-lmu-accent text-white font-bold shadow-sm">
                                        Current
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-emerald-400 font-medium truncate max-w-[120px]">
                                  {d.carModel || 'Unknown'}
                                </td>
                                <td className="py-2.5 px-3 text-lmu-muted truncate max-w-[100px]">
                                  {d.team || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right shrink-0">
                                  {isCurrent ? (
                                    <span className="text-[10px] font-bold text-lmu-accent">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-lmu-muted group-hover:text-white font-medium">
                                      Select →
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-lmu-muted">
                              {rosterSearch ? `No drivers match "${rosterSearch}"` : 'No driver records found in this replay.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
