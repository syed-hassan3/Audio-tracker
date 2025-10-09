"use client";
import { useState, useRef, useEffect } from "react";

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptPiece + " ";
            } else {
              interimTranscript += transcriptPiece;
            }
          }

          setTranscript((prev) => prev + finalTranscript);
        };

        recognitionRef.current.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          if (event.error !== "no-speech") {
            setError("Transcription error: " + event.error);
          }
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError("");
      setTranscript("");
      setAudioUrl(null);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log("Recognition already started or error:", e);
        }
      } else {
        setError("Speech recognition not supported on this device");
      }
    } catch (err) {
      setError("Error accessing microphone: " + err.message);
      console.error("Error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log("Recognition stop error:", e);
        }
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log("Recognition stop error:", e);
        }
      }

      const stream = mediaRecorderRef.current.stream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      audioChunksRef.current = [];
      setTranscript("");
      setAudioUrl(null);
      setError("");
    }
  };

  const downloadAudio = () => {
    if (audioUrl) {
      const a = document.createElement("a");
      a.href = audioUrl;
      a.download = `recording_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 text-center">
            🎙️ Audio Recorder
          </h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-4 mb-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-200 transform hover:scale-105 text-lg"
              >
                🎤 Start Recording
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  onClick={stopRecording}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-200 transform hover:scale-105 flex-1 sm:flex-initial"
                >
                  ⏹️ Stop Recording
                </button>
                <button
                  onClick={cancelRecording}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-200 transform hover:scale-105 flex-1 sm:flex-initial"
                >
                  ❌ Cancel Recording
                </button>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center gap-2 text-red-600 animate-pulse">
                <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                <span className="font-semibold">Recording in progress...</span>
              </div>
            )}
          </div>

          {audioUrl && (
            <div className="mb-6 bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">
                📼 Recording Preview
              </h2>
              <audio controls className="w-full mb-3" src={audioUrl}></audio>
              <button
                onClick={downloadAudio}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg shadow transition-all duration-200 w-full sm:w-auto"
              >
                💾 Download Recording
              </button>
            </div>
          )}

          {transcript && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:p-6 rounded-lg border-2 border-purple-200">
              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                📝 Transcription
              </h2>
              <div className="bg-white p-4 rounded-lg shadow-inner max-h-64 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {transcript || "Listening..."}
                </p>
              </div>
            </div>
          )}

          {!isRecording && !audioUrl && !transcript && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg">Click "Start Recording" to begin</p>
              <p className="text-sm mt-2">
                Works on mobile and desktop devices
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-lg shadow p-4 text-sm text-gray-600">
          <p className="font-semibold mb-2">📱 Note:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Allow microphone access when prompted</li>
            <li>Speech recognition works best with clear audio</li>
            <li>On iOS Safari, speech recognition may have limited support</li>
            <li>Recording format: WebM (widely supported)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
