# Walkthrough - Software Far-Field Audio & Long Distance Voice Capture (v=7.1)

We have upgraded the speech recognition engine with **Far-Field Audio Optimization & Automatic Gain Control (AGC)** to capture voices from a distance across the room!

## 🎙️ What Was Added (v=7.1)

### 1. Software Far-Field Audio Constraints (`requestFarFieldAudioStream`)
* **Disabled Aggressive Noise Suppression:** Standard browser noise filters mistake quiet/distant voices across the room for background noise and cut them out. Far-Field mode disables aggressive noise suppression so distant speech is captured clearly!
* **Automatic Gain Control (AGC):** Enables browser auto-gain amplification so faint voice signals from across the room are auto-amplified before entering speech recognition!

### 2. UI Mic Voice Distance Selector (`#select-mic-sensitivity`)
* Added a **Mic Distance & Gain Boost** dropdown in the workspace sidebar:
  - 🎙️ **Far-Field Boost (Default):** Captures voice from across the room.
  - 🎙️ **Normal Distance:** For close-up speaking.

---

## 🎧 Hardware & Windows Setup Recommendations for Long Distance Voice

For best results when speaking from across the room:

1. **Windows Microphone Boost Settings:**
   * Open Windows Settings ➔ **System** ➔ **Sound** ➔ **More Sound Settings** (or `mmsys.cpl`).
   * Double-click your Microphone ➔ **Levels** tab.
   * Increase **Microphone Level** to **100** and set **Microphone Boost** to **+10.0 dB** or **+20.0 dB**.

2. **Recommended Hardware Microphones for Distance:**
   * **USB Conference / Boundary Microphone** (e.g., *Anker PowerConf*, *Samson UB1*, or *Jabra Speak*) – engineered specifically to pick up voices anywhere in a 10–15 ft room!
   * **USB Condenser Microphone with Gain Control** (e.g., *Fifine K669B*, *Blue Yeti*, or *HyperX SoloCast*) – turn the hardware Gain knob up to pick up distant speech!
