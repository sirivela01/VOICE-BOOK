// Web Speech API Speech Recognition Wrapper
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let processedFinalLength = 0;

/**
 * Checks if Speech Recognition is supported by the user's browser.
 * @returns {boolean}
 */
export function isSpeechSupported() {
    return !!SpeechRecognition;
}

/**
 * Initializes and starts the Speech Recognition engine.
 * @param {function(string): void} onWordsAdded Callback when new final words are transcribed
 * @param {function(string): void} onInterimResult Callback for live temporary feedback (interim text)
 * @param {function(boolean, string): void} onStatusChange Callback for status changes (active state, status text)
 */
export function startListening(onWordsAdded, onInterimResult, onStatusChange) {
    if (!isSpeechSupported()) {
        onStatusChange(false, "Speech recognition not supported in this browser. Please use Google Chrome, Safari, or Microsoft Edge.");
        return;
    }

    if (isRecording) return;

    try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        processedFinalLength = 0;
        isRecording = true;

        recognition.onstart = () => {
            onStatusChange(true, "Microphone Listening...");
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed') {
                onStatusChange(false, "Permission Denied: Allow mic access in your browser settings.");
                isRecording = false;
            } else if (event.error === 'no-speech') {
                // Silently ignore or show passive status; onend will trigger restart
                onStatusChange(true, "Listening (No speech detected)...");
            } else {
                onStatusChange(true, `Mic Status: ${event.error}`);
            }
        };

        recognition.onend = () => {
            // SpeechRecognition often auto-stops after silence or a few minutes.
            // If the user hasn't explicitly clicked stop, auto-restart it.
            if (isRecording) {
                console.log("Speech recognition stopped automatically. Restarting...");
                try {
                    // Reset processed length because the transcript index starts over on restart
                    processedFinalLength = 0;
                    recognition.start();
                } catch (e) {
                    console.error("Failed to auto-restart speech recognition:", e);
                }
            } else {
                onStatusChange(false, "Microphone Idle");
            }
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Extract only the newly finalized text in this step
            if (finalTranscript.length > processedFinalLength) {
                const newText = finalTranscript.substring(processedFinalLength).trim();
                processedFinalLength = finalTranscript.length;
                if (newText) {
                    onWordsAdded(newText);
                }
            }

            // Pass interim results for real-time visualization in the sidebar
            onInterimResult(interimTranscript);
        };

        recognition.start();

    } catch (e) {
        console.error("Speech initialization error:", e);
        onStatusChange(false, `Initialization Error: ${e.message}`);
        isRecording = false;
    }
}

/**
 * Stops speech recognition.
 */
export function stopListening() {
    isRecording = false;
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.error("Failed to stop speech recognition:", e);
        }
    }
}

/**
 * Checks if the mic is currently active.
 * @returns {boolean}
 */
export function isMicActive() {
    return isRecording;
}
