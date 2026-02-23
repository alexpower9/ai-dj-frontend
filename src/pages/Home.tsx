import { useState, useEffect, useCallback, useRef } from 'react';
import PromptBox from '../components/PromptBox';
import Waveform from '../components/Waveform';
import PlaybackTimeline from '../components/PlaybackTimeline';
import QueuePanel from '../components/QueuePanel';
import TrackInfo from '../components/TrackInfo';
import TransitionInfo from '../components/TransitionInfo';
import {
  AudioStreamService,
  type TrackInfo as TrackInfoType,
  type TransitionInfo as TransitionInfoType,
} from '../services/audioStream';
import { Upload, MicVocal, Mic, MicOff, ChevronLeft, ChevronRight, UserCircle, Play, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react';
import SongUpload from '../components/SongUpload.tsx';
import AccountPanel from './Account';
import { useAuth } from '../context/AuthContext';

type LibrarySong = {
  id?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  scale?: string;
};

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [audioService] = useState(() => new AudioStreamService());
  const [loading, setLoading] = useState(false);

  // Library state (songs available on the backend)
  const [librarySongs, setLibrarySongs] = useState<LibrarySong[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error(`Library fetch failed: ${res.status}`);
      const data: any = await res.json();
      const songs = Array.isArray(data)
        ? data
        : Array.isArray(data?.songs)
        ? data.songs
        : Array.isArray(data?.library)
        ? data.library
        : [];
      setLibrarySongs(songs);
    } catch (e: any) {
      console.error('Failed to load library:', e);
      setLibraryError(e?.message ?? 'Failed to load library');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');

  //Upload Song State
  const [showUploadModal, setShowUploadModal] =
      useState(false);

  // Library sidebar collapse state
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);


  // Music mode state
  const [isPlaying, setIsPlaying] = useState(false);
  const [inputMode, setInputMode] = useState<"prompt" | "controls">("prompt");
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(1);

  // Voice input (browser speech-to-text)
  const SpeechRecognitionCtor: any =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const speechSupported = !!SpeechRecognitionCtor;
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [voicePreview, setVoicePreview] = useState('');
  const listeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef('');
  const [currentTrack, setCurrentTrack] = useState<TrackInfoType | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Ref so callbacks can see the latest currentTrack
  const currentTrackRef = useRef<TrackInfoType | null>(null);
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Transition state
  const [pendingTransition, setPendingTransition] =
    useState<TransitionInfoType | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Music time / progress
  const [currentTime, setCurrentTime] = useState(0); // seconds
  const [duration, setDuration] = useState(0); // seconds
  const [transitionPoints, setTransitionPoints] = useState<number[]>([]);

  // Queue state
  const [previousTrack, setPreviousTrack] =
    useState<TrackInfoType | null>(null);
  const [upNext, setUpNext] = useState<TrackInfoType[]>([]);

  // Backend log state
  const [backendLogs, setBackendLogs] = useState<string[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'queue' | 'logs'>('queue');
  const logEndRef = useRef<HTMLDivElement>(null);

  const trackKey = (t: TrackInfoType | null) =>
    t ? `${t.title ?? ''}::${t.artist ?? ''}` : '';

  // Simple timer to simulate playback progress while a track is playing
  useEffect(() => {
    if (!isPlaying || isPaused || duration <= 0) return;

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) return duration;
        return prev + 0.5; // update every 0.5s
      });
    }, 500);

    return () => window.clearInterval(interval);
  }, [isPlaying, isPaused, duration]);

  useEffect(() => {
    // Load library once on mount
    refreshLibrary();

    // Set up audio service callbacks
    audioService.setCallbacks({
      onTrackStart: (track) => {
        console.log('Track started:', track);

        // old current becomes previous
        setPreviousTrack(currentTrackRef.current);

        // new current
        setCurrentTrack(track);
        setIsPlaying(true);
        setLoading(false);
        setIsPaused(false);

        // reset progress (use start_offset for post-transition tracks)
        setCurrentTime(track.startOffset || 0);

        // try to pull duration & transition points off the track if backend sends them
        const t: any = track as any;
        const trackDuration = t?.duration ?? 0;
        const transitionsRaw =
          t?.transition_points ?? t?.transitionPoints ?? [];

        setDuration(typeof trackDuration === 'number' ? trackDuration : 0);
        setTransitionPoints(
          Array.isArray(transitionsRaw)
            ? transitionsRaw.filter((n: any) => typeof n === 'number')
            : []
        );

        // Clear transition info when new track's audio actually starts
        setPendingTransition(null);
        setIsTransitioning(false);

        // Keep the queued list, but remove the track that just started (so the queue represents "up next")
        setUpNext((prev) => prev.filter((t) => trackKey(t) !== trackKey(track)));
      },
      onTrackEnd: () => {
        console.log('Track ended');
        // wait for queue_empty before fully exiting
      },
      onQueueEmpty: () => {
        console.log('Queue empty - exiting music mode');
        setIsPlaying(false);
        setCurrentTrack(null);
        setIsPaused(false);
        setPendingTransition(null);
        setIsTransitioning(false);
        setCurrentTime(0);
        setDuration(0);
        setTransitionPoints([]);
        setUpNext([]);
      },
      onQueueUpdate: (queue: any) => {
        // The audioStream service now extracts the queue array for us
        const upcoming = Array.isArray(queue) ? queue : [];
        setUpNext(upcoming);
        // A queue update confirms the backend processed our prompt, so clear loading state
        setLoading(false);
      },
      onError: (message) => {
        console.error('Audio error:', message);
        setLoading(false);
      },
      onInfo: (_type, _message) => {
        // Backend responded but no song was queued/played — clear the loading spinner
        setLoading(false);
      },
      // Transition callbacks
      onTransitionPlanned: (transition) => {
        console.log('Transition planned:', transition);
        setPendingTransition(transition);
      },
      onTransitionStart: (transition) => {
        console.log('Transition starting:', transition);
        setPendingTransition(transition);
        setIsTransitioning(true);
      },
      onTransitionComplete: (nowPlaying) => {
        console.log(
          'Transition complete (backend streaming finished), now playing:',
          nowPlaying,
        );
        // don't clear here; onTrackStart will clean it up
      },
      onBackendLog: (lines) => {
        setBackendLogs((prev) => {
          const updated = [...prev, ...lines];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
        // Auto-scroll to bottom
        requestAnimationFrame(() => {
          logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      },
    });

    // Connect when component mounts
    const connectWebSocket = async () => {
      try {
        await audioService.connect();
        setConnectionStatus('connected');

        // Get analyser node after connection
        const analyser = audioService.getAnalyserNode();
        setAnalyserNode(analyser);
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        setConnectionStatus('disconnected');
      }
    };

    connectWebSocket();

    // Disconnect when component unmounts
    return () => {
      audioService.disconnect();
    };
  }, [audioService, refreshLibrary]);

  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (connectionStatus !== 'connected') {
        console.error('Cannot send prompt - not connected');
        return;
      }

      //setLoading(true);

      // Safety timeout: clear loading after 30s if no response clears it first
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('Loading timeout reached — clearing loading state');
        setLoading(false);
      }, 30_000);

      try {
        audioService.sendPrompt(prompt);
      } catch (error) {
        console.error('Error sending prompt:', error);
        setLoading(false);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      }
    },
    [connectionStatus, audioService],
  );

  // Set up speech recognition once (stable instance) + auto-send after brief silence
  useEffect(() => {
    const SpeechRecognition:
      | undefined
      | (new () => any) =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true; // IMPORTANT: don't stop after the first word
    rec.maxAlternatives = 1;

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    rec.onresult = (event: any) => {
      // Build transcript from all results so it keeps updating smoothly
      const text = Array.from(event.results)
        .map((r: any) => r?.[0]?.transcript ?? '')
        .join('')
        .trim();

      finalTranscriptRef.current = text;
      setVoicePreview(text);

      // Auto-send after the user stops speaking for ~900ms
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => {
        const toSend = finalTranscriptRef.current.trim();
        if (!toSend) return;

        // Stop listening before sending to avoid restarts/double-sends
        listeningRef.current = false;
        setIsListening(false);

        try {
          rec.stop();
        } catch {
          // ignore
        }

        // Clear UI preview after stopping
        setVoicePreview('');
        finalTranscriptRef.current = '';

        handleSubmit(toSend);
      }, 900);
    };

    rec.onerror = (e: any) => {
      console.error('[voice] recognition error', e);

      // Chrome often throws these while developing; if user still wants to listen, restart.
      if (listeningRef.current && (e?.error === 'no-speech' || e?.error === 'aborted')) {
        try {
          rec.stop();
        } catch {
          // ignore
        }
        setTimeout(() => {
          if (listeningRef.current) {
            try {
              rec.start();
            } catch {
              // ignore
            }
          }
        }, 250);
        return;
      }

      listeningRef.current = false;
      setIsListening(false);
      clearSilenceTimer();
    };

    rec.onend = () => {
      // Chrome ends recognition frequently; restart if we’re still in listening mode
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          // ignore
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      listeningRef.current = false;
      clearSilenceTimer();
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop?.();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [handleSubmit]);

  const startVoice = useCallback(() => {
    if (!speechSupported) return;
    if (connectionStatus !== 'connected') return;
    if (loading) return;

    const rec = recognitionRef.current;
    if (!rec) return;

    try {
      // Reset buffers
      finalTranscriptRef.current = '';
      setVoicePreview('');

      listeningRef.current = true;
      setIsListening(true);

      rec.start?.();
    } catch (e) {
      console.error('[voice] start failed', e);
      listeningRef.current = false;
      setIsListening(false);
    }
  }, [speechSupported, connectionStatus, loading]);

  const stopVoice = useCallback(() => {
    listeningRef.current = false;
    setIsListening(false);

    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      recognitionRef.current?.stop?.();
    } catch (e) {
      console.error('[voice] stop failed', e);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* User account icon */}
        <button
          onClick={() => isAuthenticated && setShowAccountPanel(true)}
          title={isAuthenticated ? `Signed in as ${user?.username}` : 'Guest — sign in to access your account'}
          className={`absolute top-4 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            isAuthenticated
              ? 'bg-primary-600/30 border border-primary-500/50 hover:bg-primary-600/50 hover:shadow-neon-purple cursor-pointer'
              : 'bg-white/5 border border-white/10 opacity-50 cursor-default'
          }`}
        >
          <UserCircle className="w-5 h-5 text-white/80" />
        </button>

        {/* Account slide-over panel */}
        <AccountPanel open={showAccountPanel} onClose={() => setShowAccountPanel(false)} />

        {/* Add Upload Button */}
        <button 
            onClick={() => setShowUploadModal(true)}
            className="absolute top-4 right-4 z-20 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center gap-2 transition-colors shadow-lg"
            >
            <Upload className="w-v h-4" />
            Upload Song
        </button>
        {/* ← ADD UPLOAD MODAL */}
              {showUploadModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="relative">
                    <button
                      onClick={() => setShowUploadModal(false)}
                      className="absolute -top-12 right-0 text-white text-2xl hover:text-gray-300"
                    >
                      ✕ Close
                    </button>
                    <SongUpload
                      onUploadComplete={(filename) => {
                        console.log('Uploaded:', filename);
                        setShowUploadModal(false);
                        refreshLibrary();
                      }}
                    />
                </div>
            </div>
        )}
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl transition-all duration-1000 ${
            isPlaying ? 'scale-150 opacity-40 animate-pulse' : 'animate-pulse-slow'
          }`}
        />
        <div
          className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary-600/20 rounded-full blur-3xl transition-all duration-1000 ${
            isPlaying
              ? 'scale-150 opacity-40 animate-pulse'
              : 'animate-pulse-slow animation-delay-1000'
          }`}
        />
        {isPlaying && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-neon-cyan/10 rounded-full blur-3xl animate-pulse" />
        )}
        {isTransitioning && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neon-cyan/20 rounded-full blur-3xl animate-pulse" />
        )}
      </div>

      {/* Main content wrapper with responsive layout */}
      <div
        className={`max-w-screen-2xl w-full relative z-10 flex transition-all duration-700 ease-out ${
          isPlaying
            ? 'h-[calc(100vh-2rem)] flex-col lg:flex-row items-stretch gap-6 py-8'
            : 'flex-col justify-center space-y-8'
        }`}
      >
        {/* Left sidebar: Library */}
        {isPlaying && (
          <aside
            className={`hidden lg:flex flex-col shrink-0 transition-all duration-300 ease-in-out ${
              isLibraryCollapsed ? 'w-10' : 'w-[340px] xl:w-[360px]'
            }`}
          >
            <div className={`h-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden ${isLibraryCollapsed ? 'p-0' : 'p-4'}`}>
              {isLibraryCollapsed ? (
                /* Collapsed: just the expand button */
                <button
                  type="button"
                  onClick={() => setIsLibraryCollapsed(false)}
                  className="w-full h-full flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
                  title="Expand library"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              ) : (
                /* Expanded: full panel */
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold tracking-widest text-gray-300">
                      LIBRARY
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={refreshLibrary}
                        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        {libraryLoading ? 'Loading…' : 'Refresh'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLibraryCollapsed(true)}
                        className="text-gray-400 hover:text-gray-200 transition-colors"
                        title="Collapse library"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {libraryError && (
                    <div className="text-xs text-red-300 mb-2 truncate">
                      {libraryError}
                    </div>
                  )}

                  <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-12rem)] pr-3 library-scroll">
                    {librarySongs.length === 0 && !libraryLoading ? (
                      <div className="text-sm text-gray-500">No songs found.</div>
                    ) : (
                      librarySongs.map((s: any, idx: number) => {
                        const title = s?.title ?? s?.name ?? s?.song_name ?? s?.id ?? 'Untitled';
                        const artist = s?.artist ?? '';
                        const bpm = typeof s?.bpm === 'number' ? Math.round(s.bpm) : null;
                        const key = s?.key ?? '';
                        const scale = s?.scale ?? '';

                        const prettyPrompt = artist
                          ? `play ${title} by ${artist}`
                          : `play ${title}`;

                        const keyStr = `${key}${scale ? ` ${scale}` : ''}`.trim();

                        return (
                          <button
                            key={s?.id ?? `${title}::${artist}::${idx}`}
                            type="button"
                            disabled={connectionStatus !== 'connected' || loading}
                            onClick={() => handleSubmit(prettyPrompt)}
                            className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 transition-colors disabled:opacity-50"
                          >
                            <div className="text-sm text-white/90 font-medium truncate">
                              {title}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {artist}
                              {bpm ? ` • ${bpm} BPM` : ''}
                              {keyStr ? ` • ${keyStr}` : ''}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
        {/* Left column */}
        <div
          className={`flex-1 relative flex flex-col transition-all duration-700 ease-out ${
            isPlaying ? 'justify-between' : 'justify-center'
          }`}
        >
          {/* Welcome text - fades out when playing */}
          <div
            className={`text-center space-y-5 transition-all duration-500 ${
              isPlaying
                ? 'opacity-0 scale-95 absolute pointer-events-none'
                : 'opacity-100 scale-100'
            }`}
          >
            <h1 className="text-7xl font-display font-black bg-gradient-music bg-clip-text text-transparent drop-shadow-2xl">
              Welcome To The Future of Music
            </h1>
            <p className="text-gray-300 text-lg font-medium">
              Tell me what you want to hear, and I'll mix it for you!
            </p>

            {/* Connection status - only show when not playing */}
            <div
              className={`flex items-center justify-center gap-2 text-sm transition-opacity duration-300 ${
                isPlaying ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              <span className="text-gray-400">
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Music mode content - fades in when playing */}
          <div
            className={`flex-1 flex flex-col items-center justify-center transition-all duration-500 ${
              isPlaying
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95 absolute pointer-events-none'
            }`}
          >
            {/* Transition info at the very top - shows upcoming mix */}
            <div className="w-full max-w-md mb-6">
              <TransitionInfo
                transition={pendingTransition}
                isTransitioning={isTransitioning}
              />
            </div>

            {/* Track info */}
            <div className="mb-6">
              <TrackInfo track={currentTrack} />
            </div>

            {/* Waveform */}
            <div className="w-full max-w-2xl px-4">
              <Waveform analyserNode={analyserNode} isPlaying={isPlaying} />
            </div>

            {/* Playback timeline under the waveform */}
            <div className="w-full max-w-2xl px-4 mt-6">
              <PlaybackTimeline
                currentTime={currentTime}
                duration={duration}
                transitionPoints={transitionPoints}
              />
            </div>
          </div>

          {/* Prompt box / Controls - transitions to bottom when playing */}
          <div
            className={`w-full transition-all duration-700 ease-out ${
              isPlaying ? 'mt-auto' : ''
            }`}
          >
            {/* Only show the toggle while in music mode */}
            {isPlaying && (
              <div className="w-full max-w-2xl mx-auto px-4 mb-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setInputMode((m) => (m === 'prompt' ? 'controls' : 'prompt'))
                  }
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition"
                >
                  <span
                    className={inputMode === 'prompt' ? 'text-white' : 'text-white/50'}
                  >
                    Prompt
                  </span>

                  <span className="relative inline-flex h-5 w-10 items-center rounded-full bg-white/10 border border-white/10">
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white/70 transition-transform ${
                        inputMode === 'controls' ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </span>

                  <span
                    className={inputMode === 'controls' ? 'text-white' : 'text-white/50'}
                  >
                    Controls
                  </span>
                </button>
              </div>
            )}

            {/* Prompt mode */}
            {(!isPlaying || inputMode === 'prompt') && (
              <div className="w-full max-w-2xl mx-auto px-4">
                {isListening && voicePreview && (
                  <div className="mb-2 text-xs text-white/60 truncate flex items-center gap-2">
                    <MicVocal className="w-4 h-4" />
                    <span>{voicePreview}</span>
                  </div>
                )}

                {!speechSupported && (
                  <div className="mb-2 text-xs text-white/40">
                    Voice input isn’t supported in this browser (works best in Chrome).
                  </div>
                )}

                <PromptBox
                  onSubmit={handleSubmit}
                  loading={loading}
                  disabled={connectionStatus !== 'connected'}
                  rightAccessory={
                    <button
                      type="button"
                      onClick={() => (isListening ? stopVoice() : startVoice())}
                      disabled={!speechSupported || connectionStatus !== 'connected' || loading}
                      className="rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 disabled:opacity-50 text-white p-2 transition-colors"
                      title={
                        speechSupported
                          ? isListening
                            ? 'Stop voice input'
                            : 'Start voice input'
                          : 'Voice input not supported in this browser'
                      }
                      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  }
                />
              </div>
            )}

            {/* Controls mode */}
            {isPlaying && inputMode === 'controls' && (
              <div className="w-full max-w-2xl mx-auto px-4">
                <div className="flex items-center gap-4 rounded-2xl bg-white/5 border border-white/10 px-5 py-3 shadow-lg">
                  {/* Play / Pause */}
                  <button
                    type="button"
                    disabled={connectionStatus !== 'connected' || !isPlaying}
                    onClick={() => {
                      if (isPaused) {
                        audioService.resume();
                        setIsPaused(false);
                      } else {
                        audioService.pause();
                        setIsPaused(true);
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play className="w-4 h-4 ml-0.5" /> : <Pause className="w-4 h-4" />}
                  </button>

                  {/* Next (quick transition) */}
                  <button
                    type="button"
                    disabled={connectionStatus !== 'connected' || !isPlaying}
                    onClick={() => handleSubmit('skip to next song')}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                    title="Skip to next song"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  {/* Volume slider */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        const newVol = volume > 0 ? 0 : 1;
                        setVolume(newVol);
                        audioService.setVolume(newVol);
                      }}
                      className="text-white/60 hover:text-white transition-colors shrink-0 cursor-pointer"
                      title={volume === 0 ? 'Unmute' : 'Mute'}
                    >
                      {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        audioService.setVolume(v);
                      }}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {isPlaying && (
              <p className="text-center text-gray-500 text-sm mt-3 animate-fade-in">
                {pendingTransition
                  ? 'Transition queued! Ask for another song to queue more'
                  : 'Request another song to mix it in'}
              </p>
            )}
          </div>
        </div>

        {/* Right column: full queue */}
        {isPlaying && (
          <aside className="w-full lg:w-[360px] flex-shrink-0 flex flex-col">
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-4 flex flex-col">
              {/* Tab toggle */}
              <div className="flex mb-3 bg-black/20 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('queue')}
                  className={`flex-1 py-1.5 text-[10px] uppercase tracking-widest font-medium rounded-md transition-all cursor-pointer ${
                    rightPanelTab === 'queue'
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  Queue
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('logs')}
                  className={`flex-1 py-1.5 text-[10px] uppercase tracking-widest font-medium rounded-md transition-all cursor-pointer ${
                    rightPanelTab === 'logs'
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  Logs
                </button>
              </div>

              {/* Queue view */}
              {rightPanelTab === 'queue' && (
                <QueuePanel
                  currentTrack={currentTrack}
                  previousTrack={previousTrack}
                  upNext={upNext}
                  onReorder={(newOrder) => audioService.sendReorderQueue(newOrder)}
                />
              )}

              {/* Logs view */}
              {rightPanelTab === 'logs' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 overflow-y-auto library-scroll rounded-lg bg-black/30 border border-white/5 p-3 font-mono text-[11px] leading-relaxed text-white/60">
                    {backendLogs.length === 0 ? (
                      <p className="text-white/20 italic">No logs yet...</p>
                    ) : (
                      backendLogs.map((line, i) => (
                        <div
                          key={i}
                          className={`py-0.5 ${
                            line.includes('ERROR') || line.includes('Error')
                              ? 'text-red-400'
                              : line.includes('[WS]')
                              ? 'text-neon-cyan/70'
                              : line.includes('[QUEUE]')
                              ? 'text-neon-green/70'
                              : line.includes('[TRANSITION]') || line.includes('[DEBUG]')
                              ? 'text-neon-purple/70'
                              : ''
                          }`}
                        >
                          {line}
                        </div>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
