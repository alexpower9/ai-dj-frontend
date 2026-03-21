import { useEffect, useRef } from 'react';

interface WaveformProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export default function Waveform({ analyserNode, isPlaying }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;

    // Create gradient for the waveform
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#8b5cf6');    // Purple
    gradient.addColorStop(0.5, '#3b82f6');  // Blue
    gradient.addColorStop(1, '#00f5ff');    // Cyan

    // For idle animation when not playing
    let idlePhase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Always reset shadow state at the start of each frame
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      if (analyserNode && isPlaying) {
        // Get frequency data — skip bin 0 (DC offset, always near-max and static)
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserNode.getByteFrequencyData(dataArray);

        // Use a fixed bar count that fills the canvas evenly
        const numBars = 80;
        const startBin = 1; // skip DC offset
        const endBin = Math.floor(bufferLength * 0.75); // skip ultra-high freq noise
        const binStep = (endBin - startBin) / numBars;
        const gap = 3;
        const barWidth = (width - gap * (numBars - 1)) / numBars;
        const roundedRadius = Math.min(barWidth / 2, 4);

        // Apply glow before drawing so it renders on the bars
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#8b5cf6';
        ctx.fillStyle = gradient;

        for (let i = 0; i < numBars; i++) {
          const bin = Math.floor(startBin + i * binStep);
          // Cap bar height so bars never touch the canvas edges
          const barHeight = (dataArray[bin] / 255) * (height * 0.75);
          const x = i * (barWidth + gap);

          // Top half (going up from center)
          ctx.beginPath();
          ctx.roundRect(x, centerY - barHeight / 2, barWidth, barHeight / 2, [roundedRadius, roundedRadius, 0, 0]);
          ctx.fill();

          // Bottom half (going down from center, mirrored)
          ctx.beginPath();
          ctx.roundRect(x, centerY, barWidth, barHeight / 2, [0, 0, roundedRadius, roundedRadius]);
          ctx.fill();
        }

        // Reset shadow after drawing to avoid bleeding into next frame
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        // Idle animation - subtle wave
        idlePhase += 0.02;
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#8b5cf6';

        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const frequency = 0.02;
          const amplitude = 8 + Math.sin(idlePhase * 0.5) * 4;
          const y = centerY + Math.sin(x * frequency + idlePhase) * amplitude;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserNode, isPlaying]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32 rounded-xl"
      style={{ 
        width: '100%', 
        height: '128px',
        background: 'transparent'
      }}
    />
  );
}
