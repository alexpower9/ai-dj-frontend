import { useState, useCallback } from "react";
import { Upload, Music, CheckCircle, XCircle, Loader } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface UploadStatus {
    status: "idle" | "uploading" | "success" | "error";
    message?: string;
    artist?: string;
    title?: string;
    segmentCount?: number;
}

interface SongUploadProps {
    onUploadComplete?: (filename: string) => void;
}

export default function SongUpload({ onUploadComplete }: SongUploadProps) {
    const { token } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [artist, setArtist] = useState("");
    const [title, setTitle] = useState("");
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
        status: "idle",
    });
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (selectedFile: File | null) => {
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith(".wav")) {
            setUploadStatus({
                status: "error",
                message: "Only .wav files are supported",
            });
            return;
        }

        setFile(selectedFile);
        setUploadStatus({ status: "idle" });
    };

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
        if (droppedFile) handleFileChange(droppedFile);
    }, []);

    const handleUpload = async () => {
        if (!file) {
            setUploadStatus({
                status: "error",
                message: "Please select a .wav file",
            });
            return;
        }
        if (!title.trim()) {
            setUploadStatus({
                status: "error",
                message: "Please enter a song title",
            });
            return;
        }
        if (!artist.trim()) {
            setUploadStatus({
                status: "error",
                message: "Please enter an artist name",
            });
            return;
        }

        setUploadStatus({ status: "uploading" });

        try {
            // Rename the file client-side to "Song-Title_Artist-Name.wav" (no spaces)
            const sanitize = (s: string) => s.trim().replace(/\s+/g, "-");
            const renamedFilename = `${sanitize(title)}_${sanitize(artist)}.wav`;
            const renamedFile = new File([file], renamedFilename, {
                type: file.type,
            });

            const formData = new FormData();
            formData.append("file", renamedFile);

            const response = await fetch("/api/upload/song", {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Upload failed");
            }

            const result = await response.json();

            setUploadStatus({
                status: "success",
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
                setArtist("");
                setTitle("");
                setUploadStatus({ status: "idle" });
            }, 3000);
        } catch (error) {
            setUploadStatus({
                status: "error",
                message:
                    error instanceof Error ? error.message : "Upload failed",
            });
        }
    };

    const isReady = file && title.trim() && artist.trim();

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 relative">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Music className="w-6 h-6" />
                Upload New Song
            </h2>

            {/* Song Title & Artist inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor="song-title"
                        className="text-sm font-medium text-gray-300"
                    >
                        Song Title <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="song-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Wake Me Up"
                        className="bg-gray-700/60 border border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm transition-colors"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor="song-artist"
                        className="text-sm font-medium text-gray-300"
                    >
                        Artist <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="song-artist"
                        type="text"
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder="e.g. Avicii"
                        className="bg-gray-700/60 border border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm transition-colors"
                    />
                </div>
            </div>

            {/* Filename preview */}
            {(title.trim() || artist.trim()) && (
                <div className="mb-4 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                    <span>
                        Will be saved as:{" "}
                        <span className="text-gray-200 font-mono">
                            {(title.trim() || "Song-Title").replace(
                                /\s+/g,
                                "-",
                            )}
                            _
                            {(artist.trim() || "Artist-Name").replace(
                                /\s+/g,
                                "-",
                            )}
                            .wav
                        </span>
                    </span>
                </div>
            )}

            {/* File drop zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all
          ${isDragging ? "border-primary-500 bg-primary-500/10" : "border-gray-600 hover:border-gray-500"}
          ${file ? "bg-green-500/10 border-green-500" : ""}
        `}
            >
                <input
                    type="file"
                    id="file-upload"
                    accept=".wav"
                    onChange={(e) =>
                        handleFileChange(e.target.files?.[0] || null)
                    }
                    className="hidden"
                />

                <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                >
                    <Upload
                        className={`w-12 h-12 ${file ? "text-green-500" : "text-gray-400"}`}
                    />
                    <div>
                        {file ? (
                            <>
                                <p className="font-medium text-green-400">
                                    {file.name}
                                </p>
                                <p className="text-gray-400 text-sm mt-1">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-300 font-medium">
                                    Drop your .wav file here or click to browse
                                </p>
                                <p className="text-gray-500 text-sm mt-1">
                                    Only .wav files are supported
                                </p>
                            </>
                        )}
                    </div>
                </label>
            </div>

            {/* Upload button */}
            <button
                onClick={handleUpload}
                disabled={!isReady || uploadStatus.status === "uploading"}
                className="w-full py-3 bg-gradient-to-r from-primary-600 to-secondary-600 text-white font-semibold rounded-lg hover:from-primary-700 hover:to-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
                {uploadStatus.status === "uploading" ? (
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
            {uploadStatus.status !== "idle" && uploadStatus.message && (
                <div
                    className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
                        uploadStatus.status === "success"
                            ? "bg-green-500/10 border border-green-500/50"
                            : uploadStatus.status === "error"
                              ? "bg-red-500/10 border border-red-500/50"
                              : "bg-blue-500/10 border border-blue-500/50"
                    }`}
                >
                    {uploadStatus.status === "success" ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : uploadStatus.status === "error" ? (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                        <Loader className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
                    )}

                    <div className="flex-1">
                        <p
                            className={`font-medium ${
                                uploadStatus.status === "success"
                                    ? "text-green-400"
                                    : uploadStatus.status === "error"
                                      ? "text-red-400"
                                      : "text-blue-400"
                            }`}
                        >
                            {uploadStatus.status === "uploading" &&
                                "Processing..."}
                            {uploadStatus.status === "success" && "✓ Success!"}
                            {uploadStatus.status === "error" &&
                                "✗ Upload Failed"}
                        </p>
                        <p className="text-gray-300 text-sm mt-1">
                            {uploadStatus.message}
                        </p>
                        {uploadStatus.status === "success" &&
                            uploadStatus.segmentCount && (
                                <p className="text-gray-400 text-sm mt-1">
                                    Detected {uploadStatus.segmentCount}{" "}
                                    segments in {uploadStatus.title} by{" "}
                                    {uploadStatus.artist}
                                </p>
                            )}
                    </div>
                </div>
            )}

            {/* Info box */}
            <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <p className="text-purple-300 text-sm">
                    <strong>How it works:</strong> Your song will be analyzed by
                    AI to detect intro, buildup, drop, cooloff, and outro
                    sections. This takes 30-60 seconds.
                </p>
            </div>
        </div>
    );
}

