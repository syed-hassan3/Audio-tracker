"use client"
import { useState, useRef, useEffect } from 'react';

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const ASSEMBLYAI_API_KEY = '73d9eea30dcd45e5ab115c4ed66deffb';

  useEffect(() => {
    // Check if we're on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Initialize speech recognition for desktop only (real-time)
    if (typeof window !== 'undefined' && !isMobile) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptPiece + ' ';
            }
          }

          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
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

  const uploadToAssemblyAI = async (audioBlob) => {
    setTranscriptionProgress('Uploading audio...');
    
    try {
      // Step 1: Upload the audio file
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
        },
        body: audioBlob
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload audio');
      }

      const { upload_url } = await uploadResponse.json();
      
      setTranscriptionProgress('Transcribing audio...');

      // Step 2: Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: upload_url,
          language_code: 'en'
        })
      });

      if (!transcriptResponse.ok) {
        throw new Error('Failed to request transcription');
      }

      const { id } = await transcriptResponse.json();

      // Step 3: Poll for transcription result
      let transcriptData;
      let attempts = 0;
      const maxAttempts = 60; // 60 attempts = 5 minutes max

      while (attempts < maxAttempts) {
        setTranscriptionProgress(`Processing... (${attempts + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

        const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: {
            'authorization': ASSEMBLYAI_API_KEY,
          }
        });

        transcriptData = await pollingResponse.json();

        if (transcriptData.status === 'completed') {
          return transcriptData.text;
        } else if (transcriptData.status === 'error') {
          throw new Error('Transcription failed: ' + transcriptData.error);
        }

        attempts++;
      }

      throw new Error('Transcription timeout');

    } catch (error) {
      console.error('AssemblyAI Error:', error);
      throw error;
    }
  };

  const startRecording = async () => {
    try {
      setError('');
      setTranscript('');
      setAudioUrl(null);
      setRecordingTime(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      streamRef.current = stream;

      // Use different MIME types based on browser support
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
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
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        // Use AssemblyAI for transcription on all devices
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          setIsTranscribing(true);
          try {
            const transcribedText = await uploadToAssemblyAI(audioBlob);
            setTranscript(transcribedText || 'No speech detected in the recording.');
            setIsTranscribing(false);
            setTranscriptionProgress('');
          } catch (error) {
            setError('Transcription failed: ' + error.message);
            setIsTranscribing(false);
            setTranscriptionProgress('');
          }
        }
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start speech recognition for desktop (real-time)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (recognitionRef.current && !isMobile) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('Recognition error:', e);
        }
      }
    } catch (err) {
      setError('Error accessing microphone. Please allow microphone access and try again.');
      console.error('Error:', err);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (recognitionRef.current && !isMobile) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      // For desktop, also use AssemblyAI if browser speech recognition didn't work well
      if (!isMobile && !transcript) {
        setIsTranscribing(true);
        try {
          // Wait a bit for the blob to be ready
          await new Promise(resolve => setTimeout(resolve, 500));
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mediaRecorderRef.current.mimeType 
          });
          const transcribedText = await uploadToAssemblyAI(audioBlob);
          setTranscript(transcribedText || 'No speech detected in the recording.');
          setIsTranscribing(false);
          setTranscriptionProgress('');
        } catch (error) {
          setError('Transcription failed: ' + error.message);
          setIsTranscribing(false);
          setTranscriptionProgress('');
        }
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
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      audioChunksRef.current = [];
      setTranscript('');
      setAudioUrl(null);
      setError('');
      setRecordingTime(0);
      setIsTranscribing(false);
      setTranscriptionProgress('');
    }
  };

  const downloadAudio = () => {
    if (audioUrl) {
      const a = document.createElement('a');
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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
              ⚠️ {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-4 mb-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isTranscribing}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-200 text-lg w-full sm:w-auto"
              >
                🎤 Start Recording
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

          {isTranscribing && (
            <div className="bg-blue-50 border-2 border-blue-300 p-4 rounded-lg mb-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-t-2 border-blue-600"></div>
                <div>
                  <p className="text-blue-800 font-semibold">Transcribing your audio...</p>
                  {transcriptionProgress && (
                    <p className="text-blue-600 text-sm mt-1">{transcriptionProgress}</p>
                  )}
                </div>
              </div>
            </div>
          )}

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

          {!isRecording && !audioUrl && !transcript && !isTranscribing && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg mb-2">Click "Start Recording" to begin</p>
              <p className="text-sm">📱 Works perfectly on all devices</p>
              <p className="text-xs mt-2 text-green-600 font-semibold">✓ AI-Powered Transcription Enabled</p>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-lg shadow p-4 text-xs sm:text-sm text-gray-600">
          <p className="font-semibold mb-2 text-green-600">✅ Fully Functional on All Devices:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>✓ Recording works on mobile and desktop</li>
            <li>✓ AI transcription powered by AssemblyAI</li>
            <li>✓ Accurate speech-to-text on iPhone, Android, and PC</li>
            <li>✓ Download your recordings anytime</li>
          </ul>
        </div>
      </div>
    </div>
  );
}