"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Download,
  FileText,
  Loader2,
  Clock,
  AlertCircle,
  CrossIcon,
  XIcon,
} from "lucide-react";

export default function MeetingRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [language, setLanguage] = useState("en-US");
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const handleClear = () => {
    setIsRecording(false);
    setTranscript("");
    setSummary("");
    setIsGeneratingSummary(false);
    setRecordingTime(0);
    setError("");
  };
  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language;

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

        if (finalTranscript) {
          setTranscript((prev) => prev + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "no-speech") {
          return;
        }
        setError(`Speech recognition error: ${event.error}`);
      };
    } else {
      setError(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [language]);

  const startRecording = () => {
    setTranscript("");
    setSummary("");
    setRecordingTime(0);
    setError("");
    setIsRecording(true);

    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
      recognitionRef.current.start();
    }

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const generateSummary = async () => {
    if (!transcript.trim()) {
      setError("No transcript available to summarize!");
      return;
    }

    if (transcript.split(" ").length < 30) {
      setError(
        "Transcript is too short. Please record a longer meeting for better summarization."
      );
      return;
    }

    setIsGeneratingSummary(true);
    setError("");

    try {
      // Using intelligent text extraction algorithm
      const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];

      // Extract key information
      const wordFrequency = {};
      const words = transcript.toLowerCase().split(/\s+/);
      const stopWords = new Set([
        "the",
        "is",
        "at",
        "which",
        "on",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "with",
        "to",
        "for",
        "of",
        "as",
        "by",
        "that",
        "this",
        "it",
        "from",
        "be",
        "are",
        "was",
        "were",
        "been",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "can",
      ]);

      words.forEach((word) => {
        const cleaned = word.replace(/[^\w]/g, "");
        if (cleaned.length > 3 && !stopWords.has(cleaned)) {
          wordFrequency[cleaned] = (wordFrequency[cleaned] || 0) + 1;
        }
      });

      // Score sentences based on word frequency
      const sentenceScores = sentences.map((sentence) => {
        const sentenceWords = sentence.toLowerCase().split(/\s+/);
        let score = 0;
        sentenceWords.forEach((word) => {
          const cleaned = word.replace(/[^\w]/g, "");
          if (wordFrequency[cleaned]) {
            score += wordFrequency[cleaned];
          }
        });
        return { sentence: sentence.trim(), score };
      });

      // Sort by score and take top sentences
      const topSentences = sentenceScores
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(5, Math.ceil(sentences.length * 0.3)))
        .map((s) => s.sentence);

      // Extract key topics (most frequent words)
      const keyTopics = Object.entries(wordFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);

      // Detect action items (sentences with action words)
      const actionWords = [
        "will",
        "should",
        "need",
        "must",
        "have to",
        "going to",
        "plan to",
        "decide",
        "agree",
      ];
      const actionItems = sentences
        .filter((s) =>
          actionWords.some((action) => s.toLowerCase().includes(action))
        )
        .slice(0, 3);

      // Detect decisions (sentences with decision words)
      const decisionWords = [
        "decided",
        "agreed",
        "concluded",
        "confirmed",
        "approved",
        "determined",
      ];
      const decisions = sentences
        .filter((s) =>
          decisionWords.some((decision) => s.toLowerCase().includes(decision))
        )
        .slice(0, 3);

      const formattedSummary = `
📋 MEETING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 KEY TOPICS DISCUSSED:
${keyTopics
  .map((topic) => `• ${topic.charAt(0).toUpperCase() + topic.slice(1)}`)
  .join("\n")}

💡 MAIN DISCUSSION POINTS:
${topSentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${
  decisions.length > 0
    ? `\n✅ DECISIONS MADE:\n${decisions
        .map((d, i) => `${i + 1}. ${d}`)
        .join("\n")}`
    : ""
}

${
  actionItems.length > 0
    ? `\n🎯 ACTION ITEMS:\n${actionItems
        .map((a, i) => `${i + 1}. ${a}`)
        .join("\n")}`
    : ""
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ Meeting Duration: ${formatTime(recordingTime)}
📝 Total Words: ${transcript.split(" ").length} words
📊 Sentences: ${sentences.length}
🎯 Summary Generated: ${new Date().toLocaleString()}
      `.trim();

      setSummary(formattedSummary);
    } catch (error) {
      console.error("Error generating summary:", error);
      setError("Failed to generate summary. Please try again.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const downloadTXT = () => {
    const content = `
MEETING TRANSCRIPT & SUMMARY
═══════════════════════════════════════════════════════════

Meeting Date: ${new Date().toLocaleString()}
Duration: ${formatTime(recordingTime)}
Language: ${language === "en-US" ? "English" : "Urdu"}

${
  summary
    ? "═══════════════════════════════════════════════════════════\nAI-GENERATED SUMMARY\n═══════════════════════════════════════════════════════════\n\n" +
      summary +
      "\n\n"
    : ""
}═══════════════════════════════════════════════════════════
FULL TRANSCRIPT
═══════════════════════════════════════════════════════════

${transcript}

═══════════════════════════════════════════════════════════
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDOC = () => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Meeting Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
    h2 { color: #1e40af; margin-top: 30px; }
    .meta { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .summary { background: #dbeafe; padding: 20px; border-radius: 5px; border-left: 4px solid #2563eb; }
    .transcript { background: #f9fafb; padding: 20px; border-radius: 5px; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <h1>📋 Meeting Transcript & Summary</h1>
  
  <div class="meta">
    <p><strong>📅 Meeting Date:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>⏱️ Duration:</strong> ${formatTime(recordingTime)}</p>
    <p><strong>🌐 Language:</strong> ${
      language === "en-US" ? "English" : "Urdu"
    }</p>
    <p><strong>📊 Word Count:</strong> ${transcript.split(" ").length} words</p>
  </div>
  
  ${
    summary
      ? '<h2>✨ AI-Generated Summary</h2><div class="summary"><pre>' +
        summary +
        "</pre></div>"
      : ""
  }
  
  <h2>📝 Full Transcript</h2>
  <div class="transcript">
    <pre>${transcript}</pre>
  </div>
  
  <hr style="margin-top: 40px; border: none; border-top: 1px solid #e5e7eb;">
  <p style="text-align: center; color: #6b7280; font-size: 12px;">Generated by AI Meeting Recorder</p>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], {
      type: "application/msword",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl md:p-8 p-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              AI Meeting Recorder
            </h1>
            {/* <p className="text-gray-600">
              100% Free • Record, transcribe, and summarize your meetings
              instantly
            </p> */}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle
                className="text-red-500 flex-shrink-0 mt-0.5"
                size={20}
              />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Language Selection */}
          <div className="mb-6 flex justify-center">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isRecording}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
            >
              <option value="en-US">🇬🇧 English</option>
              <option value="ur-PK">🇵🇰 Urdu</option>
            </select>
          </div>

          {/* Recording Controls */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-full p-10 shadow-2xl transform transition hover:scale-105 active:scale-95"
                  title="Start Recording"
                >
                  <Mic size={56} />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white rounded-full p-10 shadow-2xl transform transition hover:scale-105 active:scale-95 animate-pulse"
                  title="Stop Recording"
                >
                  <Square size={56} />
                </button>
              )}
            </div>

            {isRecording && (
              <div className="flex items-center gap-3 text-red-500 font-bold text-2xl bg-red-50 px-6 py-3 rounded-full">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <Clock size={28} />
                <span>{formatTime(recordingTime)}</span>
              </div>
            )}

            <p className="text-gray-600 mt-4 text-lg font-medium">
              {isRecording
                ? "🎙️ Recording in progress..."
                : "👆 Click to start recording"}
            </p>
          </div>

          {/* Transcript Section */}

          {transcript && (
            <div className="mb-6">
              <div className="flex flex-col md:flex-row justify-between items-center mb-3">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  📝 Transcript
                  <span className="text-sm font-normal text-gray-500">
                    ({transcript.split(" ").length} words)
                  </span>
                </h2>
                <div className="flex flex-col md:flex-row gap-5 max-md:mt-8">
                  <button
                    onClick={handleClear}
                    className="flex justify-center cursor-pointer bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 font-semibold shadow-lg"
                  >
                    <XIcon />
                    Cancel
                  </button>
                  <button
                    onClick={generateSummary}
                    disabled={isGeneratingSummary}
                    className="cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 font-semibold shadow-lg"
                  >
                    {isGeneratingSummary ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Generating AI Summary...
                      </>
                    ) : (
                      <>
                        <FileText size={20} />
                        Generate AI Summary
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border-2 border-gray-200 max-h-80 overflow-y-auto shadow-inner">
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {transcript}
                </p>
              </div>
            </div>
          )}

          {/* Summary Section */}
          {summary && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3 flex items-center gap-2">
                ✨ AI-Generated Summary
              </h2>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border-2 border-blue-200 shadow-lg">
                <pre className="text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {summary}
                </pre>
              </div>
            </div>
          )}

          {/* Download Options */}
          {(transcript || summary) && (
            <div className="flex justify-center gap-4 flex-wrap">
              <button
                onClick={downloadTXT}
                className="cursor-pointer bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-8 py-4 rounded-xl flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 font-semibold shadow-lg"
              >
                <Download size={24} />
                Download as TXT
              </button>
              <button
                onClick={downloadDOC}
                className="cursor-pointer bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-8 py-4 rounded-xl flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 font-semibold shadow-lg"
              >
                <Download size={24} />
                Download as DOC
              </button>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 p-6 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl shadow-md">
            <h3 className="font-bold text-yellow-900 mb-3 text-lg flex items-center gap-2">
              💡 How to Use
            </h3>
            <ol className="text-yellow-800 space-y-2 list-decimal list-inside">
              <li className="font-medium">
                Select your meeting language (English or Urdu)
              </li>
              <li className="font-medium">
                Click the red microphone button to start recording
              </li>
              <li className="font-medium">Speak clearly during your meeting</li>
              <li className="font-medium">
                Click the stop button when finished
              </li>
              <li className="font-medium">
                Click "Generate AI Summary" for intelligent insights
              </li>
              <li className="font-medium">
                Download your transcript and summary in TXT or DOC format
              </li>
            </ol>
            {/* <div className="mt-4 pt-4 border-t border-yellow-300">
              <p className="text-sm text-yellow-700 font-medium">
                ⚠️ <strong>Important:</strong> Works best in Chrome or Edge
                browser. Allow microphone access when prompted. First summary
                might take 20 seconds as the AI model loads.
              </p>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
