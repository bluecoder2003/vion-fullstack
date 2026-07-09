# Vion Frontend — Viva Guide

> Date: 2026-07-09 | Focus: Concepts, flows, and how everything connects.

---

## 1. Core Frontend Principles Used

### React Hooks — and why each one was chosen

**`useState`** — holds UI state that needs to trigger a re-render. Things like which tab is active, whether a dropdown is open, the current spread index.

**`useEffect`** — runs side effects that can't be done during render. Used for: starting the polling timer when audio begins, attaching keyboard listeners, firing layout measurement after chapter changes, syncing ambient mode when the user toggles it.

**`useRef`** — holds values that must *not* cause a re-render when changed. The entire audio system runs on refs: the `<audio>` DOM element, the polling interval handle, the list of audio URLs, the current sentence cues, the ambient engine instance. Audio events fire dozens of times per second — putting any of that in `useState` would cause constant re-renders and make the UI stutter.

**`useCallback`** — wraps functions so they don't get recreated on every render. This matters when a function is passed as a prop or used in a `useEffect` dependency array — without `useCallback`, the effect would fire on every render unnecessarily.

**`useMemo`** — caches expensive computed values. The `sentenceMap` (splitting a whole chapter into sentences) is computed once per chapter, not on every render. The chapter highlights list is filtered once per chapter, not on every keystroke.

**`useContext`** — lets any component read shared state (which book is open, which sentence is active, ambient mode, etc.) without prop-drilling through 6 layers of components.

---

### CSS Multi-Column Layout — how pagination works

The book text is not split into pages manually. Instead, all the text is rendered into a single `<div>` with CSS `column-width` set. The browser naturally flows the text into columns, just like a newspaper.

The columns div is given `width: 99999px` so columns overflow horizontally forever. Then a `translateX` CSS transform slides the container left to show only the current two columns (left page + right page). Flipping a page = changing the `translateX` value.

```
All text in one long horizontal strip:
[col 0][col 1][col 2][col 3][col 4][col 5]...
       |← spread 0 →|← spread 1 →|
       visible ↑
```

There are 3 layout constants hardcoded:
- `PAD_X = 48px` — horizontal padding per page
- `PAD_Y = 40px` — top and bottom padding
- `COL_GAP = 64px` — the centre gutter between left and right pages

The page transition itself is a CSS `transition: transform 0.3s cubic-bezier(.25,.1,.25,1)` — smooth, no JavaScript animation loop needed.

---

### `ResizeObserver` — reactive layout

When the user opens the Table of Contents sidebar, the content area shrinks. The column widths need to be recalculated. A `ResizeObserver` watches the container and fires `updateHint()` whenever its size changes — far more reliable than listening to `window.resize` which doesn't fire for internal layout changes.

---

### Double `requestAnimationFrame` — measuring the layout

After React renders content into the columns, the browser needs a moment to calculate positions. A single `requestAnimationFrame` fires *before* the browser has finished layout. Two `requestAnimationFrame` calls chained together guarantee the browser has completed layout before we measure where each column and sentence actually is on screen.

```
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // browser has finished layout — now safe to read DOM positions
    measure()
  })
})
```

---

### `AnimatePresence` + `motion` (Framer Motion) — smooth UI

All panels (sidebars, dropdowns, the audio player bar at the bottom) use `AnimatePresence` so they animate in and out instead of snapping. The audio player slides up from the bottom (`y: 60 → 0`). Sidebars slide in by animating `width: 0 → 260px`. The MusicPlayer dropdown scales and fades in (`scale: 0.95 → 1, opacity: 0 → 1`).

---

### `box-decoration-break: clone`

When a highlighted sentence or an audio-active sentence spans across two columns (wraps from the right column to the left column of the next page), the highlight background would normally cut off at the column boundary. Setting `box-decoration-break: clone` tells the browser to render the background on each fragment independently, so the highlight looks correct on both columns.

---

## 2. How EPUB Files Are Parsed

**Library:** `epubjs`

When the user uploads an EPUB or when the app fetches one from a URL, the flow is:

1. The file becomes an `ArrayBuffer` in the browser
2. `epubjs` opens it: `ePub(arrayBuffer)` — an EPUB is actually a ZIP file containing XHTML chapters
3. The **metadata** is read (title, author)
4. The **Table of Contents** (TOC) is read to get chapter titles and their order
5. The **spine** is iterated — the spine is the ordered list of all sections in reading order
6. For each section, the raw XHTML is read directly from the ZIP using **JSZip** (the most reliable method). Two fallbacks exist if this fails: `section.render(epub.load.bind(epub))` and `section.render()`
7. Each XHTML section is converted to plain text by a function called `htmlToText()` — it strips `<style>`, `<script>`, images, and SVG elements, then converts `<p>`, `<div>`, `<h1>`–`<h6>` into `\n\n` paragraph breaks
8. Images inside the EPUB (`<img>` tags) are extracted as `blob:` URLs using `URL.createObjectURL()` so they can be displayed in the reader without a network request

The result is a list of chapters, each with an `id`, `title`, `page number`, and `content` (plain text with `\n\n` between paragraphs).

---

## 3. How PDF Files Are Parsed

**Library:** `pdfjs-dist`

1. The file becomes an `ArrayBuffer`
2. `pdfjsLib.getDocument(arrayBuffer)` opens the PDF
3. Each page is iterated: `pdf.getPage(i)` → `page.getTextContent()`
4. The text items from each page are joined into a single string
5. The entire PDF text is then split into chapters the same way as a `.txt` book — looking for headings like "CHAPTER", "PART", "SECTION" etc.

PDF parsing is simpler than EPUB because PDFs have no semantic structure — just raw text per page.

---

## 4. The Streaming Audio Flow — What Happens When You Press "Listen"

This is the core of the whole application. Here is the exact sequence:

**Step 1 — Request sent to backend**

The frontend sends a `POST /api/audiobook` request with the book ID, title, author, and the full chapter text. The backend immediately returns a `job_id` and starts generating audio in a background thread.

**Step 2 — Polling begins**

The frontend starts an interval that fires every **2,500 milliseconds**. Each tick calls `GET /api/audiobook/{job_id}/status`. The response contains a `ready_files[]` array — the list of WAV files that have been generated so far.

**Step 3 — First audio chunk arrives**

The backend generates one paragraph at a time (400–1,000 characters per chunk). As soon as the first chunk is done, it appears in `ready_files[]`. The frontend sees a new URL it hasn't seen before, creates an `Audio` element (`new Audio(url)`), and calls `.play()`. The user hears audio within **10–16 seconds** of pressing play — long before the full book is generated.

**Step 4 — Sentence-level synchronization**

Along with each WAV file, the backend generates a `.timestamps.json` sidecar file. This file contains the start and end time (in seconds) of every word in that audio segment:
```
[{ "word": "It", "start": 0.0, "end": 0.12 },
 { "word": "was", "start": 0.13, "end": 0.28 }, ...]
```
The frontend fetches this JSON and uses it to build **sentence cues** — mapping each sentence to a `startTime` and `endTime` in the audio.

**Step 5 — `timeupdate` event drives everything**

The `<audio>` element fires a `timeupdate` event many times per second. Each time it fires, the frontend runs a binary search over the sentence cues to find which sentence corresponds to `audio.currentTime`. It then calls `setAudioSentenceIndex(globalIdx)`. This single state update cascades into two effects:

- **Text highlights**: `ReaderContent` re-renders the current sentence with a coloured background. The active word inside that sentence is highlighted in the accent colour with bold text.
- **Auto page turn**: `ReaderContent` checks if the newly active sentence is visible on the current spread. If not, it calculates which spread it belongs to and sets the spread index — the page turns automatically.

**Step 6 — Clicking a sentence**

Every sentence span has `data-sentence-idx` and an `onClick` handler. Clicking a sentence calls `setAudioSentenceIndex(globalIdx)`. The AudiobookPlayer detects this as a user-driven change (because it differs from `lastIndexRef.current`) and calls `seekToSentenceIndex()` — which finds the right WAV file and seeks `audio.currentTime` to the sentence's start time.

**Step 7 — End of chunk, advance to next**

When the `<audio>` element fires `ended`, the frontend increments to the next URL in the queue and creates a new `Audio` element. If the next URL is not ready yet (still being generated), it sets a `pendingAdvance` flag. The next poll tick sees this flag, gets the new URL, and immediately plays it.

---

## 5. How the Adaptive Ambient Sound Syncs with the Audio

The ambient soundscape reacts to *what text is being narrated*, not to time. Here is how the link is made:

**The trigger:** every time `audioSentenceIndex` changes (driven by the `timeupdate` event above), a `useEffect` in `AudiobookPlayer` fires.

**Step 1 — Context window**

The function `buildContextWindow()` takes the flat array of all sentences in the chapter and returns the 9 sentences centred around the current sentence. It leans backward (6 sentences behind, 3 ahead) because context that already happened is more relevant than what's coming next.

**Step 2 — Scene detection**

`detectScene(contextText)` scans the joined 9-sentence window using 12 regex patterns, each weighted by priority. For example:
- "thunder", "lightning", "tempest" → storm (weight 3 — highest)
- "ocean", "waves", "shore" → ocean (weight 2)
- "fireplace", "hearth", "embers" → fire (weight 2)
- "room", "corridor", "chamber" → indoor (weight 1 — lowest)

Each pattern match multiplies its count by its weight. The scene with the highest total score becomes the `primary` scene. If the second-highest scene scores at least 40% of the primary, it becomes a `secondary` blend scene.

**Step 3 — Hysteresis (prevents flickering)**

A single sentence containing "rain" shouldn't immediately switch the entire soundscape. `SceneHysteresis` keeps a history of the last 6 detected scenes. A scene only becomes the stable output if it has appeared at least 2 times in that history. If a completely different scene appears briefly (one sentence about "fire" in a chapter about the ocean), it gets filtered out.

**Step 4 — Transition**

`engine.transitionTo(stableScene, secondary, secondaryWeight)` is called. The current primary scene fades out exponentially over **2.5 seconds**. The new scene fades in over the same 2.5 seconds. If there's a secondary scene (e.g., rain blended into storm), it plays at a reduced volume proportional to how strongly it scored.

**Step 5 — Narration ducking**

Immediately after the transition call, `engine.duck(0.55, 1.0)` is called. This temporarily drops the ambient volume to 55% of its set level for 1 second (with a 150ms attack and 300ms recovery), so the narration voice is always clearly audible at the start of each new sentence.

The whole chain — sentence spoken → context detected → scene chosen → audio crossfades → voice heard clearly — happens on every single sentence automatically with no user interaction.

---

## 6. How Background Music Connects (or Doesn't)

Background music is deliberately **independent** from the adaptive ambient system.

- The ambient engine (`AmbientEngine`) and the music engine (`MusicEngine`) each have their own `AudioContext` — they do not share any nodes.
- Ambient changes automatically based on text. Music stays fixed on whatever genre the user picked.
- Both can play at the same time, layered together.
- Each has its own volume slider in the MusicPlayer panel.
- The narration ducking from `engine.duck()` only affects the ambient engine's internal `duckGain` node — the music engine is not ducked. This is intentional: music is a background texture, ambient is what syncs with the narration.

The procedural music engine generates music using **Web Audio API oscillators** — no audio files. It creates bass drones, chord progressions, and arpeggiated melodies using `OscillatorNode` and `GainNode` objects with attack/release envelopes on every note. Different genres change the chord patterns, frequencies, and rhythms.

---

## 7. One-line Answers to Common Viva Questions

**Q: Why use CSS columns instead of splitting text into pages manually?**  
A: The browser handles all reflow — font changes, image sizes, special blocks — without any JS calculation.

**Q: How does clicking a sentence jump the audio?**  
A: The sentence span has `onClick` which calls `setAudioSentenceIndex`. AudiobookPlayer detects this change, finds which WAV file contains that sentence, and seeks `audio.currentTime` to the precomputed `startTime` from the timestamps JSON.

**Q: What if the timestamps JSON doesn't exist?**  
A: A fallback estimator runs — it assigns each sentence a time proportional to its word count plus a weight for punctuation pauses. Each word inside the sentence gets a time proportional to its character count. This is why the karaoke highlighting always works even for LibriVox recordings.

**Q: How does the page auto-turn during audio?**  
A: When `audioSentenceIndex` changes, the reader finds the DOM element with `data-sentence-idx` matching it, calls `getClientRects()` to find where it is in the horizontal column strip, and checks if it's inside the visible viewport. If not, it calculates the target spread index and updates it — the `translateX` transition does the rest.

**Q: Why `getClientRects()` and not `getBoundingClientRect()`?**  
A: A sentence that wraps across two columns has multiple rects. `getBoundingClientRect()` would give the union of all of them (wrong). `getClientRects()` gives each fragment separately — we use the first one, which is where the sentence *starts*.

**Q: Why two `requestAnimationFrame` calls?**  
A: One rAF fires before the browser paints. Two rAFs guarantees the browser has finished layout calculations so DOM positions are accurate when we measure them.

**Q: Why is the ambient detection based on a 9-sentence window, not just the current sentence?**  
A: One sentence may not have enough keywords to identify a scene. A wider window gives richer context, and the 6-behind/3-ahead asymmetry means the scene reflects what has been established, not what's momentarily upcoming.

**Q: What prevents the ambient from switching every sentence?**  
A: `SceneHysteresis` — requires a scene to appear at least 2 times in the last 6 detections before it becomes the output scene.
