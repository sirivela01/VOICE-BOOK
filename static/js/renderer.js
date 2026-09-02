import { getPRNG } from "./utils.js?v=12.0";

const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 1000;

let canvas = null;
let ctx = null;

// Layout config
const config = {
    topMargin: 75, // 2cm top margin gap
    bottomMargin: 50,
    leftMargin: 30,
    rightMargin: 770,
    lineSpacing: 22,
    inkColor: "#1d3d84", // Premium ballpoint/fountain blue
};

// Jitter configurations by level
const jitterSettings = {
    0: { rotation: 0, wobble: 0, scale: 0, spacing: 0 },         // None
    1: { rotation: 0.6, wobble: 0.6, scale: 0.02, spacing: 0.3 },  // Low
    2: { rotation: 1.5, wobble: 1.4, scale: 0.04, spacing: 0.8 },  // Medium (Default)
    3: { rotation: 3.2, wobble: 2.8, scale: 0.08, spacing: 1.8 }   // High
};

let currentJitterLevel = 2; // Default to Medium
let currentFont = "Homemade Apple";
let currentFontSize = 23;
let pageText = "";
let bookId = "preview";
let pageNumber = 1;

let textSegments = []; // Array of { text: string, color: string }
let charPositions = [];
let overflowText = "";
let pendingFittingSegments = null;
let animatedCharCount = 0;
let isAnimating = false;
let isPageFocused = false;
let onPageFullCallback = null;
let onAnimationCompleteCallback = null;

export function setPageFocus(focused) {
    isPageFocused = focused;
    drawPage();
}

/**
 * Parses raw text input (JSON string, color token tags, or plain text) into structured textSegments array.
 */
function parseInputToSegments(rawInput) {
    if (!rawInput) return [];

    if (Array.isArray(rawInput)) {
        return rawInput.filter(s => s && typeof s.text === "string" && s.color);
    }
    
    const strInput = String(rawInput);

    // Check if rawInput is JSON array string
    if (strInput.trim().startsWith("[")) {
        try {
            const parsed = JSON.parse(strInput);
            if (Array.isArray(parsed)) {
                return parsed.filter(s => s && typeof s.text === "string" && s.color);
            }
        } catch (e) {
            // Fallthrough
        }
    }

    // Fallback: parse [color:#hex] tags if present
    if (strInput.includes("[color:")) {
        const regex = /\[color:(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g;
        const segments = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(strInput)) !== null) {
            if (match.index > lastIndex) {
                const plain = strInput.substring(lastIndex, match.index);
                if (plain) segments.push({ text: plain, color: config.inkColor });
            }
            segments.push({ text: match[2], color: match[1] });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < strInput.length) {
            const plain = strInput.substring(lastIndex);
            if (plain) segments.push({ text: plain, color: config.inkColor });
        }

        return segments;
    }

    // Plain text without tags: single segment with current active ink color
    return [{ text: strInput, color: config.inkColor }];
}

/**
 * Returns canonical serialized JSON string representation of textSegments for database storage.
 */
export function getPageText() {
    if (!textSegments || textSegments.length === 0) return "";
    return JSON.stringify(textSegments);
}

/**
 * Returns plain text without markup/JSON formatting for keyboard editor display.
 */
export function getPlainText() {
    if (!textSegments || textSegments.length === 0) return "";
    return textSegments.map(s => s.text).join("");
}

/**
 * Initializes the renderer with the target canvas element.
 * @param {HTMLCanvasElement} canvasElement 
 */
export function initRenderer(canvasElement) {
    canvas = canvasElement;
    
    // Scale canvas backing store for High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIRTUAL_WIDTH * dpr;
    canvas.height = VIRTUAL_HEIGHT * dpr;
    
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Trigger initial render
    drawPage();
}

/**
 * Sets current styling options and redraws immediately.
 */
export function setRenderOptions({ font, fontSize, jitterLevel, activeBookId, activePageNumber, inkColor }) {
    if (font !== undefined) currentFont = font;
    if (fontSize !== undefined) currentFontSize = fontSize;
    if (jitterLevel !== undefined) currentJitterLevel = jitterLevel;
    if (activeBookId !== undefined) bookId = activeBookId;
    if (activePageNumber !== undefined) pageNumber = activePageNumber;
    if (inkColor !== undefined) {
        config.inkColor = inkColor; // Active color for NEW text only! Existing textSegments stay in their original colors!
    }
    
    recalculateLayout();
    drawPage();
}

/**
 * Loads text onto the page and sets up typing animation.
 */
export function renderText(textOrSegments, animate = false, onPageFull = null, onComplete = null) {
    if (!canvas || !ctx) {
        const el = document.getElementById("notebook-canvas");
        if (el) initRenderer(el);
    }
    textSegments = parseInputToSegments(textOrSegments);
    onPageFullCallback = onPageFull;
    onAnimationCompleteCallback = onComplete;

    recalculateLayout();

    if (animate) {
        if (!isAnimating) {
            isAnimating = true;
            tickAnimation();
        }
    } else {
        animatedCharCount = charPositions.length;
        isAnimating = false;
        drawPage();
        checkOverflowStatus();
    }
}

/**
 * Updates textSegments from plain text input (e.g. keyboard typing) while preserving colors of existing segments.
 */
export function updateFromPlainText(newPlainText) {
    if (!canvas || !ctx) {
        const el = document.getElementById("notebook-canvas");
        if (el) initRenderer(el);
    }
    if (!newPlainText) {
        textSegments = [];
        recalculateLayout();
        drawPage();
        return;
    }

    const activeColor = config.inkColor;
    const currentPlain = getPlainText();

    if (newPlainText === currentPlain) return;

    // Case 1: Appended text at the end
    if (newPlainText.startsWith(currentPlain)) {
        const added = newPlainText.substring(currentPlain.length);
        if (textSegments.length > 0 && textSegments[textSegments.length - 1].color === activeColor) {
            textSegments[textSegments.length - 1].text += added;
        } else {
            textSegments.push({ text: added, color: activeColor });
        }
    }
    // Case 2: Deleted/backspaced text from the end
    else if (currentPlain.startsWith(newPlainText)) {
        let remaining = newPlainText;
        const updated = [];
        for (const seg of textSegments) {
            if (!remaining) break;
            if (remaining.length >= seg.text.length) {
                updated.push(seg);
                remaining = remaining.substring(seg.text.length);
            } else {
                updated.push({ text: seg.text.substring(0, remaining.length), color: seg.color });
                remaining = "";
            }
        }
        textSegments = updated;
    }
    // Case 3: Editing existing text or middle edits
    else {
        let remaining = newPlainText;
        const updated = [];
        for (const seg of textSegments) {
            if (!remaining) break;
            if (remaining.startsWith(seg.text)) {
                updated.push(seg);
                remaining = remaining.substring(seg.text.length);
            } else {
                let matchedLen = 0;
                while (matchedLen < seg.text.length && matchedLen < remaining.length && seg.text[matchedLen] === remaining[matchedLen]) {
                    matchedLen++;
                }
                if (matchedLen > 0) {
                    updated.push({ text: seg.text.substring(0, matchedLen), color: seg.color });
                    remaining = remaining.substring(matchedLen);
                }
                break;
            }
        }
        if (remaining) {
            updated.push({ text: remaining, color: activeColor });
        }
        textSegments = updated;
    }

    recalculateLayout();
    drawPage();
}

/**
 * Appends new transcription words to the page text and continues animating.
 */
export function appendText(newWords, onPageFull = null) {
    if (!newWords) return;
    if (!canvas || !ctx) {
        const el = document.getElementById("notebook-canvas");
        if (el) initRenderer(el);
    }
    if (onPageFull) onPageFullCallback = onPageFull;

    const activeColor = config.inkColor;
    const currentPlain = getPlainText();
    const sep = currentPlain.length > 0 && !currentPlain.endsWith(" ") ? " " : "";
    
    if (textSegments.length > 0 && textSegments[textSegments.length - 1].color === activeColor) {
        const last = textSegments[textSegments.length - 1];
        last.text += sep + newWords;
    } else {
        textSegments.push({ text: sep + newWords, color: activeColor });
    }

    recalculateLayout();

    if (!isAnimating) {
        isAnimating = true;
        tickAnimation();
    }
}

/**
 * Erases the page and resets text state.
 */
export function clearPage() {
    textSegments = [];
    charPositions = [];
    overflowText = "";
    pendingFittingSegments = null;
    animatedCharCount = 0;
    isAnimating = false;
    drawPage();
}

/**
 * Returns any text that did not fit on this page.
 */
export function getOverflowText() {
    return overflowText;
}

/**
 * Parses color tags formatted as [color:#hex]text[/color] into structured segments.
 */
function parseColorTokens(rawText) {
    if (!rawText) return [];
    
    const regex = /\[color:(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g;
    const tokens = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(rawText)) !== null) {
        if (match.index > lastIndex) {
            const plain = rawText.substring(lastIndex, match.index);
            if (plain) tokens.push({ text: plain, color: config.inkColor, rawStartIndex: lastIndex });
        }
        tokens.push({ text: match[2], color: match[1], rawStartIndex: match.index });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < rawText.length) {
        const plain = rawText.substring(lastIndex);
        if (plain) tokens.push({ text: plain, color: config.inkColor, rawStartIndex: lastIndex });
    }

    return tokens;
}

/**
 * Recalculates exact character placements on the page based on text-wrapping.
 */
function recalculateLayout() {
    if (!ctx) return;

    ctx.font = `${currentFontSize}px "${currentFont}"`;
    
    // Layout matching single page screenshot:
    // Red margin line at 100px. Text starts at 112px. Safe right margin wrap limit at 720px.
    const leftMargin = 100;
    const rightMargin = 720;
    const startX = leftMargin + 12; // 112px text starting position right of red margin line
    
    const maxLines = Math.floor((VIRTUAL_HEIGHT - config.topMargin - config.bottomMargin) / config.lineSpacing);
    const layout = [];
    let lineIndex = 0;
    let cursorX = startX;
    
    let isFull = false;
    let overflowSegIndex = -1;
    let overflowCharOffset = -1;

    // Break textSegments down into words with individual segment color!
    const wordsWithColor = [];
    for (let sIndex = 0; sIndex < textSegments.length; sIndex++) {
        const seg = textSegments[sIndex];
        const parts = seg.text.split(/(\s+)/);
        let charOffset = 0;
        
        for (const part of parts) {
            if (part !== "") {
                wordsWithColor.push({
                    word: part,
                    color: seg.color,
                    segIndex: sIndex,
                    charOffset: charOffset
                });
            }
            charOffset += part.length;
        }
    }

    let textProcessedLength = 0;

    for (let w = 0; w < wordsWithColor.length; w++) {
        const item = wordsWithColor[w];
        const word = item.word;
        const color = item.color;
        if (word === "") continue;

        // Check if word contains explicit newline
        if (word.includes('\n')) {
            const newlines = word.split('\n').length - 1;
            lineIndex += newlines;
            cursorX = startX;
            
            if (lineIndex >= maxLines) {
                isFull = true;
                overflowSegIndex = item.segIndex;
                overflowCharOffset = item.charOffset;
                break;
            }
            textProcessedLength += word.length;
            continue;
        }

        const isWhitespace = /^\s+$/.test(word);

        // Measure word width including glyph overhang and character jitter safety padding
        let wordWidth = 0;
        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const chW = ch === " " ? Math.max(ctx.measureText(ch).width, currentFontSize * 0.32) : ctx.measureText(ch).width;
            wordWidth += chW;
        }
        const safetyPadding = isWhitespace ? 0 : (word.length * 2.5 + 4.0);
        const totalWordWidth = wordWidth + safetyPadding;

        // Measure before drawing: Check if word overflows right margin (720px)
        if (!isWhitespace && (cursorX + totalWordWidth > rightMargin)) {
            if (cursorX > startX) {
                cursorX = startX;
                lineIndex++;
            }
        } else if (isWhitespace && (cursorX + wordWidth > rightMargin)) {
            cursorX = startX;
            lineIndex++;
            textProcessedLength += word.length;
            continue;
        }

        // Check if page vertical capacity is exceeded
        if (lineIndex >= maxLines) {
            isFull = true;
            overflowSegIndex = item.segIndex;
            overflowCharOffset = item.charOffset;
            break;
        }

        // Ignore leading whitespace at the start of a line
        if (isWhitespace && cursorX === startX) {
            textProcessedLength += word.length;
            continue;
        }

        // Calculate positions for characters in this word
        let wordX = cursorX;

        const seedStr = `${bookId}_${pageNumber}_word_${w}`;
        const prng = getPRNG(seedStr);
        const jitter = jitterSettings[currentJitterLevel];

        for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = char === " " ? Math.max(ctx.measureText(char).width, currentFontSize * 0.32) : ctx.measureText(char).width;
            
            // Character-level safety fallback: if single character exceeds right margin, wrap line
            if (wordX + charWidth > rightMargin && wordX > startX) {
                lineIndex++;
                if (lineIndex >= maxLines) {
                    isFull = true;
                    overflowSegIndex = item.segIndex;
                    overflowCharOffset = item.charOffset + c;
                    break;
                }
                wordX = startX;
            }

            layout.push({
                char: char,
                x: wordX,
                y: config.topMargin + lineIndex * config.lineSpacing + (config.lineSpacing * 0.72),
                lineIndex: lineIndex,
                wordIndex: w,
                charIndex: c,
                color: color
            });

            const spacingJitter = (prng() - 0.5) * jitter.spacing;
            wordX += charWidth + spacingJitter;
        }

        if (isFull) break;

        cursorX = wordX;
        textProcessedLength += word.length;
    }

    charPositions = layout;

    if (isFull && overflowSegIndex !== -1) {
        const fittingSegments = textSegments.slice(0, overflowSegIndex);
        const targetSeg = textSegments[overflowSegIndex];
        if (targetSeg && overflowCharOffset > 0) {
            fittingSegments.push({ text: targetSeg.text.substring(0, overflowCharOffset), color: targetSeg.color });
        }
        
        const remainingSegments = [];
        if (targetSeg && overflowCharOffset < targetSeg.text.length) {
            remainingSegments.push({ text: targetSeg.text.substring(overflowCharOffset), color: targetSeg.color });
        }
        for (let s = overflowSegIndex + 1; s < textSegments.length; s++) {
            remainingSegments.push(textSegments[s]);
        }
        
        overflowText = JSON.stringify(remainingSegments);
        pendingFittingSegments = fittingSegments;
    } else {
        overflowText = "";
        pendingFittingSegments = null;
    }
}

/**
 * Core loop executing the character progression typewriter animation.
 */
function tickAnimation() {
    if (!isAnimating) return;

    // Adjust writing speed: write roughly 0.4 to 0.8 letters per frame (feels very natural)
    const baseSpeed = currentFont === "Reenie Beanie" ? 0.9 : 0.45;
    animatedCharCount += baseSpeed;

    if (animatedCharCount >= charPositions.length) {
        animatedCharCount = charPositions.length;
        isAnimating = false;
        drawPage();
        
        // Check for complete writing and triggers
        checkOverflowStatus();
        if (onAnimationCompleteCallback) {
            onAnimationCompleteCallback();
        }
    } else {
        drawPage();
        requestAnimationFrame(tickAnimation);
    }
}

/**
 * Triggers callback if text overflows page.
 */
function checkOverflowStatus() {
    if (overflowText.length > 0 && onPageFullCallback) {
        const remaining = overflowText;
        if (pendingFittingSegments) {
            textSegments = pendingFittingSegments;
            pendingFittingSegments = null;
            recalculateLayout();
            drawPage();
        }
        overflowText = "";
        
        setTimeout(() => {
            onPageFullCallback(remaining);
        }, 600); // Small pause for realism before turning page
    }
}

/**
 * Draws the entire notebook background, ruled lines, margins, and text characters.
 */
function drawPage() {
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // 1. Draw Ruled Lines
    ctx.strokeStyle = "rgba(166, 196, 240, 0.45)"; // Soft ruled blue lines
    ctx.lineWidth = 1;
    
    const maxLines = 40;
    for (let i = 0; i < maxLines; i++) {
        const y = config.topMargin + i * config.lineSpacing;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VIRTUAL_WIDTH, y);
        ctx.stroke();
    }

    // 2. Draw Left Margin Line
    const marginX = 100;
    ctx.strokeStyle = "rgba(225, 80, 80, 0.75)"; // Soft margin red line
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, VIRTUAL_HEIGHT);
    ctx.stroke();

    // 3. Draw Header Lines/Boxes (Page & Date indicators in top-right header space)
    ctx.fillStyle = "#fdf6e6"; // Solid paper color mask
    ctx.fillRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    ctx.strokeStyle = "rgba(166, 196, 240, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    ctx.font = "10px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(`PAGE: ${pageNumber}   DATE: ___/___/___`, VIRTUAL_WIDTH - 192, 36);

    // 4. Draw Handwritten Text Characters
    ctx.font = `${currentFontSize}px "${currentFont}"`;
    ctx.fillStyle = config.inkColor;
    ctx.textBaseline = "alphabetic";

    const jitter = jitterSettings[currentJitterLevel];
    const totalToDraw = Math.floor(animatedCharCount);

    for (let i = 0; i < totalToDraw; i++) {
        const cp = charPositions[i];
        if (!cp) continue;

        // Seeded PRNG for stable transformations
        const seedStr = `${bookId}_${pageNumber}_char_${i}_${cp.char}`;
        const prng = getPRNG(seedStr);

        // Calculate jitters
        const rotJitter = (prng() - 0.5) * jitter.rotation * (Math.PI / 180);
        const wobbleX = (prng() - 0.5) * jitter.wobble;
        const wobbleY = (prng() - 0.5) * jitter.wobble;
        const scaleJitter = 1.0 + (prng() - 0.5) * jitter.scale;

        ctx.save();
        ctx.fillStyle = cp.color || config.inkColor;
        
        // Translate to letter position + wobble
        ctx.translate(cp.x + wobbleX, cp.y + wobbleY);
        // Rotate
        ctx.rotate(rotJitter);
        // Scale size slightly
        ctx.scale(scaleJitter, scaleJitter);
        
        // Render character
        ctx.fillText(cp.char, 0, 0);
        
        ctx.restore();
    }

    // 5. Draw Blinking Writing Cursor
    if (isAnimating && totalToDraw > 0 && totalToDraw < charPositions.length) {
        const lastChar = charPositions[totalToDraw - 1];
        if (lastChar) {
            ctx.fillStyle = "rgba(29, 61, 132, 0.7)";
            ctx.beginPath();
            // Tiny circular ink drop as writing cursor
            ctx.arc(lastChar.x + 8, lastChar.y - 2, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (isPageFocused && !isAnimating) {
        // Draw Word-document style blinking text cursor | at current writing position
        const cursorX = charPositions.length > 0 ? charPositions[charPositions.length - 1].x + 10 : 112;
        const cursorY = charPositions.length > 0 ? charPositions[charPositions.length - 1].y : (config.topMargin + config.lineSpacing * 0.72);
        
        ctx.fillStyle = config.inkColor || "#1d3d84";
        ctx.fillRect(cursorX, cursorY - currentFontSize * 0.75, 2, currentFontSize * 0.9);
    }
}

/**
 * Renders a static, non-animating page onto a canvas.
 * Useful for displaying side-by-side pages in a double page spread.
 */
export function renderPageStatic(canvasElement, text, pageNum, options = {}) {
    if (!canvasElement) return;
    
    // Scale canvas backing store for High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvasElement.width = VIRTUAL_WIDTH * dpr;
    canvasElement.height = VIRTUAL_HEIGHT * dpr;
    
    const staticCtx = canvasElement.getContext('2d');
    staticCtx.scale(dpr, dpr);
    
    const font = options.font || currentFont;
    const fontSize = options.fontSize || currentFontSize;
    const jitterLevel = options.jitterLevel !== undefined ? options.jitterLevel : currentJitterLevel;
    
    const leftMargin = 100;
    const rightMargin = 720;
    const startX = leftMargin + 12; // 112px text starting position right of red margin line
    
    // 1. Draw Ruled Lines
    staticCtx.strokeStyle = "rgba(166, 196, 240, 0.45)";
    staticCtx.lineWidth = 1;
    
    const maxLines = 40;
    for (let i = 0; i < maxLines; i++) {
        const y = config.topMargin + i * config.lineSpacing;
        staticCtx.beginPath();
        staticCtx.moveTo(0, y);
        staticCtx.lineTo(VIRTUAL_WIDTH, y);
        staticCtx.stroke();
    }

    // 2. Draw Left Margin Line
    staticCtx.strokeStyle = "rgba(225, 80, 80, 0.75)"; // Soft margin red line
    staticCtx.lineWidth = 1.2;
    staticCtx.beginPath();
    staticCtx.moveTo(leftMargin, 0);
    staticCtx.lineTo(leftMargin, VIRTUAL_HEIGHT);
    staticCtx.stroke();

    // 3. Draw Header Box (in top header space above ruled lines)
    staticCtx.fillStyle = "#fdf6e6"; // Solid paper color mask
    staticCtx.fillRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    staticCtx.strokeStyle = "rgba(166, 196, 240, 0.55)";
    staticCtx.lineWidth = 1;
    staticCtx.strokeRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    staticCtx.font = "10px 'Inter', sans-serif";
    staticCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
    staticCtx.fillText(`PAGE: ${pageNum}   DATE: ___/___/___`, VIRTUAL_WIDTH - 192, 36);
    
    if (!text) return;
    
    staticCtx.font = `${fontSize}px "${font}"`;
    staticCtx.fillStyle = config.inkColor;
    staticCtx.textBaseline = "alphabetic";
    
    const segments = parseInputToSegments(text);
    const wordsWithColor = [];
    for (let sIndex = 0; sIndex < segments.length; sIndex++) {
        const seg = segments[sIndex];
        const parts = seg.text.split(/(\s+)/);
        let charOffset = 0;
        for (const part of parts) {
            if (part !== "") {
                wordsWithColor.push({
                    word: part,
                    color: seg.color,
                    segIndex: sIndex,
                    charOffset: charOffset
                });
            }
            charOffset += part.length;
        }
    }

    let lineIndex = 0;
    let cursorX = startX;
    const jitter = jitterSettings[jitterLevel];
    let textProcessedLength = 0;

    for (let w = 0; w < wordsWithColor.length; w++) {
        const item = wordsWithColor[w];
        const word = item.word;
        const color = item.color;
        if (word === "") continue;

        if (word.includes('\n')) {
            const newlines = word.split('\n').length - 1;
            lineIndex += newlines;
            cursorX = startX;
            if (lineIndex >= maxLines) break;
            textProcessedLength += word.length;
            continue;
        }

        const isWhitespace = /^\s+$/.test(word);

        let wordWidth = 0;
        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const chW = ch === " " ? Math.max(staticCtx.measureText(ch).width, fontSize * 0.32) : staticCtx.measureText(ch).width;
            wordWidth += chW;
        }
        const safetyPadding = isWhitespace ? 0 : (word.length * 2.5 + 4.0);
        const totalWordWidth = wordWidth + safetyPadding;

        if (!isWhitespace && (cursorX + totalWordWidth > rightMargin)) {
            if (cursorX > startX) {
                cursorX = startX;
                lineIndex++;
            }
        } else if (isWhitespace && (cursorX + wordWidth > rightMargin)) {
            cursorX = startX;
            lineIndex++;
            textProcessedLength += word.length;
            continue;
        }

        if (lineIndex >= maxLines) break;

        if (isWhitespace && cursorX === startX) {
            textProcessedLength += word.length;
            continue;
        }

        let wordX = cursorX;
        const seedStr = `${bookId}_${pageNum}_word_${w}`;
        const prng = getPRNG(seedStr);

        for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = char === " " ? Math.max(staticCtx.measureText(char).width, fontSize * 0.32) : staticCtx.measureText(char).width;
            
            if (wordX + charWidth > rightMargin && wordX > startX) {
                lineIndex++;
                if (lineIndex >= maxLines) break;
                wordX = startX;
            }

            const lineY = config.topMargin + lineIndex * config.lineSpacing + (config.lineSpacing * 0.72);
            
            const seedCharStr = `${bookId}_${pageNum}_char_${textProcessedLength + c}_${char}`;
            const prngChar = getPRNG(seedCharStr);
            
            const rotJitter = (prngChar() - 0.5) * jitter.rotation * (Math.PI / 180);
            const wobbleX = (prngChar() - 0.5) * jitter.wobble;
            const wobbleY = (prngChar() - 0.5) * jitter.wobble;
            const scaleJitter = 1.0 + (prngChar() - 0.5) * jitter.scale;
            
            staticCtx.save();
            staticCtx.fillStyle = color || config.inkColor;
            staticCtx.translate(wordX + wobbleX, lineY + wobbleY);
            staticCtx.rotate(rotJitter);
            staticCtx.scale(scaleJitter, scaleJitter);
            staticCtx.fillText(char, 0, 0);
            staticCtx.restore();

            const spacingJitter = (prng() - 0.5) * jitter.spacing;
            wordX += charWidth + spacingJitter;
        }
        cursorX = wordX;
        textProcessedLength += word.length;
    }
}
