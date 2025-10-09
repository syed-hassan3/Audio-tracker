"use client";
import { useState, useRef, useEffect } from "react";

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    // Check if we're on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Initialize speech recognition for desktop only
    if (typeof window !== "undefined" && !isMobile) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event) => {
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptPiece + " ";
            }
          }

          if (finalTranscript) {
            setTranscript((prev) => prev + finalTranscript);
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError("");
      setTranscript("");
      setAudioUrl(null);
      setRecordingTime(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;

      // Use different MIME types based on browser support
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        // Transcribe audio for mobile devices
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile && audioBlob.size > 0) {
          await transcribeAudioForMobile(audioBlob);
        }
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start speech recognition for desktop
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (recognitionRef.current && !isMobile) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log("Recognition error:", e);
        }
      }
    } catch (err) {
      setError(
        "Error accessing microphone. Please allow microphone access and try again."
      );
      console.error("Error:", err);
    }
  };

  const transcribeAudioForMobile = async (audioBlob) => {
    setIsTranscribing(true);

    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        try {
          // Use Web Speech API with audio element as fallback
          const audio = new Audio(URL.createObjectURL(audioBlob));

          // Create a simple transcription message
          const duration = Math.floor(recordingTime);
          const transcriptionText = `[Recording completed - ${duration} seconds]\n\nNote: For accurate transcription on mobile devices, please use the desktop version or integrate with a transcription service like OpenAI Whisper, Google Cloud Speech-to-Text, or AssemblyAI.\n\nYour audio has been recorded successfully and can be played back or downloaded.`;

          setTranscript(transcriptionText);
          setIsTranscribing(false);
        } catch (error) {
          console.error("Transcription error:", error);
          setTranscript(
            "[Recording completed]\n\nTranscription is not available on this device. Please use the desktop version for real-time transcription, or integrate with a cloud transcription service."
          );
          setIsTranscribing(false);
        }
      };
    } catch (error) {
      console.error("Error in transcription:", error);
      setTranscript(
        "[Recording completed]\n\nTranscription service unavailable."
      );
      setIsTranscribing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      audioChunksRef.current = [];
      setTranscript("");
      setAudioUrl(null);
      setError("");
      setRecordingTime(0);
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 text-center">
            🎙️ Audio Recorder
          </h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-4 mb-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-200 text-lg w-full sm:w-auto"
              >
                🎤 Start your Recording
              </button>
            ) : (
              <>
                <div className="text-center mb-2">
                  <div className="text-3xl font-bold text-red-600 mb-2">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-red-600">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="font-semibold text-sm">Recording...</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={stopRecording}
                    className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 px-6 rounded-full shadow-lg transition-all duration-200 flex-1"
                  >
                    ⏹️ Stop Recording
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold py-4 px-6 rounded-full shadow-lg transition-all duration-200 flex-1"
                  >
                    ❌ Cancel
                  </button>
                </div>
              </>
            )}
          </div>

          {audioUrl && (
            <div className="mb-6 bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">
                📼 Your Recording
              </h2>
              <audio controls className="w-full mb-3" src={audioUrl}></audio>
              <button
                onClick={downloadAudio}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3 px-6 rounded-lg shadow transition-all duration-200 w-full"
              >
                💾 Download Recording
              </button>
            </div>
          )}

          {isTranscribing && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600"></div>
                <span className="text-yellow-800 font-medium">
                  Processing transcription...
                </span>
              </div>
            </div>
          )}

          {transcript && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-lg border-2 border-purple-200">
              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                📝 Transcription
              </h2>
              <div className="bg-white p-4 rounded-lg shadow-inner max-h-64 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                  {transcript}
                </p>
              </div>
            </div>
          )}

          {!isRecording && !audioUrl && !transcript && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg mb-2">Click "Start Recording" to begin</p>
              <p className="text-sm">📱 Works on all devices</p>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-lg shadow p-4 text-xs sm:text-sm text-gray-600">
          <p className="font-semibold mb-2">ℹ️ Important Notes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Allow microphone access when prompted</li>
            <li>Real-time transcription works on desktop browsers</li>
            <li>
              On mobile: Recording works perfectly, transcription requires cloud
              service integration
            </li>
            <li>
              For production: Integrate OpenAI Whisper, Google Speech-to-Text,
              or AssemblyAI
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
