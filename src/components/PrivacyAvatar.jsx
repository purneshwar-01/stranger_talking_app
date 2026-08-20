import { useEffect, useRef } from 'react';

/**
 * PrivacyAvatar
 * 
 * An audio-reactive, high-performance HTML5 Canvas 2D avatar overlay.
 * Replaces the black/placeholder video screens when a participant disables their camera.
 * 
 * Props:
 *   - user: The user profile object (contains username, avatar details, etc.)
 *   - stream: WebRTC MediaStream to analyze audio from
 *   - styleType: 'cyberpunk-bot' | 'neon-spirit' | 'anime-minimal'
 *   - isMini: Boolean, styles the layout for the small PIP container
 */
export default function PrivacyAvatar({ user, stream, styleType = 'neon-spirit', isMini = false }) {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamSourceRef = useRef(null);

  // Store avatar settings in a ref to avoid recreating the audio pipeline on change
  const styleTypeRef = useRef(styleType);
  useEffect(() => {
    styleTypeRef.current = styleType;
  }, [styleType]);

  // Set up Web Audio Analyser
  useEffect(() => {
    if (!stream) return;

    // Check if the stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let localAudioCtx = null;
    let sourceNode = null;
    let analyserNode = null;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      localAudioCtx = new AudioContextClass();
      audioContextRef.current = localAudioCtx;

      sourceNode = localAudioCtx.createMediaStreamSource(stream);
      streamSourceRef.current = sourceNode;

      analyserNode = localAudioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserRef.current = analyserNode;

      sourceNode.connect(analyserNode);
    } catch (err) {
      console.warn('Web Audio Context initialization blocked or failed:', err);
    }

    return () => {
      // Clean up audio nodes
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* ignore */ }
      }
      if (localAudioCtx && localAudioCtx.state !== 'closed') {
        localAudioCtx.close().catch(() => {});
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      streamSourceRef.current = null;
    };
  }, [stream]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.clientWidth;
    let height = canvas.height = canvas.clientHeight;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Audio-reactive parameters
    const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    // Procedural animation variables
    let frame = 0;
    let particles = [];
    let blinkTimer = 0;
    let isBlinking = false;

    // Initialize styling-specific particles
    for (let i = 0; i < (isMini ? 15 : 40); i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4 - 0.2, // Drift upwards slightly
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    const render = () => {
      frame++;
      
      // Calculate current speech volume level
      let volume = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length; // 0 to 255
      }

      // Smooth audio responsiveness level (0.0 to 1.0)
      const level = volume / 255;
      const pulse = 1 + level * 0.35; // Size factor
      const timeFactor = frame * 0.03;

      // Handle blinks for Anime Minimal character
      blinkTimer++;
      if (isBlinking) {
        if (blinkTimer > 10) {
          isBlinking = false;
          blinkTimer = 0;
        }
      } else if (blinkTimer > 200 && Math.random() < 0.01) {
        isBlinking = true;
        blinkTimer = 0;
      }

      // Clear Canvas with a subtle grid style background
      ctx.fillStyle = '#090d16'; // Deep space background
      ctx.fillRect(0, 0, width, height);

      // Draw particle system drifting in the background
      ctx.save();
      particles.forEach((p) => {
        p.x += p.vx * (1 + level * 3);
        p.y += p.vy * (1 + level * 3);

        // Wrap around bounds
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = height;

        ctx.fillStyle = styleTypeRef.current === 'cyberpunk-bot' 
          ? `rgba(0, 242, 254, ${p.alpha})` // Cyan
          : styleTypeRef.current === 'neon-spirit'
          ? `rgba(236, 72, 153, ${p.alpha})` // Pink
          : `rgba(99, 102, 241, ${p.alpha})`; // Indigo

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + level * 1.5), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = isMini ? Math.min(width, height) * 0.22 : Math.min(width, height) * 0.16;

      // ──────────────────────────────────────────────────────────────────
      // STYLE 1: NEON SPIRIT (Abstract soundwave plasma orb)
      // ──────────────────────────────────────────────────────────────────
      if (styleTypeRef.current === 'neon-spirit') {
        ctx.save();
        ctx.shadowBlur = isMini ? 12 : 28;

        // Draw outer pulsing glowing aura
        const gradientOuter = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 2.2 * pulse);
        gradientOuter.addColorStop(0, 'rgba(124, 58, 237, 0.25)'); // Indigo
        gradientOuter.addColorStop(0.5, 'rgba(236, 72, 153, 0.08)'); // Pink
        gradientOuter.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradientOuter;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 2.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Render overlapping organic plasma rings
        const drawPlasmaBlob = (points, sizeOffset, color, speedCoeff, waveScale) => {
          ctx.beginPath();
          const r = baseRadius * sizeOffset * (1 + level * 0.18);
          ctx.shadowColor = color;
          ctx.strokeStyle = color;
          ctx.lineWidth = isMini ? 1.5 : 3;

          for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            // Generate offset using time and volume
            const offset = Math.sin(angle * 4 + timeFactor * speedCoeff) * r * waveScale * (0.05 + level * 0.15);
            const x = cx + Math.cos(angle) * (r + offset);
            const y = cy + Math.sin(angle) * (r + offset);

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.closePath();
          ctx.stroke();
        };

        drawPlasmaBlob(48, 1.1, '#00f2fe', 1.0, 1.2);   // Cyan ring
        drawPlasmaBlob(36, 0.95, '#ec4899', -1.2, 1.5); // Pink ring
        drawPlasmaBlob(24, 0.8, '#8b5cf6', 0.8, 1.0);   // Violet ring

        // CenterCore
        ctx.shadowColor = '#ffffff';
        const innerGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius * 0.45);
        innerGrad.addColorStop(0, '#ffffff');
        innerGrad.addColorStop(0.4, 'rgba(236, 72, 153, 0.8)');
        innerGrad.addColorStop(1, 'rgba(124, 58, 237, 0)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // ──────────────────────────────────────────────────────────────────
      // STYLE 2: CYBERPUNK BOT (Robotic visor helmet)
      // ──────────────────────────────────────────────────────────────────
      else if (styleTypeRef.current === 'cyberpunk-bot') {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 1;

        // Draw grid overlay lines inside helmet orbit
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Draw crosshairs
        ctx.beginPath();
        ctx.moveTo(cx - baseRadius * 1.8, cy);
        ctx.lineTo(cx + baseRadius * 1.8, cy);
        ctx.moveTo(cx, cy - baseRadius * 1.8);
        ctx.lineTo(cx, cy + baseRadius * 1.8);
        ctx.stroke();

        // Draw main robot face shell (Hexagonal outline)
        ctx.beginPath();
        ctx.shadowBlur = isMini ? 8 : 16;
        ctx.shadowColor = '#00f2fe';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = isMini ? 2 : 3;

        const hw = baseRadius * 0.9;  // Half width
        const hh = baseRadius * 1.0;  // Half height
        ctx.moveTo(cx - hw * 0.7, cy - hh);
        ctx.lineTo(cx + hw * 0.7, cy - hh);
        ctx.lineTo(cx + hw, cy - hh * 0.3);
        ctx.lineTo(cx + hw * 0.8, cy + hh * 0.7);
        ctx.lineTo(cx, cy + hh * 1.2);
        ctx.lineTo(cx - hw * 0.8, cy + hh * 0.7);
        ctx.lineTo(cx - hw, cy - hh * 0.3);
        ctx.closePath();
        ctx.stroke();

        // Draw Visor (LED eyes area)
        ctx.fillStyle = '#061727';
        ctx.beginPath();
        ctx.moveTo(cx - hw * 0.8, cy - hh * 0.5);
        ctx.lineTo(cx + hw * 0.8, cy - hh * 0.5);
        ctx.lineTo(cx + hw * 0.9, cy - hh * 0.1);
        ctx.lineTo(cx - hw * 0.9, cy - hh * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pulsing Visor Light (audio reactive bar)
        ctx.shadowColor = '#00f2fe';
        ctx.fillStyle = '#00f2fe';
        const vW = hw * 1.4 * (0.3 + level * 0.7);
        const vH = isMini ? 3 : 5;
        ctx.fillRect(cx - vW / 2, cy - hh * 0.35, vW, vH);

        // Sound Reactive mouth grid
        ctx.strokeStyle = '#ff007f'; // Neon Pink mouth
        ctx.shadowColor = '#ff007f';
        ctx.lineWidth = 2;
        const barCount = isMini ? 5 : 7;
        const spacing = isMini ? 6 : 8;
        const totalW = (barCount - 1) * spacing;
        const startX = cx - totalW / 2;

        for (let i = 0; i < barCount; i++) {
          const x = startX + i * spacing;
          // Outer bars react less than center bars
          const centerFactor = 1 - Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2);
          const barH = (isMini ? 4 : 8) + (level * 35 * centerFactor);
          ctx.beginPath();
          ctx.moveTo(x, cy + hh * 0.45 - barH / 2);
          ctx.lineTo(x, cy + hh * 0.45 + barH / 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // ──────────────────────────────────────────────────────────────────
      // STYLE 3: ANIME MINIMAL (Chibi outline face with reactive mouth)
      // ──────────────────────────────────────────────────────────────────
      else if (styleTypeRef.current === 'anime-minimal') {
        ctx.save();
        ctx.shadowBlur = isMini ? 6 : 12;
        ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
        ctx.strokeStyle = '#6366f1'; // Indigo outline
        ctx.lineWidth = isMini ? 2 : 3;

        const scale = isMini ? 0.75 : 1;
        const r = baseRadius * scale;

        // Draw Face Chin Curve
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.9, cy - r * 0.4);
        ctx.bezierCurveTo(cx - r * 0.9, cy + r * 0.6, cx - r * 0.5, cy + r * 1.0, cx, cy + r * 1.1);
        ctx.bezierCurveTo(cx + r * 0.5, cy + r * 1.0, cx + r * 0.9, cy + r * 0.6, cx + r * 0.9, cy - r * 0.4);
        ctx.stroke();

        // Draw Eyes
        ctx.lineWidth = isMini ? 2 : 3;
        ctx.fillStyle = '#6366f1';

        const eyeDistance = r * 0.4;
        const eyeY = cy + r * 0.1;

        const drawEye = (x) => {
          ctx.beginPath();
          if (isBlinking) {
            // Closed eye line
            ctx.moveTo(x - 8 * scale, eyeY);
            ctx.lineTo(x + 8 * scale, eyeY);
            ctx.stroke();
          } else {
            // Open pupil
            ctx.arc(x, eyeY, 6 * scale, 0, Math.PI * 2);
            ctx.fill();
            // Eyebrow
            ctx.beginPath();
            ctx.arc(x, eyeY - 12 * scale, 8 * scale, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
          }
        };

        drawEye(cx - eyeDistance);
        drawEye(cx + eyeDistance);

        // Draw speaking mouth
        ctx.lineWidth = isMini ? 2 : 3;
        const mouthY = cy + r * 0.6;
        const baseMouthW = 10 * scale;
        const openHeight = level * 28 * scale;

        ctx.beginPath();
        if (level > 0.05) {
          // Open mouth ellipse
          ctx.ellipse(cx, mouthY, baseMouthW + level * 4, Math.max(3, openHeight), 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ff5b7f'; // Pink tongue/mouth inside
          ctx.fill();
          ctx.stroke();
        } else {
          // Closed smiling line
          ctx.arc(cx, mouthY - 4 * scale, 8 * scale, Math.PI * 0.1, Math.PI * 0.9);
          ctx.stroke();
        }

        // Draw Hair peaks
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.0, cy - r * 0.3);
        ctx.lineTo(cx - r * 0.5, cy - r * 1.1);
        ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
        ctx.lineTo(cx, cy - r * 1.3);
        ctx.lineTo(cx + r * 0.2, cy - r * 0.8);
        ctx.lineTo(cx + r * 0.5, cy - r * 1.1);
        ctx.lineTo(cx + r * 1.0, cy - r * 0.3);
        ctx.stroke();

        ctx.restore();
      }

      // Draw username tag under the avatar (except for mini avatars)
      if (!isMini) {
        ctx.save();
        ctx.font = `bold 13px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000000';
        ctx.fillText(
          (user?.username || 'Stranger') + (level > 0.1 ? ' 🎙️' : ''), 
          cx, 
          cy + baseRadius * 1.6
        );
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isMini]);

  return (
    <div className={`w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-950 ${isMini ? 'rounded-2xl' : ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
}
