export interface TrackInfo {
    title: string;
    artist: string;
    bpm: number;
    key: string;
    duration: number;
    sampleRate: number;
    startOffset?: number;
}

// Match backend TransitionPlan.to_dict() keys
export interface TransitionInfo {
    song_a: string;
    song_b: string;
    exit_segment: string;
    entry_segment: string;
    score: number;
    crossfade_duration: number;
    transition_start_time: number;
    song_b_start_offset: number;

    // optional alias the backend sometimes sends
    start_time?: number;
    is_quick?: boolean;
}

export interface AudioServiceCallbacks {
    onTrackStart?: (track: TrackInfo) => void;
    onTrackEnd?: () => void;
    onQueueEmpty?: () => void;

    onQueueUpdate?: (queue: TrackInfo[]) => void;

    onError?: (message: string) => void;
    onInfo?: (type: string, message: string) => void;
    onTransitionPlanned?: (transition: TransitionInfo) => void;
    onTransitionStart?: (transition: TransitionInfo) => void;
    onTransitionComplete?: (nowPlaying: string) => void;
    onBackendLog?: (lines: string[]) => void;
}

// Audio queue item tagged with track ID
interface QueuedAudio {
    buffer: AudioBuffer;
    trackId: number;
}

// Pending track transition
interface PendingTransition {
    trackId: number;
    startTime: number; // AudioContext time when this track's audio starts
    trackInfo: TrackInfo;
}

export class AudioStreamService {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    // Web Audio API components
    private audioContext: AudioContext | null = null;
    private analyserNode: AnalyserNode | null = null;
    private gainNode: GainNode | null = null;
    private sampleRate: number = 44100;
    private isPlaying: boolean = false;
    private isPaused = false;
    private currentSource: AudioBufferSourceNode | null = null;
    private nextStartTime: number = 0;

    // Audio queue with track ID tags
    private audioQueue: QueuedAudio[] = [];

    // Track ID system - increments with each track_start
    private currentStreamingTrackId: number = 0;
    private currentPlayingTrackId: number = 0;

    // Track info management
    private currentTrack: TrackInfo | null = null;
    private trackInfoMap: Map<number, TrackInfo> = new Map(); // trackId -> TrackInfo

    // Transition info
    private pendingTransitionInfo: TransitionInfo | null = null;
    private isTransitioning: boolean = false;

    // Pending transitions - scheduled to trigger at specific audio times
    private pendingTransitions: PendingTransition[] = [];
    private transitionCheckInterval: number | null = null;

    // Callbacks
    private callbacks: AudioServiceCallbacks = {};

    // Synchronization flags
    private allTracksStreamingComplete: boolean = false;
    private playbackCheckInterval: number | null = null;

    private readonly PRE_BUFFER_CHUNKS = 4;
    private buffering = true;

    setCallbacks(callbacks: AudioServiceCallbacks) {
        this.callbacks = callbacks;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log("WebSocket already connected");
                resolve();
                return;
            }

            const wsBase = import.meta.env.VITE_WS_URL
                ?? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
            this.ws = new WebSocket(`${wsBase}/api/ws/audio`);
            this.ws.onopen = () => {
                console.log(" webSocket connected successfully");
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.ws!.send(JSON.stringify({ type: "reset" }));

                // Initialize audio context
                this.initAudioContext();

                resolve();
            };

            this.ws.onmessage = async (event) => {
                if (typeof event.data === "string") {
                    // Handle JSON messages
                    const message = JSON.parse(event.data);
                    this.handleJsonMessage(message);
                } else if (event.data instanceof Blob) {
                    // Handle binary audio data
                    await this.handleAudioData(event.data);
                }
            };

            this.ws.onerror = (error) => {
                console.error(" WebSocket error:", error);
                this.isConnected = false;
                reject(error);
            };

            this.ws.onclose = () => {
                console.log("WebSocket closed");
                this.isConnected = false;
                this.stopPlayback();

                // attempt to reconnect
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(
                        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
                    );
                    setTimeout(() => this.connect(), 2000);
                }
            };

            // if it takes to long, just timeout
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error("WebSocket connection timeout"));
                }
            }, 5000);
        });
    }

    private initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();

            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);

            // Create analyser node for visualization
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            this.analyserNode.smoothingTimeConstant = 0.8;
            this.analyserNode.connect(this.gainNode);

            console.log("🎵 Audio context and analyser initialized");
        }
    }

    private getBufferDelay(): number {
        if (!this.audioContext) return 0;
        return Math.max(0, this.nextStartTime - this.audioContext.currentTime);
    }

    private handleJsonMessage(message: any) {
        console.log("📨 Received JSON:", message);

        switch (message.type) {
            case "track_start":
                console.log("🎵 Track info received:", message.track.title);
                this.sampleRate = message.track.sample_rate || 44100;

                // Increment track ID for this new track
                this.currentStreamingTrackId++;
                const trackId = this.currentStreamingTrackId;

                // Create track info object
                const newTrackInfo: TrackInfo = {
                    title: message.track.title || "Unknown",
                    artist: message.track.artist || "Unknown Artist",
                    bpm: message.track.bpm,
                    key: message.track.key,
                    duration: message.track.duration,
                    sampleRate: this.sampleRate,
                    startOffset: message.track.start_offset || 0,
                };

                // Store track info
                this.trackInfoMap.set(trackId, newTrackInfo);

                // If we're not currently playing anything, this is the first track
                if (!this.isPlaying || !this.currentTrack) {
                    console.log(
                        "🎵 Setting as current track (first/only track), trackId:",
                        trackId,
                    );
                    this.currentTrack = newTrackInfo;
                    this.currentPlayingTrackId = trackId;
                    this.allTracksStreamingComplete = false;

                    this.startPlayback();
                    this.startTransitionMonitor();

                    // Trigger callback
                    if (this.callbacks.onTrackStart) {
                        this.callbacks.onTrackStart(this.currentTrack);
                    }
                } else {
                    console.log(
                        "🎵 Track info stored for later, trackId:",
                        trackId,
                        "title:",
                        newTrackInfo.title,
                    );
                }
                break;

            case "track_end":
                console.log("✅ Backend finished streaming track");
                break;

            case "queue_empty":
                console.log("📭 Backend queue is empty - all tracks streamed");
                this.allTracksStreamingComplete = true;
                // Clear pending transition info when queue is done
                this.pendingTransitionInfo = null;
                // Start monitoring for final playback completion
                this.startPlaybackMonitor();
                break;

            case "queued":
                console.log("➕ Song queued:", message.message);
                break;

            case "auto_queued":
            case "queue_update":
            case "queue_snapshot":
                console.log(`📜 ${message.type} received:`, message);
                if (this.callbacks.onQueueUpdate) {
                    // The backend sends the queue in several possible locations depending on
                    // the message type.  Try them all in priority order:
                    //   1. message.queue_status.queue  (from _queue_payload via app.py)
                    //   2. message.queue               (flat array from _queue_payload, or
                    //                                   status object from _notify_auto_queue)
                    //   3. message.queue.queue          (when message.queue is a status object)
                    //   4. message.upcoming             (alternate key from _queue_payload)
                    const raw =
                        (Array.isArray(message.queue_status?.queue) &&
                            message.queue_status.queue) ||
                        (Array.isArray(message.queue) && message.queue) ||
                        (Array.isArray(message.queue?.queue) &&
                            message.queue.queue) ||
                        (Array.isArray(message.upcoming) && message.upcoming) ||
                        [];
                    this.callbacks.onQueueUpdate(raw);
                }
                break;
            // NEW: Transition messages
            case "transition_planned":
                console.log("🎛️ Transition planned:", message.transition);
                this.pendingTransitionInfo = this.parseTransitionInfo(
                    message.transition,
                );
                if (this.pendingTransitionInfo) {
                    this.pendingTransitionInfo.is_quick =
                        message.is_quick ?? false;
                }
                if (
                    this.callbacks.onTransitionPlanned &&
                    this.pendingTransitionInfo
                ) {
                    this.callbacks.onTransitionPlanned(
                        this.pendingTransitionInfo,
                    );
                }
                break;

            case "transition_start":
                console.log("🎛️ Transition starting:", message.transition);
                this.isTransitioning = true;
                const transitionInfo = this.parseTransitionInfo(
                    message.transition,
                );
                if (this.callbacks.onTransitionStart && transitionInfo) {
                    this.callbacks.onTransitionStart(transitionInfo);
                }
                break;

            case "transition_complete":
                const delay = this.getBufferDelay();
                setTimeout(() => {
                    console.log(
                        "🎛️ Transition complete, now playing:",
                        message.now_playing?.title,
                    );
                    this.isTransitioning = false;
                    this.pendingTransitionInfo = null;
                    if (this.callbacks.onTransitionComplete) {
                        this.callbacks.onTransitionComplete(
                            message.now_playing?.title || "Unknown",
                        );
                    }
                }, delay * 1000);
                break;

            case "error":
                console.error("❌ Server error:", message.message);
                if (this.callbacks.onError) {
                    this.callbacks.onError(message.message);
                }
                break;

            case "backend_log":
                if (this.callbacks.onBackendLog && message.lines) {
                    this.callbacks.onBackendLog(message.lines);
                }
                break;

            // Non-actionable responses from the backend (no song queued, no playback change)
            case "greeting":
            case "help":
            case "unknown":
            case "stopped":
            case "quick_transition_scheduled":
            case "force_skip_initiated":
                console.log(
                    `ℹ️ Backend responded with ${message.type}:`,
                    message.message,
                );
                if (this.callbacks.onInfo) {
                    this.callbacks.onInfo(message.type, message.message);
                }
                break;

            default:
                console.log("Received:", message);
                // Treat any other unrecognised JSON message as a signal the backend is done
                if (this.callbacks.onInfo) {
                    this.callbacks.onInfo(message.type, message.message);
                }
        }
    }

    private parseTransitionInfo(data: any): TransitionInfo | null {
        if (!data) return null;

        return {
            song_a: data.song_a || data.songA || "Current",
            song_b: data.song_b || data.songB || "Next",
            exit_segment: data.exit_segment || data.exitSegment || "unknown",
            entry_segment: data.entry_segment || data.entrySegment || "unknown",
            score: data.score ?? 0,
            crossfade_duration:
                data.crossfade_duration ?? data.crossfadeDuration ?? 8,
            transition_start_time:
                data.transition_start_time ??
                data.transitionStartTime ??
                data.start_time ??
                0,
            song_b_start_offset:
                data.song_b_start_offset ?? data.songBStartOffset ?? 0,
            start_time: data.start_time,
            is_quick: data.is_quick ?? false,
        };
    }

    private startTransitionMonitor() {
        // Clear any existing monitor
        if (this.transitionCheckInterval !== null) {
            clearInterval(this.transitionCheckInterval);
        }

        // Check every 50ms if any pending transitions should trigger
        this.transitionCheckInterval = window.setInterval(() => {
            this.checkPendingTransitions();
        }, 50);
    }

    private checkPendingTransitions() {
        if (!this.audioContext || this.pendingTransitions.length === 0) return;

        const currentTime = this.audioContext.currentTime;

        // Check if any pending transitions should trigger
        while (this.pendingTransitions.length > 0) {
            const nextTransition = this.pendingTransitions[0];

            // If it's time (or past time) for this transition
            if (currentTime >= nextTransition.startTime - 0.02) {
                // Small buffer for timing
                this.pendingTransitions.shift();
                this.executeTrackTransition(nextTransition);
            } else {
                // Not time yet for the next transition
                break;
            }
        }
    }

    private executeTrackTransition(transition: PendingTransition) {
        console.log(
            "🎵 Executing track transition to trackId:",
            transition.trackId,
            "title:",
            transition.trackInfo.title,
        );

        this.currentTrack = transition.trackInfo;
        this.currentPlayingTrackId = transition.trackId;

        // Clear transition info after transition completes
        this.pendingTransitionInfo = null;

        // Trigger track start callback
        if (this.callbacks.onTrackStart) {
            this.callbacks.onTrackStart(this.currentTrack);
        }
    }

    private startPlaybackMonitor() {
        // Clear any existing monitor
        if (this.playbackCheckInterval !== null) {
            clearInterval(this.playbackCheckInterval);
        }

        // Check every 100ms if all playback has finished
        this.playbackCheckInterval = window.setInterval(() => {
            this.checkFinalPlaybackCompletion();
        }, 100);
    }

    private checkFinalPlaybackCompletion() {
        if (!this.audioContext) return;

        const currentTime = this.audioContext.currentTime;
        const isStillPlaying = currentTime < this.nextStartTime - 0.05;

        // Check if ALL playback is truly finished
        if (
            this.allTracksStreamingComplete &&
            this.audioQueue.length === 0 &&
            !isStillPlaying &&
            this.pendingTransitions.length === 0
        ) {
            console.log("🎵 All playback finished - exiting music mode");

            // Clear monitors
            if (this.playbackCheckInterval !== null) {
                clearInterval(this.playbackCheckInterval);
                this.playbackCheckInterval = null;
            }
            if (this.transitionCheckInterval !== null) {
                clearInterval(this.transitionCheckInterval);
                this.transitionCheckInterval = null;
            }

            this.currentTrack = null;
            this.isPlaying = false;
            this.isPaused = false;
            this.pendingTransitionInfo = null;

            if (this.callbacks.onTrackEnd) {
                this.callbacks.onTrackEnd();
            }

            if (this.callbacks.onQueueEmpty) {
                this.callbacks.onQueueEmpty();
            }
        }
    }

    private applyFades(audioBuffer: AudioBuffer): AudioBuffer {
        const fadeFrames = Math.floor(this.sampleRate * 0.005);

        for (
            let channel = 0;
            channel < audioBuffer.numberOfChannels;
            channel++
        ) {
            const data = audioBuffer.getChannelData(channel);

            for (let i = 0; i < fadeFrames; i++) {
                data[i] *= i / fadeFrames;
            }

            for (let i = 0; i < fadeFrames; i++) {
                data[data.length - 1 - i] *= i / fadeFrames;
            }
        }

        return audioBuffer;
    }

    private async handleAudioData(blob: Blob) {
        try {
            if (!this.audioContext) {
                console.error("Audio context not initialized");
                return;
            }

            // Convert blob to ArrayBuffer
            const arrayBuffer = await blob.arrayBuffer();

            // Convert int16 PCM data to AudioBuffer
            const audioBuffer = this.int16ToAudioBuffer(arrayBuffer);
            const fadedBuffer = this.applyFades(audioBuffer);

            // Create queue item tagged with current streaming track ID
            const queueItem: QueuedAudio = {
                buffer: fadedBuffer,
                trackId: this.currentStreamingTrackId,
            };

            // Add to queue
            this.audioQueue.push(queueItem);

            const bufferAhead =
                this.nextStartTime - (this.audioContext?.currentTime ?? 0);
            //Logging to see buffer health
            //This log should only occur if the buffer is lagging behind
            if (bufferAhead < 0.5) {
                console.log(
                    `📊 Buffer: ${bufferAhead.toFixed(3)}s ahead, queue: ${this.audioQueue.length} chunks`,
                );
            }

            if (bufferAhead < 0.2 && !this.buffering) {
                console.warn("Buffer nearly emply, re-buffering...");
                this.buffering = true;
                if (this.audioContext) {
                    this.nextStartTime = this.audioContext.currentTime + 0.5;
                }
            }

            if (
                this.buffering &&
                this.audioQueue.length >= this.PRE_BUFFER_CHUNKS
            ) {
                this.buffering = false;
                this.scheduleNextBuffer();
            } else if (!this.buffering) {
                this.scheduleNextBuffer();
            }

            //this.scheduleNextBuffer();
        } catch (error) {
            console.error("Error processing audio data:", error);
        }
    }

    private int16ToAudioBuffer(arrayBuffer: ArrayBuffer): AudioBuffer {
        if (!this.audioContext) {
            throw new Error("Audio context not initialized");
        }

        const dataView = new DataView(arrayBuffer);
        const numSamples = arrayBuffer.byteLength / 4;

        const audioBuffer = this.audioContext.createBuffer(
            2,
            numSamples,
            this.sampleRate,
        );

        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
            const offset = i * 4;
            leftChannel[i] = dataView.getInt16(offset, true) / 32768.0;
            rightChannel[i] = dataView.getInt16(offset + 2, true) / 32768.0;
        }

        return audioBuffer;
    }

    private startPlayback() {
        if (!this.isPlaying && this.audioContext) {
            this.isPlaying = true;
            this.buffering = true;
            this.nextStartTime = this.audioContext.currentTime;
            console.log("▶️ Playback started");
        }
    }

    // private scheduleNextBuffer() {
    //   if (!this.audioContext || !this.isPlaying || this.audioQueue.length === 0) {
    //     return;
    //   }
    //
    //   // Get next audio item
    //   const audioItem = this.audioQueue.shift()!;
    //   const audioBuffer = audioItem.buffer;
    //   const bufferTrackId = audioItem.trackId;
    //
    //   // Calculate when this buffer will start playing
    //   const startTime = Math.max(
    //     this.nextStartTime,
    //     this.audioContext.currentTime,
    //   );
    //
    //   // Check if this buffer belongs to a different track than currently playing
    //   if (bufferTrackId !== this.currentPlayingTrackId) {
    //     // Schedule a transition to happen when this buffer starts playing
    //     const trackInfo = this.trackInfoMap.get(bufferTrackId);
    //     if (trackInfo) {
    //       // Check if we already have a pending transition for this track
    //       const existingTransition = this.pendingTransitions.find(
    //         (t) => t.trackId === bufferTrackId,
    //       );
    //       if (!existingTransition) {
    //         console.log(
    //           "🎵 Scheduling track transition to trackId:",
    //           bufferTrackId,
    //           "at time:",
    //           startTime.toFixed(2),
    //         );
    //         this.pendingTransitions.push({
    //           trackId: bufferTrackId,
    //           startTime: startTime,
    //           trackInfo: trackInfo,
    //         });
    //       }
    //     }
    //   }
    //
    //   const source = this.audioContext.createBufferSource();
    //   source.buffer = audioBuffer;
    //
    //   if (this.analyserNode) {
    //     source.connect(this.analyserNode);
    //   } else if (this.gainNode) {
    //     source.connect(this.gainNode);
    //   } else {
    //     source.connect(this.audioContext.destination);
    //   }
    //
    //   source.start(startTime);
    //
    //   this.nextStartTime = startTime + audioBuffer.duration;
    //
    //   // Set up onended callback
    //   source.onended = () => {
    //     // Continue scheduling more buffers
    //     if (this.audioQueue.length > 0) {
    //       this.scheduleNextBuffer();
    //     }
    //   };
    //
    //   this.currentSource = source;
    // }

    private scheduleNextBuffer() {
        if (!this.audioContext || !this.isPlaying) return;

        while (this.audioQueue.length > 0) {
            const audioItem = this.audioQueue.shift()!;
            const audioBuffer = audioItem.buffer;
            const bufferTrackId = audioItem.trackId;

            const startTime = Math.max(
                this.nextStartTime,
                this.audioContext.currentTime,
            );

            if (bufferTrackId != this.currentPlayingTrackId) {
                const trackInfo = this.trackInfoMap.get(bufferTrackId);
                if (trackInfo) {
                    const existingTransition = this.pendingTransitions.find(
                        (t) => t.trackId === bufferTrackId,
                    );
                    if (!existingTransition) {
                        this.pendingTransitions.push({
                            trackId: bufferTrackId,
                            startTime: startTime,
                            trackInfo: trackInfo,
                        });
                    }
                }
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            if (this.analyserNode) {
                source.connect(this.analyserNode);
            } else if (this.gainNode) {
                source.connect(this.gainNode);
            } else {
                source.connect(this.audioContext.destination);
            }

            source.start(startTime);
            this.nextStartTime = startTime + audioBuffer.duration;
            this.currentSource = source;
        }
    }

    private stopPlayback() {
        this.isPlaying = false;
        this.audioQueue = [];
        this.currentTrack = null;
        this.trackInfoMap.clear();
        this.pendingTransitions = [];
        this.pendingTransitionInfo = null;
        this.isTransitioning = false;
        this.allTracksStreamingComplete = false;
        this.currentStreamingTrackId = 0;
        this.currentPlayingTrackId = 0;

        if (this.playbackCheckInterval !== null) {
            clearInterval(this.playbackCheckInterval);
            this.playbackCheckInterval = null;
        }
        if (this.transitionCheckInterval !== null) {
            clearInterval(this.transitionCheckInterval);
            this.transitionCheckInterval = null;
        }

        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Source might already be stopped
            }
            this.currentSource = null;
        }

        console.log("⏹ Playback stopped");
    }

    sendPrompt(prompt: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "prompt", data: prompt }));
            console.log(" Sent prompt:", prompt);
        } else {
            console.error(" Cannot send - WebSocket is not connected");
            throw new Error("WebSocket is not connected");
        }
    }

    sendReorderQueue(newOrder: number[]) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({ type: "reorder_queue", order: newOrder }),
            );
        }
    }

    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    getAnalyserNode(): AnalyserNode | null {
        return this.analyserNode;
    }

    getCurrentTrack(): TrackInfo | null {
        return this.currentTrack;
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    getIsPaused(): boolean {
        return this.isPaused;
    }

    pause(): void {
        if (!this.audioContext) return;

        if (!this.isPaused) {
            this.audioContext.suspend().catch((e) => {
                console.warn("[AudioStreamService] pause failed", e);
            });
            this.isPaused = true;
        }
    }

    resume(): void {
        if (!this.audioContext) return;

        if (this.isPaused) {
            this.audioContext.resume().catch((e) => {
                console.warn("[AudioStreamService] resume failed", e);
            });
            this.isPaused = false;
        }
    }

    setVolume(value: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, value));
        }
    }

    getVolume(): number {
        return this.gainNode ? this.gainNode.gain.value : 1;
    }

    getPendingTransition(): TransitionInfo | null {
        return this.pendingTransitionInfo;
    }

    getIsTransitioning(): boolean {
        return this.isTransitioning;
    }

    getQueueLength(): number {
        return this.pendingTransitions.length;
    }

    disconnect() {
        this.stopPlayback();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
            this.analyserNode = null;
            this.gainNode = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }
}
