// src/components/QueuePanel.tsx
import { useState } from 'react';
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
import { GripVertical, X } from 'lucide-react';
import type { TrackInfo as TrackInfoType } from '../services/audioStream';

type Props = {
  currentTrack: TrackInfoType | null;
  previousTrack: TrackInfoType | null;
  upNext: TrackInfoType[];
  onReorder: (newOrder: number[]) => void;
  onRemove: (index: number) => void;
};

function formatTitle(raw: string | undefined): string {
  if (!raw) return '';
  const isAllCaps = raw === raw.toUpperCase();
  if (!isAllCaps) return raw;

  return raw
    .toLowerCase()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function SortableQueueItem({ id, track, index, onRemove }: { id: string; track: TrackInfoType; index: number; onRemove: (index: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 group ${
        isDragging ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5'
      }`}
    >
      <button
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-100 leading-snug truncate">
          {formatTitle(track.title)}
        </p>
        <p className="text-[11px] text-slate-400 truncate">
          {formatTitle(track.artist)}
        </p>
      </div>
      <button
        onClick={() => onRemove(index)}
        className="flex-shrink-0 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Remove from queue"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default function QueuePanel({ currentTrack, previousTrack, upNext, onReorder, onRemove }: Props) {
  const [localUpNext, setLocalUpNext] = useState<TrackInfoType[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Use localUpNext during drag, otherwise use prop
  const displayList = isDragging ? localUpNext : upNext;

  // Generate stable IDs based on index (queue items don't have unique IDs)
  const itemIds = displayList.map((_, i) => `queue-item-${i}`);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart() {
    setLocalUpNext([...upNext]);
    setIsDragging(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = itemIds.indexOf(active.id as string);
    const newIndex = itemIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    // Compute the new order as original indices
    const currentOrder = localUpNext.map((_, i) => i);
    const reordered = arrayMove(currentOrder, oldIndex, newIndex);

    // Optimistically update local state
    setLocalUpNext(arrayMove(localUpNext, oldIndex, newIndex));

    onReorder(reordered);
  }

  if (!currentTrack && !previousTrack && upNext.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface/70 border border-white/8 shadow-lg shadow-black/40 px-5 py-4 text-xs text-slate-300">
      {/* Header */}
      <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 mb-2">
        Queue
      </p>

      <div className="space-y-3">
        {/* Previous */}
        {previousTrack && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Previous
            </p>
            <p className="text-sm font-semibold text-slate-100 leading-snug">
              {formatTitle(previousTrack.title)}
            </p>
            <p className="text-[11px] text-slate-400">
              {formatTitle(previousTrack.artist)}
            </p>
          </div>
        )}

        {/* Current */}
        {currentTrack && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Now Playing
            </p>
            <p className="text-sm font-semibold text-slate-100 leading-snug">
              {formatTitle(currentTrack.title)}
            </p>
            <p className="text-[11px] text-slate-400">
              {formatTitle(currentTrack.artist)}
            </p>
          </div>
        )}

        {/* Up next — draggable list */}
        {displayList.length > 0 && (
          <div className="pt-1 border-t border-white/5 mt-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1.5">
              Up Next
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-0.5">
                  {displayList.map((track, i) => (
                    <SortableQueueItem
                      key={itemIds[i]}
                      id={itemIds[i]}
                      track={track}
                      index={i}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
