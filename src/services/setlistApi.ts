export interface SetlistItem {
  song_key: string;
  song_title: string;
  song_artist: string;
  transition_exit_segment: string | null;
  transition_entry_segment: string | null;
}

export interface Setlist {
  id: number;
  name: string;
  item_count: number;
  items?: SetlistItem[];
  created_at: string;
  updated_at: string;
}

export interface SetlistCreate {
  name: string;
  items: SetlistItem[];
}

export interface SetlistUpdate {
  name?: string;
  items?: SetlistItem[];
}

const BASE = '/api/setlists';

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchSetlists(token: string): Promise<Setlist[]> {
  const res = await fetch(BASE, { headers: headers(token) });
  if (!res.ok) throw new Error(`Failed to fetch setlists: ${res.status}`);
  return res.json();
}

export async function fetchSetlist(token: string, id: number): Promise<Setlist> {
  const res = await fetch(`${BASE}/${id}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Failed to fetch setlist: ${res.status}`);
  return res.json();
}

export async function createSetlist(token: string, data: SetlistCreate): Promise<Setlist> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create setlist: ${res.status}`);
  }
  return res.json();
}

export async function updateSetlist(token: string, id: number, data: SetlistUpdate): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update setlist: ${res.status}`);
  }
}

export async function deleteSetlist(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Failed to delete setlist: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------
export interface TransitionRecommendation {
  exit_segment: string;
  entry_segment: string;
  score: number;
  rank: number;
}

export async function getBestTransition(
  token: string,
  songAKey: string,
  songBKey: string,
): Promise<{ best: TransitionRecommendation; alternatives: TransitionRecommendation[] }> {
  const res = await fetch(`${BASE}/best-transition`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ song_a_key: songAKey, song_b_key: songBKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to get best transition: ${res.status}`);
  }
  return res.json();
}

export async function getBestTransitionsBulk(
  token: string,
  songKeys: string[],
): Promise<{ transitions: Array<{ song_a_key: string; song_b_key: string; best?: TransitionRecommendation; error?: string }> }> {
  const res = await fetch(`${BASE}/best-transitions-bulk`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ song_keys: songKeys }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to get bulk transitions: ${res.status}`);
  }
  return res.json();
}

export async function getTransitionPreview(
  token: string,
  songAKey: string,
  songBKey: string,
  exitSegment?: string | null,
  entrySegment?: string | null,
): Promise<{ audioBuffer: ArrayBuffer; sampleRate: number }> {
  const res = await fetch(`${BASE}/preview-transition`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      song_a_key: songAKey,
      song_b_key: songBKey,
      exit_segment: exitSegment ?? null,
      entry_segment: entrySegment ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to generate preview: ${res.status}`);
  }
  const sampleRate = parseInt(res.headers.get('X-Sample-Rate') || '44100', 10);
  const audioBuffer = await res.arrayBuffer();
  return { audioBuffer, sampleRate };
}
