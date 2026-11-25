# 🪔 Shagun Ledger · शगुन बही

**Speak a wedding gift in Hindi or English, get a clean ledger, and send every guest a thank-you note in their own language.**

Built at **Festive Hacks × WeAreDevelopers Conference India** (BIEC Bengaluru, 25 Nov 2026) by team **TheAdaply**: Shine Gupta and Akash.

## The festive problem

During shaadi season, someone in the family (usually a cousin with a notebook) sits by the stage writing down every *lifafa*:
"Sharma uncle, 2100", "Gupta parivar, 5100 + saree". The notebook gets lost, nobody can read the handwriting, totals
don't match, and months later the family still hasn't thanked half the guests. Some guests are best thanked in Hindi,
some in Tamil, some in English.

Shagun Ledger replaces the notebook:

1. **Speak or type the entry** in Hindi, Hinglish or English: `Sharma uncle ne 2100 diye`, `मेहता जी ने ११०० रुपये दिए`.
2. **Sarvam AI** transcribes the audio (saarika STT) and extracts `{guest, amount, gift, relation, language}` (sarvam-m).
   An offline rule-based parser handles Devanagari digits, "do hazaar ek sau" style number words, and gift words, so the app still works without a key.
3. The **ledger** keeps a running total, a count, and which guests are still waiting on a thank-you.
4. The **thank-you generator** writes a note and translates it (Sarvam mayura) into the guest's language.
5. The **RSVP tracker** keeps the confirmed and maybe headcount for the caterer.
6. **Flagsmith** flags switch features on and off live during the event (voice entry, the thank-you generator, RSVP, the language list), with no redeploy.
7. **NudgeBee** watches the deployed service on Kubernetes (health probes, Prometheus metrics, events), and the app reads NudgeBee recommendations through its API.

## Quick start (about 2 minutes)

Requirements: Node.js 20.6 or newer. There are no npm dependencies.

```bash
git clone https://github.com/Shine-5705/shagun-ledger && cd shagun-ledger
cp .env.example .env        # fill in the keys (all optional, see below)
npm start                   # → http://localhost:8787
npm test                    # parser tests
```

With no keys at all, the app still runs: it uses the rule-based parser, the template thank-you notes and default flags.
The header pills show which sponsor integrations are live.

| Env var | Where to get it | What it unlocks |
|---|---|---|
| `SARVAM_API_KEY` | https://dashboard.sarvam.ai (free credits) | Voice entry (STT), LLM parsing, translated thank-yous, TTS |
| `FLAGSMITH_ENVIRONMENT_KEY` | app.flagsmith.com → Environment → Settings → Keys | Remote feature flags and config |
| `NUDGEBEE_API_TOKEN` | NudgeBee → avatar → API Tokens (Platform) | `/api/ops` reads NudgeBee recommendations |

### Flagsmith setup

Create these features in your Flagsmith environment (the names must match):

| Feature | Type | Example value | Effect |
|---|---|---|---|
| `voice_entry` | flag | n/a | Shows or hides the 🎙️ Speak button; the `/api/stt` endpoint refuses requests when it's off |
| `thank_you_generator` | flag | n/a | Shows or hides the thank-you card; the endpoint is gated too |
| `rsvp_tracker` | flag | n/a | Shows or hides the RSVP tracker |
| `languages` | remote config | `hi-IN,en-IN,ta-IN,bn-IN` | Languages offered for thank-you notes |
| `shagun_suggestion` | remote config | `501,1100,2100,5100` | Reserved for quick-pick amounts |

The server polls Flagsmith every 15 s and the UI refreshes every 5 s, so toggling a flag in the dashboard changes the
running app within about 20 s.

### Run on Kubernetes with NudgeBee

```bash
docker build -t ghcr.io/shine-5705/shagun-ledger:latest .     # or use the image built by .github/workflows/container.yml
kubectl apply -f deploy/k8s/shagun-ledger.yaml                 # edit the Secret first
```

Install the NudgeBee agent on the cluster (see https://docs.nudgebee.com). NudgeBee then picks up the workload's events,
restarts, probe failures and resource usage. `/metrics` exposes the app's own counters (requests, errors, Sarvam calls,
Sarvam errors, entries added) in Prometheus format. Set `NUDGEBEE_API_TOKEN` and `/api/ops` returns NudgeBee's
`recommendations_list` (JSON-RPC at `/api/rpc`) next to the local counters.

## How each sponsor tool is used

- **Sarvam AI** (core of the product): `saarika:v2.5` speech-to-text with `language_code=unknown`, so the speaker doesn't
  have to pick a language; `sarvam-m` chat completions to turn free-form Hinglish into structured JSON; `mayura:v1` to
  translate the thank-you note into the guest's language; `bulbul:v2` text-to-speech (`/api/tts`) for read-aloud notes.
  Every call goes through the server, so the key never reaches the browser.
- **Flagsmith** (live control on the wedding day): feature flags gate voice entry, the thank-you generator and RSVP on
  both the UI and the API, and remote config sets the language list. If the venue Wi-Fi is bad, or Sarvam credits run
  low, the family can turn voice entry off from a phone and keep typing.
- **NudgeBee** (ops): the app ships as a container with health and readiness probes, resource limits and a Prometheus
  `/metrics` endpoint, so it can be monitored and troubleshot by NudgeBee on Kubernetes. The `/api/ops` endpoint pulls
  NudgeBee recommendations through its API with a bearer token.

## Architecture

```
Browser (public/index.html, parse.js)
   │  fetch /api/*
   ▼
server.js (Node, zero deps) ──► Sarvam AI   (STT, LLM parse, translate, TTS)
   │                        ──► Flagsmith   (GET /api/v1/flags/, 15 s cache, safe defaults)
   │                        ──► NudgeBee    (JSON-RPC recommendations_list)
   ├─ data/ledger.json (entries + RSVPs)
   └─ /healthz, /metrics  ◄── Kubernetes probes / Prometheus / NudgeBee agent
```

`public/` also works as a static page with no server (for example on GitHub Pages). In that mode it uses the rule-based
parser and template notes, saves data in localStorage, and labels itself "static demo mode".

## Demo video

[docs/demo.mp4](docs/demo.mp4) (77 s, recorded headless with Playwright using `scripts/record-demo.py`, with no sponsor keys set, so it shows the offline fallbacks and default flags).

## Honest status

- Built today (25 Nov 2026) at Festive Hacks. No code was copied from earlier projects; only general patterns we've used
  before (a zero-dependency Node server and a Playwright demo recording) were reused.
- Sarvam, Flagsmith and NudgeBee integrations are written against their public APIs and switch on as soon as their
  keys are set. The demo video says which ones were live while it was recorded.
- No usage numbers or accuracy figures are claimed. The parser tests in `scripts/test-parse.js` are the only measurement.

## License

MIT, © 2026 Shine Gupta and Akash (TheAdaply)
