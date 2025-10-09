"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------------------------------------------------------
   Lazy singleton loader for in-browser Whisper (no backend)
   --------------------------------------------------------- */
let __asrPromise = null;
async function getASRPipeline() {
  if (!__asrPromise) {
    __asrPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Optional: leave models on CDN
      env.allowLocalModels = false;
      // Use a tiny English model for speed on phones
      return pipeline(
        "automatic-speech-transcription",
        "Xenova/whisper-tiny.en",
        { quantized: true }
      );
    })();
  }
  return __asrPromise;
}

/* ---------------------------------------------------------
   Audio utils: Blob -> mono Float32 @16kHz for Whisper
   --------------------------------------------------------- */
async function blobToMono16kFloat32(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const decoded = await audioCtx.decodeAudioData(arrayBuf);

  const numChannels = decoded.numberOfChannels;
  const length = decoded.length;

  // Mixdown to mono by averaging channels
  let mono = new Float32Array(length);
  if (numChannels === 1) {
    mono.set(decoded.getChannelData(0));
  } else {
    const accum = new Float32Array(length);
    for (let c = 0; c < numChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) accum[i] += ch[i];
    }
    for (let i = 0; i < length; i++) mono[i] = accum[i] / numChannels;
  }

  // Linear resample to 16k (Whisper’s expected rate)
  const srcRate = decoded.sampleRate;
  const targetRate = 16000;
  if (srcRate === targetRate) return mono;

  const duration = decoded.duration; // seconds
  const targetLength = Math.max(1, Math.round(duration * targetRate));
  const resampled = new Float32Array(targetLength);
  const ratio = srcRate / targetRate;
  for (let i = 0; i < targetLength; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const t = src - i0;
    resampled[i] = (1 - t) * mono[i0] + t * mono[i1];
  }
  return resampled;
}

/* =========================================================
   Component
   ========================================================= */
export default function AudioRecorder() {
  // "idle" | "recording" | "recorded"
  const [recState, setRecState] = useState("idle");
  const recStateRef = useRef(recState);
  useEffect(() => {
    recStateRef.current = recState;
  }, [recState]);

  const [error, setError] = useState(null);

  // MediaRecorder bits
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioUrl, setAudioUrl] = useState(null);

  // Timer
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  // Transcript
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Web Speech API live STT (desktop)
  const [isSttSupported, sttCtor] = useMemo(() => {
    if (typeof window === "undefined") return [false, null];
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return [Boolean(SR), SR || null];
  }, []);
  const recognitionRef = useRef(null);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      stopTimer();
      stopSpeechRecognition();
      stopMediaRecorder();
    };
  }, [audioUrl]);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // -------- On-device transcription (no env, no server) --------
  async function transcribeInBrowser(blob) {
    try {
      setIsTranscribing(true);
      const audioF32 = await blobToMono16kFloat32(blob);
      const asr = await getASRPipeline();
      const res = await asr(audioF32, {
        chunk_length_s: 20,
        stride_length_s: 5,
        return_timestamps: false,
      });
      setTranscript((res && res.text ? res.text : "").trim());
    } catch (err) {
      console.error("ASR (browser) error:", err);
      setError(err && err.message ? err.message : "On-device transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  }

  async function onStart() {
    setError(null);
    setTranscript("");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        // Stop mic tracks
        stream.getTracks().forEach((t) => t.stop());

        // Use native MIME from chunks (iOS = audio/mp4, Chrome = audio/webm)
        const mime = (chunksRef.current[0] && chunksRef.current[0].type) || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });

        const url = URL.createObjectURL(blob);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });

        setRecState("recorded");
        stopTimer();
        stopSpeechRecognition();

        // Fallback to on-device Whisper on mobile / unsupported / empty transcript
        const needsLocal = !isSttSupported || isIOS || !transcript.trim();
        if (needsLocal) {
          // fire & forget; UI shows "Transcribing…"
          transcribeInBrowser(blob);
        }
      };

      mr.start();
      setRecState("recording");
      startTimer();

      // Live STT (desktop & some Android)
      if (isSttSupported && sttCtor) {
        const recognition = new sttCtor();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              setTranscript((prev) => (prev + " " + res[0].transcript).trim());
            } else {
              interim += res[0].transcript;
            }
          }
          if (interim) setTranscript((prev) => (prev + " " + interim).trim());
        };

        recognition.onerror = (e) => {
          console.warn("SpeechRecognition error:", e);
        };

        // Mobile Chrome often ends after ~10s; restart if still recording
        recognition.onend = () => {
          if (recStateRef.current === "recording") {
            try {
              recognition.start();
            } catch {}
          }
        };

        try {
          recognition.start();
        } catch (e) {
          console.warn("SpeechRecognition start failed", e);
        }
      }
    } catch (e) {
      console.error(e);
      setError(
        e && e.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Could not start recording."
      );
      setRecState("idle");
      stopSpeechRecognition();
      stopMediaRecorder();
      stopTimer();
    }
  }

  function stopSpeechRecognition() {
    try {
      if (recognitionRef.current && recognitionRef.current.stop) {
        recognitionRef.current.stop();
      }
      recognitionRef.current = null;
    } catch {}
  }

  function stopMediaRecorder() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
  }

  function onStop() {
    stopMediaRecorder();
    // mr.onstop finalizes the blob/url & updates state
  }

  function onCancel() {
    stopSpeechRecognition();
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setTranscript("");
    setRecState("idle");
    stopTimer();
  }

  function prettyTime(total) {
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = Math.floor(total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <div className="w-full max-w-xl mx-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Audio Recorder</h2>
        <span className="text-sm tabular-nums text-gray-500">
          {recState === "recording" ? prettyTime(seconds) : null}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        {recState === "idle" && (
          <IconButton label="Start Recording" onClick={onStart} variant="primary">
            <MicIcon />
          </IconButton>
        )}

        {recState === "recording" && (
          <>
            <IconButton label="Stop" onClick={onStop} variant="danger">
              <StopIcon />
            </IconButton>
            <IconButton label="Cancel" onClick={onCancel} variant="ghost">
              <CancelIcon />
            </IconButton>
          </>
        )}

        {recState === "recorded" && (
          <IconButton
            label="Record Again"
            onClick={() => {
              onCancel();
              onStart();
            }}
            variant="primary"
          >
            <MicIcon />
          </IconButton>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Playback + Transcript */}
      {recState === "recorded" && (
        <div className="space-y-4">
          {audioUrl && (
            <div className="rounded-2xl border border-gray-200 p-3 shadow-sm">
              <audio src={audioUrl} controls className="w-full" />
              <div className="mt-2 text-xs text-gray-500">
                Format: unknown • Size: unknown
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Transcript</h3>
              {!isSttSupported && (
                <span className="text-xs text-amber-600">
                  Live STT not supported; using on-device transcription.
                </span>
              )}
            </div>
            <textarea
              className="w-full min-h-[120px] resize-y rounded-xl border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                isTranscribing
                  ? "Transcribing on device…"
                  : isSttSupported
                  ? "Your speech will appear here…"
                  : "Your speech will appear here after processing…"
              }
            />
            {isTranscribing && (
              <p className="text-xs text-gray-500 mt-2">Transcribing on device…</p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Stored in component state. Lift to global store if needed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   UI primitives (icon button + inline SVG icons)
   ========================================================= */
function IconButton({ children, onClick, label, variant = "primary" }) {
  const classes =
    variant === "primary"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
      : variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : "bg-white hover:bg-gray-50 border border-gray-300 text-gray-700";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${classes}`}
    >
      {children}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M5 11a1 1 0 1 0-2 0 9 9 0 0 0 8 8v3a1 1 0 1 0 2 0v-3a9 9 0 0 0 8-8 1 1 0 1 0-2 0 7 7 0 0 1-14 0Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M6.225 4.811A10 10 0 1 1 4.81 6.225l1.415-1.414Zm2.828 2.829 7.071 7.07-1.414 1.415-7.071-7.07 1.414-1.415Z" />
    </svg>
  );
}
