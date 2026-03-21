import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Play,
  X,
  Search,
  Music,
  ListMusic,
  Sparkles,
  Square,
  Loader2,
} from 'lucide-react';
import {
  fetchSetlists,
  fetchSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
  getBestTransition,
  getBestTransitionsBulk,
  getTransitionPreview,
  type Setlist,
  type SetlistItem,
} from '../services/setlistApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SongSegment = { name: string; start: number; end: number };

type LibrarySong = {
  song_key?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  is_user_song?: boolean;
  segments?: SongSegment[];
  features?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Custom styled dropdown component
// ---------------------------------------------------------------------------
function SegmentDropdown({
  value,
  options,
  onChange,
  label,
}: {
  value: string | null;
  options: string[];
  onChange: (val: string | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const display = value ?? 'Auto';

  return (
    <div ref={ref} className="relative inline-block">
      <span className="text-[10px] text-white/25 mr-1">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 hover:border-neon-purple/40 text-[11px] text-white/60 hover:text-white/80 transition-all cursor-pointer min-w-[80px] justify-between"
      >
        <span className={value ? 'text-neon-purple/90' : 'text-white/40'}>{display}</span>
        <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-36 bg-[#13082a] border border-white/10 rounded-lg shadow-2xl overflow-hidden backdrop-blur-xl">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-neon-purple/10 transition-colors cursor-pointer ${
              value === null ? 'text-neon-purple bg-neon-purple/5' : 'text-white/50'
            }`}
          >
            Auto
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-neon-purple/10 transition-colors cursor-pointer ${
                value === opt ? 'text-neon-purple bg-neon-purple/5' : 'text-white/50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable item component
// ---------------------------------------------------------------------------
function SortableSetlistItem({
  id,
  item,
  index,
  totalItems,
  songSegmentsMap,
  nextSongSegments,
  prevEntrySegmentName,
  onRemove,
  onTransitionChange,
  onUseBest,
  onPreview,
  isLoadingBest,
  previewState,
}: {
  id: string;
  item: SetlistItem;
  index: number;
  totalItems: number;
  songSegmentsMap: Map<string, SongSegment[]>;
  nextSongSegments: string[];
  prevEntrySegmentName: string | null;
  onRemove: (index: number) => void;
  onTransitionChange: (index: number, field: 'transition_exit_segment' | 'transition_entry_segment', value: string | null) => void;
  onUseBest: (index: number) => void;
  onPreview: (index: number) => void;
  isLoadingBest: boolean;
  previewState: 'idle' | 'loading' | 'playing';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get all segments for this song, then filter exit options:
  // Only show segments that start at or after the entry point from the previous transition.
  // e.g. if the previous transition enters at "beat-drop", you can only exit from
  // segments that occur at or after the beat-drop since the song plays from there onward.
  const allSegments = songSegmentsMap.get(item.song_key) ?? [];
  const exitSegments = (() => {
    if (!prevEntrySegmentName || allSegments.length === 0) {
      return allSegments.map((s) => s.name);
    }
    const entrySegObj = allSegments.find((s) => s.name === prevEntrySegmentName);
    if (!entrySegObj) return allSegments.map((s) => s.name);
    return allSegments
      .filter((s) => s.start >= entrySegObj.start)
      .map((s) => s.name);
  })();

  return (
    <div ref={setNodeRef} style={style}>
      {/* Song row */}
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 group">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <span className="text-xs text-white/30 w-5 shrink-0">{index + 1}</span>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90 font-medium truncate">{item.song_title}</div>
          {item.song_artist && (
            <div className="text-xs text-white/40 truncate">{item.song_artist}</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-white/20 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Transition controls between this song and the next */}
      {index < totalItems - 1 && (
        <div className="mx-4 my-2 px-4 py-2.5 bg-white/[0.02] border border-dashed border-white/[0.06] rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Exit segment dropdown */}
            <SegmentDropdown
              value={item.transition_exit_segment}
              options={exitSegments}
              onChange={(val) => onTransitionChange(index, 'transition_exit_segment', val)}
              label="Exit"
            />

            <span className="text-white/10 text-xs">&rarr;</span>

            {/* Entry segment dropdown */}
            <SegmentDropdown
              value={item.transition_entry_segment}
              options={nextSongSegments}
              onChange={(val) => onTransitionChange(index, 'transition_entry_segment', val)}
              label="Entry"
            />

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Use Best button */}
              <button
                type="button"
                onClick={() => onUseBest(index)}
                disabled={isLoadingBest}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-neon-purple/10 border border-neon-purple/20 hover:bg-neon-purple/20 disabled:opacity-40 text-[10px] text-neon-purple transition-all cursor-pointer disabled:cursor-default"
                title="Use ML model to find the best transition"
              >
                {isLoadingBest ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Best
              </button>

              {/* Sample/Preview button */}
              <button
                type="button"
                onClick={() => onPreview(index)}
                disabled={previewState === 'loading'}
                className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] transition-all cursor-pointer disabled:cursor-default ${
                  previewState === 'playing'
                    ? 'bg-neon-cyan/20 border-neon-cyan/30 text-neon-cyan'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/50 hover:text-white/70'
                }`}
                title="Preview this transition"
              >
                {previewState === 'loading' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : previewState === 'playing' ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Sample
              </button>
            </div>
          </div>

          {/* Score display if we have a best score */}
          {item.transition_exit_segment && item.transition_entry_segment && (
            <div className="mt-1.5 text-[9px] text-white/20">
              {item.transition_exit_segment} &rarr; {item.transition_entry_segment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Mixer page
// ---------------------------------------------------------------------------
export default function Mixer() {
  const navigate = useNavigate();
  const { token } = useAuth();

  // Setlist list state
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [setlistsLoading, setSetlistsLoading] = useState(true);

  // Active setlist being edited
  const [activeSetlistId, setActiveSetlistId] = useState<number | null>(null);
  const [setlistName, setSetlistName] = useState('');
  const [setlistItems, setSetlistItems] = useState<SetlistItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Library song picker
  const [librarySongs, setLibrarySongs] = useState<LibrarySong[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  // Segments map: song_key -> full segment objects (with start/end for filtering)
  const [songSegmentsMap, setSongSegmentsMap] = useState<Map<string, SongSegment[]>>(new Map());

  // Best transition loading per index
  const [loadingBestIndex, setLoadingBestIndex] = useState<number | null>(null);
  const [optimizingAll, setOptimizingAll] = useState(false);

  // Audio preview
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Load setlists on mount
  useEffect(() => {
    if (!token) return;
    setSetlistsLoading(true);
    fetchSetlists(token)
      .then(setSetlists)
      .catch((e) => console.error('Failed to load setlists:', e))
      .finally(() => setSetlistsLoading(false));
  }, [token]);

  // Load library songs and build segments map
  useEffect(() => {
    if (!token) return;
    setLibraryLoading(true);
    const url = `/api/library?token=${encodeURIComponent(token)}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: any) => {
        const songs: LibrarySong[] = Array.isArray(data) ? data : Array.isArray(data?.songs) ? data.songs : [];
        setLibrarySongs(songs);

        // Build segments map (full objects with start/end times)
        const map = new Map<string, SongSegment[]>();
        for (const song of songs) {
          const segs = song.segments ?? [];
          const key = (song.title ?? '').toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ').trim();
          if (segs.length > 0) {
            map.set(key, segs);
          }
          // Also map the raw title for direct matches
          if (song.title) {
            map.set(song.title, segs);
          }
        }
        setSongSegmentsMap(map);
      })
      .catch((e) => console.error('Failed to load library:', e))
      .finally(() => setLibraryLoading(false));
  }, [token]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const refreshSetlists = useCallback(() => {
    if (!token) return;
    fetchSetlists(token).then(setSetlists).catch(console.error);
  }, [token]);

  // ---- Setlist CRUD handlers ----
  const handleNew = () => {
    setActiveSetlistId(null);
    setSetlistName('');
    setSetlistItems([]);
    setIsDirty(true);
    setError(null);
  };

  const handleLoad = async (id: number) => {
    if (!token) return;
    try {
      const sl = await fetchSetlist(token, id);
      setActiveSetlistId(sl.id);
      setSetlistName(sl.name);
      setSetlistItems(sl.items ?? []);
      setIsDirty(false);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteSetlist(token, id);
      if (activeSetlistId === id) {
        setActiveSetlistId(null);
        setSetlistName('');
        setSetlistItems([]);
        setIsDirty(false);
      }
      refreshSetlists();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = async () => {
    if (!token || !setlistName.trim()) {
      setError('Setlist name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (activeSetlistId) {
        await updateSetlist(token, activeSetlistId, { name: setlistName, items: setlistItems });
      } else {
        const created = await createSetlist(token, { name: setlistName, items: setlistItems });
        setActiveSetlistId(created.id);
      }
      setIsDirty(false);
      refreshSetlists();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = () => {
    if (!activeSetlistId) return;
    navigate('/dj', { state: { setlistId: activeSetlistId } });
  };

  // ---- Song management ----
  const addSong = (song: LibrarySong) => {
    const title = song.title ?? 'Untitled';
    const artist = song.artist ?? '';
    const key = song.song_key ?? title.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ').trim();
    setSetlistItems((prev) => [
      ...prev,
      {
        song_key: key,
        song_title: title,
        song_artist: artist,
        transition_exit_segment: null,
        transition_entry_segment: null,
      },
    ]);
    setIsDirty(true);
    setShowSongPicker(false);
    setSongSearch('');
  };

  const removeSong = (index: number) => {
    setSetlistItems((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSetlistItems((items) => {
      const oldIndex = items.findIndex((_, i) => `item-${i}` === active.id);
      const newIndex = items.findIndex((_, i) => `item-${i}` === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
    setIsDirty(true);
  };

  const handleTransitionChange = (
    index: number,
    field: 'transition_exit_segment' | 'transition_entry_segment',
    value: string | null,
  ) => {
    setSetlistItems((prev) => {
      const updated = prev.map((item, i) => (i === index ? { ...item, [field]: value } : item));

      // When an entry segment changes, the NEXT song's exit options are constrained.
      // If the next song already has an exit segment selected that now starts before
      // the new entry point, clear it so the user must re-pick.
      if (field === 'transition_entry_segment' && value && index + 1 < updated.length) {
        const nextItem = updated[index + 1];
        if (nextItem.transition_exit_segment) {
          const nextSongSegs = songSegmentsMap.get(nextItem.song_key) ?? [];
          const entrySeg = nextSongSegs.find((s) => s.name === value);
          const exitSeg = nextSongSegs.find((s) => s.name === nextItem.transition_exit_segment);
          if (entrySeg && exitSeg && exitSeg.start < entrySeg.start) {
            updated[index + 1] = { ...updated[index + 1], transition_exit_segment: null };
          }
        }
      }

      return updated;
    });
    setIsDirty(true);
  };

  // ---- "Use Best" per pair ----
  const handleUseBest = async (index: number) => {
    if (!token || index >= setlistItems.length - 1) return;
    setLoadingBestIndex(index);
    setError(null);
    try {
      const result = await getBestTransition(
        token,
        setlistItems[index].song_key,
        setlistItems[index + 1].song_key,
      );
      setSetlistItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                transition_exit_segment: result.best.exit_segment,
                transition_entry_segment: result.best.entry_segment,
              }
            : item,
        ),
      );
      setIsDirty(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingBestIndex(null);
    }
  };

  // ---- "Optimize All" ----
  const handleOptimizeAll = async () => {
    if (!token || setlistItems.length < 2) return;
    setOptimizingAll(true);
    setError(null);
    try {
      const keys = setlistItems.map((item) => item.song_key);
      const result = await getBestTransitionsBulk(token, keys);
      setSetlistItems((prev) => {
        const updated = [...prev];
        for (let i = 0; i < result.transitions.length; i++) {
          const t = result.transitions[i];
          if (t.best && i < updated.length) {
            updated[i] = {
              ...updated[i],
              transition_exit_segment: t.best.exit_segment,
              transition_entry_segment: t.best.entry_segment,
            };
          }
        }
        return updated;
      });
      setIsDirty(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOptimizingAll(false);
    }
  };

  // ---- Preview playback ----
  const stopPreview = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* ignore */ }
      sourceNodeRef.current = null;
    }
    setPreviewState('idle');
    setPreviewIndex(null);
  }, []);

  const handlePreview = async (index: number) => {
    if (!token || index >= setlistItems.length - 1) return;

    // If already playing this preview, stop it
    if (previewIndex === index && previewState === 'playing') {
      stopPreview();
      return;
    }

    // Stop any existing preview
    stopPreview();

    setPreviewIndex(index);
    setPreviewState('loading');
    setError(null);

    try {
      const item = setlistItems[index];
      const nextItem = setlistItems[index + 1];
      const { audioBuffer, sampleRate } = await getTransitionPreview(
        token,
        item.song_key,
        nextItem.song_key,
        item.transition_exit_segment,
        item.transition_entry_segment,
      );

      // Create AudioContext if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate });
      }
      const ctx = audioContextRef.current;

      // Decode PCM int16 to float32
      const int16Array = new Int16Array(audioBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      // Create AudioBuffer
      const buffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      buffer.copyToChannel(float32Array, 0);

      // Play
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPreviewState('idle');
        setPreviewIndex(null);
        sourceNodeRef.current = null;
      };
      source.start();
      sourceNodeRef.current = source;
      setPreviewState('playing');
    } catch (e: any) {
      setError(e.message);
      setPreviewState('idle');
      setPreviewIndex(null);
    }
  };

  // ---- Filtered songs for picker ----
  const filteredSongs = songSearch
    ? librarySongs.filter(
        (s) =>
          (s.title ?? '').toLowerCase().includes(songSearch.toLowerCase()) ||
          (s.artist ?? '').toLowerCase().includes(songSearch.toLowerCase()),
      )
    : librarySongs;

  const isEditing = activeSetlistId !== null || isDirty;

  return (
    <div className="min-h-screen bg-[#0a0118] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Account</span>
          </button>
          <div className="h-4 w-px bg-white/10" />
          <button
            onClick={() => navigate('/dj')}
            className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            Back to DJ
          </button>
          <h1 className="ml-auto text-lg font-semibold bg-gradient-music bg-clip-text text-transparent">
            Mixer
          </h1>
        </div>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Left: Saved setlists */}
          <div className="lg:w-[280px] shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold tracking-widest text-white/40 uppercase">
                Setlists
              </h2>
              <button
                onClick={handleNew}
                className="flex items-center gap-1.5 text-xs text-neon-purple hover:text-neon-purple/80 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
              {setlistsLoading ? (
                <div className="text-sm text-white/30 py-4 text-center">Loading...</div>
              ) : setlists.length === 0 ? (
                <div className="text-sm text-white/20 py-8 text-center">
                  <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No setlists yet
                </div>
              ) : (
                setlists.map((sl) => (
                  <div
                    key={sl.id}
                    className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                      activeSetlistId === sl.id
                        ? 'bg-neon-purple/10 border-neon-purple/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    onClick={() => handleLoad(sl.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/90 font-medium truncate">{sl.name}</div>
                      <div className="text-[10px] text-white/30">
                        {sl.item_count} song{sl.item_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(sl.id);
                      }}
                      className="text-white/10 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Editor */}
          <div className="flex-1 min-w-0">
            {!isEditing ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/20">
                <Music className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">Select a setlist or create a new one</p>
              </div>
            ) : (
              <div>
                {/* Name input + actions */}
                <div className="flex items-center gap-3 mb-6">
                  <input
                    type="text"
                    value={setlistName}
                    onChange={(e) => {
                      setSetlistName(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Setlist name..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-neon-purple/50 transition-colors"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving || !setlistName.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-neon-purple/20 border border-neon-purple/30 hover:bg-neon-purple/30 disabled:opacity-40 rounded-xl text-sm text-neon-purple transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  {activeSetlistId && setlistItems.length > 0 && (
                    <button
                      onClick={handlePlay}
                      disabled={isDirty}
                      title={isDirty ? 'Save first before playing' : 'Play this setlist in the DJ'}
                      className="flex items-center gap-2 px-4 py-2.5 bg-neon-green/20 border border-neon-green/30 hover:bg-neon-green/30 disabled:opacity-40 rounded-xl text-sm text-neon-green transition-colors cursor-pointer disabled:cursor-default"
                    >
                      <Play className="w-4 h-4" />
                      Play
                    </button>
                  )}
                </div>

                {/* Optimize All button */}
                {setlistItems.length >= 2 && (
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={handleOptimizeAll}
                      disabled={optimizingAll}
                      className="flex items-center gap-2 px-3 py-2 bg-neon-purple/10 border border-neon-purple/20 hover:bg-neon-purple/20 disabled:opacity-40 rounded-lg text-xs text-neon-purple transition-all cursor-pointer disabled:cursor-default"
                    >
                      {optimizingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {optimizingAll ? 'Optimizing...' : 'Optimize All Transitions'}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2 mb-4">
                    {error}
                  </div>
                )}

                {/* Song list */}
                {setlistItems.length === 0 ? (
                  <div className="text-center py-12 text-white/20">
                    <p className="text-sm mb-4">No songs yet. Add songs from the library.</p>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={setlistItems.map((_, i) => `item-${i}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1 mb-4">
                        {setlistItems.map((item, i) => (
                          <SortableSetlistItem
                            key={`item-${i}`}
                            id={`item-${i}`}
                            item={item}
                            index={i}
                            totalItems={setlistItems.length}
                            songSegmentsMap={songSegmentsMap}
                            nextSongSegments={
                              i < setlistItems.length - 1
                                ? (songSegmentsMap.get(setlistItems[i + 1].song_key) ?? []).map((s) => s.name)
                                : []
                            }
                            prevEntrySegmentName={
                              i > 0 ? setlistItems[i - 1].transition_entry_segment : null
                            }
                            onRemove={removeSong}
                            onTransitionChange={handleTransitionChange}
                            onUseBest={handleUseBest}
                            onPreview={handlePreview}
                            isLoadingBest={loadingBestIndex === i}
                            previewState={previewIndex === i ? previewState : 'idle'}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Add song button */}
                <button
                  onClick={() => setShowSongPicker(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/10 hover:border-white/20 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Song
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Song picker modal */}
      {showSongPicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0118] border border-white/10 rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <Search className="w-4 h-4 text-white/30" />
              <input
                type="text"
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                placeholder="Search songs..."
                autoFocus
                className="flex-1 bg-transparent text-white placeholder-white/30 focus:outline-none text-sm"
              />
              <button
                onClick={() => {
                  setShowSongPicker(false);
                  setSongSearch('');
                }}
                className="text-white/30 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {libraryLoading ? (
                <div className="text-sm text-white/30 py-8 text-center">Loading library...</div>
              ) : filteredSongs.length === 0 ? (
                <div className="text-sm text-white/20 py-8 text-center">No songs found</div>
              ) : (
                filteredSongs.map((song, idx) => {
                  const title = song.title ?? 'Untitled';
                  const artist = song.artist ?? '';
                  const segCount = song.segments?.length ?? 0;
                  return (
                    <button
                      key={`${title}::${artist}::${idx}`}
                      type="button"
                      onClick={() => addSong(song)}
                      className="w-full text-left rounded-xl hover:bg-white/10 px-3 py-2 transition-colors cursor-pointer"
                    >
                      <div className="text-sm text-white/90 font-medium truncate">{title}</div>
                      <div className="text-xs text-white/40 truncate">
                        {artist}
                        {song.bpm ? ` \u00B7 ${Math.round(song.bpm)} BPM` : ''}
                        {song.key ? ` \u00B7 ${song.key}` : ''}
                        {segCount > 0 ? ` \u00B7 ${segCount} segments` : ''}
                        {song.is_user_song ? ' \u00B7 Your upload' : ''}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
