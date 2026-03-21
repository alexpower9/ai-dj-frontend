import { useState, useCallback } from 'react';
import { Upload, Music, CheckCircle, XCircle, Loader, Lock } from 'lucide-react';

interface UploadStatus {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message?: string;
  artist?: string;
  title?: string;
  segmentCount?: number;
}

interface SongUploadProps {
  onUploadComplete?: (filename: string) => void;
  token: string | null;
}

export default function SongUpload({ onUploadComplete, token }: SongUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);

  // Validate and extract artist/title from filename
  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.endsWith('.wav') && !selectedFile.name.endsWith('.mp3')) {
      setUploadStatus({
        status: 'error',
        message: 'Only .wav and .mp3 files are supported',
      });
      return;
    }

    setFile(selectedFile);
    setUploadStatus({ status: 'idle' });

    // Extract artist and title from "Artist - Song Title.wav" format
    const nameWithoutExt = selectedFile.name.replace(/\.(wav|mp3)$/i, '');
    
    if (nameWithoutExt.includes(' - ')) {
      const [extractedArtist, extractedTitle] = nameWithoutExt.split(' - ', 1 + 1);
      setArtist(extractedArtist.trim());
      setTitle(extractedTitle.trim());
    } else {
      setArtist('');
      setTitle('');
      setUploadStatus({
        status: 'error',
        message: 'Please rename file to: "Artist - Song Title.wav"',
      });
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }, []);

  // Upload handler
  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({
        status: 'error',
        message: 'Please select a file',
      });
      return;
    }

    if (!artist || !title) {
      setUploadStatus({
        status: 'error',
        message: 'Invalid filename format. Use: "Artist - Song Title.wav"',
      });
      return;
    }

    setUploadStatus({ status: 'uploading' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/song', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const result = await response.json();

      setUploadStatus({
        status: 'success',
        message: result.message,
        artist: result.artist,
        title: result.title,
        segmentCount: result.segment_count,
      });

      if (onUploadComplete) {
        onUploadComplete(result.filename);
      }

      // Reset after 3 seconds
      setTimeout(() => {
        setFile(null);
        setArtist('');
        setTitle('');
        setUploadStatus({ status: 'idle' });
      }, 3000);
    } catch (error) {
      setUploadStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  };

  const isValidFormat = artist && title;

  // Guest / unauthenticated lock screen
  if (!token) {
    return (
      <div className="w-full max-w-2xl mx-auto p-8 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 flex flex-col items-center justify-center gap-4 text-center">
        <Lock className="w-12 h-12 text-slate-400" />
        <h2 className="text-2xl font-bold text-white">Sign In to Upload Songs</h2>
        <p className="text-slate-400 max-w-sm">
          Personal song uploads are tied to your account. Create an account or sign in to add your own songs to the DJ.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 relative">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <Music className="w-6 h-6" />
        Upload New Song
      </h2>

      {/* File drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-8 mb-4 text-center transition-all
          ${isDragging ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600 hover:border-gray-500'}
          ${file && isValidFormat ? 'bg-green-500/10 border-green-500' : ''}
          ${file && !isValidFormat ? 'bg-red-500/10 border-red-500' : ''}
        `}
      >
        <input
          type="file"
          id="file-upload"
          accept=".wav,.mp3"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          className="hidden"
        />

        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center gap-3"
        >
          <Upload
            className={`w-12 h-12 ${
              file && isValidFormat
                ? 'text-green-500'
                : file && !isValidFormat
                ? 'text-red-500'
                : 'text-gray-400'
            }`}
          />
          <div>
            {file ? (
              <>
                <p className={`font-medium ${isValidFormat ? 'text-green-400' : 'text-red-400'}`}>
                  {file.name}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {isValidFormat && (
                  <p className="text-green-400 text-sm mt-2">
                    ✓ {artist} - {title}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-gray-300 font-medium">
                  Drop your song here or click to browse
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Supports .wav and .mp3 files
                </p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Format instructions */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-blue-300 text-sm font-medium mb-2">
          📝 Required Filename Format:
        </p>
        <p className="text-blue-200 text-sm mb-2">
          <code className="bg-blue-900/50 px-2 py-1 rounded">Artist - Song Title.wav</code>
        </p>
        <p className="text-blue-300 text-xs">
          Examples:<br />
          ✓ "Coldplay - A Sky Full of Stars.wav"<br />
          ✓ "Avicii - Wake Me Up.wav"<br />
          ✗ "song.wav" (missing artist and title)
        </p>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || !isValidFormat || uploadStatus.status === 'uploading'}
        className="w-full py-3 bg-gradient-to-r from-primary-600 to-secondary-600 text-white font-semibold rounded-lg hover:from-primary-700 hover:to-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {uploadStatus.status === 'uploading' ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Uploading & Segmenting...
          </>
        ) : (
          <>
            <Upload className="w-5 h-5" />
            Upload & Segment
          </>
        )}
      </button>

      {/* Status messages */}
      {uploadStatus.status !== 'idle' && uploadStatus.message && (
        <div
          className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
            uploadStatus.status === 'success'
              ? 'bg-green-500/10 border border-green-500/50'
              : uploadStatus.status === 'error'
              ? 'bg-red-500/10 border border-red-500/50'
              : 'bg-blue-500/10 border border-blue-500/50'
          }`}
        >
          {uploadStatus.status === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : uploadStatus.status === 'error' ? (
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          ) : (
            <Loader className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
          )}

          <div className="flex-1">
            <p
              className={`font-medium ${
                uploadStatus.status === 'success'
                  ? 'text-green-400'
                  : uploadStatus.status === 'error'
                  ? 'text-red-400'
                  : 'text-blue-400'
              }`}
            >
              {uploadStatus.status === 'uploading' && 'Processing...'}
              {uploadStatus.status === 'success' && '✓ Success!'}
              {uploadStatus.status === 'error' && '✗ Upload Failed'}
            </p>
            <p className="text-gray-300 text-sm mt-1">{uploadStatus.message}</p>
            {uploadStatus.status === 'success' && uploadStatus.segmentCount && (
              <p className="text-gray-400 text-sm mt-1">
                Detected {uploadStatus.segmentCount} segments in {uploadStatus.title} by{' '}
                {uploadStatus.artist}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
        <p className="text-purple-300 text-sm">
          <strong>How it works:</strong> Your song will be analyzed by AI to detect intro,
          buildup, drop, cooloff, and outro sections. This takes 30-60 seconds.
        </p>
      </div>
    </div>
  );
}