// Web Speech API Speech Recognition Wrapper with Mobile Duplication & Silence Shield
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let lastProcessedIndex = -1;
let lastEmittedText = "";
let latestInterimText = "";
let restartAttempts = 0;
let restartTimer = null;

let selectedLanguage = 'en-IN';

/**
 * Sets the speech recognition dialect / language.
 * @param {string} lang e.g. 'en-IN', 'en-US', 'hi-IN'
 */
export function setSpeechLanguage(lang) {
    if (lang) {
        selectedLanguage = lang;
        if (recognition) {
            try {
                recognition.lang = lang;
            } catch(e) {}
        }
    }
}

/**
 * Checks if Speech Recognition is supported by the user's browser.
 * @returns {boolean}
 */
export function isSpeechSupported() {
    return !!SpeechRecognition;
}

/**
 * Removes consecutive duplicate words from a string (e.g., "currently currently" -> "currently").
 */
function cleanDeduplicatedWords(str) {
    if (!str) return "";
    const words = str.split(/\s+/);
    const result = [];
    for (let i = 0; i < words.length; i++) {
        if (i > 0 && words[i].toLowerCase() === words[i - 1].toLowerCase()) {
            continue;
        }
        result.push(words[i]);
    }
    return result.join(" ");
}

/**
 * Extracts only NEW delta text from incoming speech transcripts,
 * preventing Mobile Chrome duplicate accumulated speech bug.
 */
function getNewDeltaText(incomingText) {
    const cleanIncoming = incomingText.trim();
    if (!cleanIncoming) return "";

    // 1. If exact match with last emitted reference, ignore
    if (cleanIncoming.toLowerCase() === lastEmittedText.toLowerCase()) {
        return "";
    }

    // 2. If incoming text starts with lastEmittedText, extract trailing delta
    if (lastEmittedText && cleanIncoming.toLowerCase().startsWith(lastEmittedText.toLowerCase())) {
        const delta = cleanIncoming.substring(lastEmittedText.length).trim();
        if (delta) {
            lastEmittedText = cleanIncoming;
            return cleanDeduplicatedWords(delta);
        }
        return "";
    }

    // 3. Overlap matching for trailing/leading word sequences
    const wordsIncoming = cleanIncoming.split(/\s+/);
    const wordsLast = lastEmittedText.split(/\s+/);

    let overlapCount = 0;
    for (let k = Math.min(wordsLast.length, wordsIncoming.length); k > 0; k--) {
        const lastTail = wordsLast.slice(wordsLast.length - k).join(" ").toLowerCase();
        const incomingHead = wordsIncoming.slice(0, k).join(" ").toLowerCase();
        if (lastTail === incomingHead) {
            overlapCount = k;
            break;
        }
    }

    if (overlapCount > 0) {
        const deltaWords = wordsIncoming.slice(overlapCount);
        if (deltaWords.length > 0) {
            const deltaStr = deltaWords.join(" ");
            lastEmittedText = (lastEmittedText + " " + deltaStr).slice(-300);
            return cleanDeduplicatedWords(deltaStr);
        }
        return "";
    }

    // 4. Brand new phrase
    lastEmittedText = cleanIncoming.slice(-300);
    return cleanDeduplicatedWords(cleanIncoming);
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

    isRecording = true;
    lastProcessedIndex = -1;
    lastEmittedText = "";
    latestInterimText = "";
    restartAttempts = 0;

    function createAndStartRecognition() {
        if (!isRecording) return;

        try {
            if (recognition) {
                try { 
                    recognition.onstart = null; 
                    recognition.onend = null; 
                    recognition.onerror = null; 
                    recognition.onresult = null; 
                    recognition.abort(); 
                } catch(e) {}
            }

            recognition = new SpeechRecognition();
            lastProcessedIndex = -1; // Reset index tracker for new recognition session!
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            recognition.continuous = !isMobile;
            recognition.interimResults = true;
            recognition.lang = selectedLanguage || 'en-IN';
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                restartAttempts = 0;
                onStatusChange(true, "Microphone Listening... (Speak now)");
            };

            recognition.onerror = (event) => {
                console.warn("Mobile speech recognition notice:", event.error);
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    isRecording = false;
                    onStatusChange(false, "Permission Denied: Allow mic access in your browser address bar.");
                } else if (event.error === 'no-speech') {
                    onStatusChange(true, "Listening... (Waiting for speech)");
                } else if (event.error === 'audio-capture') {
                    isRecording = false;
                    onStatusChange(false, "Microphone error: Ensure mic is enabled.");
                }
            };

            recognition.onend = () => {
                // FLUSH ANY PENDING INTERIM TEXT BEFORE RESTARTING SO NO SPOKEN WORDS ARE EVER LOST!
                if (latestInterimText && latestInterimText.trim()) {
                    const pendingText = latestInterimText.trim();
                    latestInterimText = "";
                    onWordsAdded(pendingText);
                }
                onInterimResult("");

                if (isRecording) {
                    restartAttempts++;
                    if (restartAttempts > 8) {
                        isRecording = false;
                        onStatusChange(false, "Microphone Idle. Tap Start Dictation to talk.");
                        return;
                    }
                    
                    onStatusChange(true, "Listening... (Re-connecting)");
                    restartTimer = setTimeout(() => {
                        if (isRecording) {
                            createAndStartRecognition();
                        }
                    }, isMobile ? 200 : 80);
                } else {
                    onStatusChange(false, "Microphone Idle");
                }
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalSpeechChunk = '';

                for (let i = 0; i < event.results.length; ++i) {
                    const res = event.results[i];
                    const transcript = res[0] ? res[0].transcript.trim() : '';

                    if (res.isFinal) {
                        if (i > lastProcessedIndex) {
                            lastProcessedIndex = i;
                            if (transcript) {
                                finalSpeechChunk += (finalSpeechChunk ? ' ' : '') + transcript;
                            }
                        }
                    } else {
                        interimTranscript += (interimTranscript ? ' ' : '') + transcript;
                    }
                }

                latestInterimText = interimTranscript;

                if (finalSpeechChunk) {
                    onWordsAdded(finalSpeechChunk);
                    latestInterimText = "";
                }

                onInterimResult(interimTranscript);
            };

            recognition.start();

        } catch (e) {
            console.error("Speech creation error:", e);
            if (isRecording) {
                restartTimer = setTimeout(() => {
                    if (isRecording) createAndStartRecognition();
                }, 400);
            }
        }
    }

    createAndStartRecognition();
}

/**
 * Stops speech recognition.
 */
export function stopListening() {
    isRecording = false;
    lastEmittedText = "";
    latestInterimText = "";
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

/**
 * Checks if the mic is currently active.
 * @returns {boolean}
 */
export function isMicActive() {
    return isRecording;
}
