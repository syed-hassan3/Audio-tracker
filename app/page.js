// import { AnimatedCardBackgroundHover } from "@/components/reusable/AnimatedBG";
// import { DemoBackgroundPaths } from "@/components/reusable/PathsBackground";
// import { CursorDemo } from "@/components/reusable/SplashCursor";
// import Image from "next/image";

// export default function Home() {
//   return (
//     <>
//       <CursorDemo />
//       {/* <DemoBackgroundPaths /> */}
//       {/* <AnimatedCardBackgroundHover /> */}
//     </>
//   );
// }
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * AudioRecorder
 * - Idle state → shows a circular Record button
 * - Recording state → shows Stop and Cancel buttons
 * - After Stop → shows audio player + transcript text (from the Web Speech API)
 * - Cancel → discards recording & transcript
 *
 * Works in modern Chromium/Edge. Safari/Firefox may not support SpeechRecognition;
 * in that case, recording still works but transcript shows a fallback message.
 */
export default function AudioRecorder() {
  // type RecState = "idle" | "recording" | "recorded";

  const [recState, setRecState] = useState("idle");
  const [error, setError] = useState(null);

  // MediaRecorder bits
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioUrl, setAudioUrl] = useState(null);

  // Timer for UX
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  // Speech-to-text via Web Speech API
  const [transcript, setTranscript] = useState("");
  const [isSttSupported, sttCtor] = useMemo(() => {
    if (typeof window === "undefined") return [false, null];
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // isSttSupported is a boolean now; sttCtor is the constructor or null
    return [Boolean(SR), SR || null];
  }, []);

  const recognitionRef = useRef(null);

  // Clean up object URLs on unmount or when changing recordings
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

  async function onStart() {
    setError(null);
    setTranscript("");
    chunksRef.current = [];

    try {
      // Request mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up MediaRecorder
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setRecState("recorded");
        stopTimer();
        stopSpeechRecognition();
      };

      mr.start();
      setRecState("recording");
      startTimer();

      // Start speech recognition if available
      if (isSttSupported && sttCtor) {
        const recognition = new sttCtor();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US"; // You can make this prop-driven

        let finalText = "";
        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalText += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }
          setTranscript((finalText + " " + interim).trim());
        };
        recognition.onerror = (e) => {
          console.warn("SpeechRecognition error:", e);
        };
        recognition.onend = () => {
          // It may end unexpectedly; keep UX simple and do nothing.
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
        e?.name === "NotAllowedError"
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
      recognitionRef.current?.stop?.();
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
    // onstop handler will finalize blob/url & change state
  }

  function onCancel() {
    // Discard the recording and transcript
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
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const s = Math.floor(total % 60)
      .toString()
      .padStart(2, "0");
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
          <IconButton
            label="Start Recording"
            onClick={onStart}
            variant="primary"
          >
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
                Format: webm • Size:{" "}
                {/** size not known without reading blob again */} unknown
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Transcript</h3>
              {!isSttSupported && (
                <span className="text-xs text-amber-600">
                  Speech-to-text not supported in this browser.
                </span>
              )}
            </div>
            <textarea
              className="w-full min-h-[120px] resize-y rounded-xl border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                isSttSupported
                  ? "Your speech will appear here…"
                  : "Type notes here…"
              }
            />
            <p className="text-xs text-gray-500 mt-2">
              Stored in component state. Lift to global store if needed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————
// UI primitives (icon button + inline SVG icons)
// ————————————————————————————————————————————————————————
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M5 11a1 1 0 1 0-2 0 9 9 0 0 0 8 8v3a1 1 0 1 0 2 0v-3a9 9 0 0 0 8-8 1 1 0 1 0-2 0 7 7 0 0 1-14 0Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M6.225 4.811A10 10 0 1 1 4.81 6.225l1.415-1.414Zm2.828 2.829 7.071 7.07-1.414 1.415-7.071-7.07 1.414-1.415Z" />
    </svg>
  );
}
