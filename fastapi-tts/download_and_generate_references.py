import json
import re
import urllib.request
from pathlib import Path

# Target directory for the reference files
OUTPUT_DIR = Path("/home/dark/code/project/vion-fullstack/book_references")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────
# PARSING LOGIC
# ─────────────────────────────────────────────────────────────

def split_sentences(text: str) -> list[str]:
    if not text:
        return []
        
    abbreviations = {
        "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "eg", "ie", "al",
        "col", "gen", "lt", "capt", "sgt", "st", "ave", "rd", "jan", "feb", "mar",
        "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
    }
    
    # Capture punctuation and trailing quotes/whitespace
    parts = re.split(r"([.!?]+[\s\"')\]}\u201d\u2019]*)", text)
    sentences = []
    current = ""
    
    for i in range(0, len(parts) - 1, 2):
        chunk = parts[i]
        punct = parts[i+1]
        current += chunk + punct
        
        # Rule 1 & 2: check preceding word
        words = re.findall(r"[a-zA-Z]+", chunk)
        last_word = words[-1] if words else ""
        last_word_lower = last_word.lower()
        is_period = punct.startswith(".")
        
        # Rule 1: Abbreviations
        if is_period and last_word_lower in abbreviations:
            continue
            
        # Rule 2: Initials (e.g. J. F. Kennedy)
        if is_period and len(last_word) == 1 and last_word.isupper():
            continue
            
        # Rule 3: Decimals / digits (e.g., 3.14)
        next_chunk = parts[i+2] if i + 2 < len(parts) else ""
        if is_period and next_chunk and next_chunk[0].isdigit():
            continue
            
        sentences.append(current.strip())
        current = ""
        
    if len(parts) % 2 != 0:
        current += parts[-1]
    if current.strip():
        sentences.append(current.strip())
        
    return sentences


def is_special_paragraph(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    trimmed = trimmed.strip("_* \t\n\r")
    
    if re.match(r"^\[illustration\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[frontispiece\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[image\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[cover art\]", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[page\s+\d+\]", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\*[ \t*]*\*[ \t*]*\*", trimmed):
        return True
    if re.match(r"^[-_]{3,}$", trimmed):
        return True
    return False


def get_chapter_paragraphs_structure(content: str) -> list[dict]:
    raw_paras = [p.strip() for p in content.split("\n\n") if p.strip()]
    paragraphs_struct = []
    
    for p in raw_paras:
        if is_special_paragraph(p):
            paragraphs_struct.append({
                "sentences": [],
                "isSpecial": True,
                "rawText": p
            })
        else:
            sentences = split_sentences(p)
            paragraphs_struct.append({
                "sentences": sentences,
                "isSpecial": False,
                "rawText": p
            })
            
    return paragraphs_struct


def parse_text_into_chapters(text: str, title: str, author: str) -> list[dict]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    
    start_markers = [
        "*** START OF THE PROJECT GUTENBERG",
        "*** START OF THIS PROJECT GUTENBERG",
        "*END*THE SMALL PRINT",
    ]
    end_markers = [
        "*** END OF THE PROJECT GUTENBERG",
        "*** END OF THIS PROJECT GUTENBERG",
        "End of the Project Gutenberg",
        "End of Project Gutenberg",
    ]
    
    for marker in start_markers:
        idx = text.find(marker)
        if idx != -1:
            line_end = text.find("\n", idx)
            text = text[line_end + 1:]
            break
            
    for marker in end_markers:
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
            break
            
    text = text.strip()
    
    chapter_regex = re.compile(
        r"^(CHAPTER|Chapter|chapter|BOOK|Book|PART|Part|LETTER|Letter|ACT|Act|VOLUME|Volume|CANTO|Canto|SCENE|Scene|SECTION|Section|STAVE|Stave)[ \t]+[IVXLCDM\d]+[.: \t—\-]*",
        re.MULTILINE
    )
    
    matches = []
    for match in chapter_regex.finditer(text):
        start = match.start()
        line_end = text.find("\n", start)
        heading = text[start:line_end].strip() if line_end != -1 else text[start:start+80].strip()
        matches.append((start, heading))
        
    chapters = []
    if len(matches) >= 3:
        for i in range(len(matches)):
            start = matches[i][0]
            end = matches[i+1][0] if i + 1 < len(matches) else len(text)
            content = text[start:end].strip()
            if len(content) < 50:
                continue
            chapters.append({
                "id": f"ch-{i}",
                "title": matches[i][1][:60] + "…" if len(matches[i][1]) > 60 else matches[i][1],
                "page": i + 1,
                "content": content
            })
            
        if matches[0][0] > 500:
            preface = text[:matches[0][0]].strip()
            if len(preface) > 100:
                lower = preface.lower()
                has_copyright = "copyright" in lower
                has_contents = "contents" in lower
                has_produced_by = "produced by" in lower
                sentence_count = len(re.findall(r"[.!?]\s+[A-Z\d\"'“]", preface))
                is_front_matter = (has_copyright or has_contents or has_produced_by) and sentence_count < 3
                if not is_front_matter:
                    chapters.insert(0, {
                        "id": "preface",
                        "title": "Preface",
                        "page": 0,
                        "content": preface
                    })
                    for idx, ch in enumerate(chapters):
                        ch["page"] = idx + 1
    else:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chars_per_chapter = 5000
        current_chapter = []
        current_len = 0
        ch_idx = 1
        for para in paragraphs:
            current_chapter.append(para)
            current_len += len(para)
            if current_len >= chars_per_chapter:
                chapters.append({
                    "id": f"section-{ch_idx}",
                    "title": f"Section {ch_idx}",
                    "page": ch_idx,
                    "content": "\n\n".join(current_chapter)
                })
                ch_idx += 1
                current_chapter = []
                current_len = 0
        if current_chapter:
            chapters.append({
                "id": f"section-{ch_idx}",
                "title": f"Section {ch_idx}",
                "page": ch_idx,
                "content": "\n\n".join(current_chapter)
            })
            
    if not chapters:
        chapters.append({
            "id": "full",
            "title": title,
            "page": 1,
            "content": text
        })
        
    return chapters

# ─────────────────────────────────────────────────────────────
# BOOK LIST & EXECUTION
# ─────────────────────────────────────────────────────────────

BOOKS = [
    {
        "id": "alice_in_wonderland",
        "title": "Alice's Adventures in Wonderland",
        "author": "Lewis Carroll",
        "url": "https://www.gutenberg.org/cache/epub/11/pg11.txt"
    },
    {
        "id": "frankenstein",
        "title": "Frankenstein; Or, The Modern Prometheus",
        "author": "Mary Wollstonecraft Shelley",
        "url": "https://www.gutenberg.org/cache/epub/84/pg84.txt"
    }
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
}

for book in BOOKS:
    print(f"Downloading {book['title']}...")
    try:
        req = urllib.request.Request(book["url"], headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            text = response.read().decode("utf-8")
            
        print(f"Parsing {book['title']}...")
        chapters = parse_text_into_chapters(text, book["title"], book["author"])
        
        # 1. Save Raw Chapters format (Input reference)
        raw_output = {
            "book_id": book["id"],
            "title": book["title"],
            "author": book["author"],
            "chapters": chapters
        }
        raw_file = OUTPUT_DIR / f"{book['id']}_raw_chapters.json"
        with open(raw_file, "w", encoding="utf-8") as f:
            json.dump(raw_output, f, indent=2, ensure_ascii=False)
        print(f"Saved raw chapters format to: {raw_file}")
        
        # 2. Save Parsed Paragraph/Sentence Structure format (Output reference)
        parsed_chapters = []
        # Limit to the first 5 chapters to keep the reference file size reasonable
        preview_chapters = chapters[:5]
        for ch in preview_chapters:
            parsed_chapters.append({
                "id": ch["id"],
                "title": ch["title"],
                "page": ch["page"],
                "paragraphs": get_chapter_paragraphs_structure(ch["content"])
            })
            
        parsed_output = {
            "book_id": book["id"],
            "title": book["title"],
            "author": book["author"],
            "chapters": parsed_chapters,
            "note": "This reference displays the first 5 chapters fully parsed into paragraphs and sentences."
        }
        parsed_file = OUTPUT_DIR / f"{book['id']}_parsed_structure.json"
        with open(parsed_file, "w", encoding="utf-8") as f:
            json.dump(parsed_output, f, indent=2, ensure_ascii=False)
        print(f"Saved parsed structure format to: {parsed_file}")
        
    except Exception as e:
        print(f"Failed to process {book['title']}: {e}")

print("Done processing book references.")
