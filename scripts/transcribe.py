"""Transcribe an audio file (e.g. a Discord voice message) to text.

Primary: Groq cloud Whisper (whisper-large-v3) — best accuracy on TCG set names.
Fallback: local faster-whisper (small.en) if Groq key is missing or the call fails
(offline, rate-limited, etc). ffmpeg must be on PATH (it is).

Usage: python scripts/transcribe.py <audio_path>
Reads GROQ_API_KEY from the environment or .env.local. Prints the transcript.
"""
import os
import sys


def load_key():
    if os.environ.get("GROQ_API_KEY"):
        return
    for fn in (".env.local", ".env"):
        try:
            with open(fn, encoding="utf-8") as fh:
                for line in fh:
                    if line.startswith("GROQ_API_KEY="):
                        os.environ["GROQ_API_KEY"] = line.split("=", 1)[1].strip()
                        return
        except FileNotFoundError:
            pass


def groq_transcribe(path, model="whisper-large-v3"):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    import requests
    with open(path, "rb") as f:
        resp = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (os.path.basename(path), f)},
            data={"model": model, "response_format": "text"},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.text.strip()


def local_transcribe(path, model="small.en"):
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="cpu", compute_type="int8")
    segments, _info = m.transcribe(path, beam_size=1, vad_filter=True)
    return "".join(seg.text for seg in segments).strip()


def main():
    if len(sys.argv) < 2:
        print("usage: python scripts/transcribe.py <audio_path>", file=sys.stderr)
        sys.exit(1)
    path = sys.argv[1]
    load_key()
    try:
        text = groq_transcribe(path)
        if text:
            print(text)
            return
    except Exception as e:
        sys.stderr.write(f"groq transcription failed ({e}); falling back to local whisper\n")
    print(local_transcribe(path))


if __name__ == "__main__":
    main()
