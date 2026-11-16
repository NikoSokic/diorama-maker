# Needs the owner

Things only Niko can do. Nothing here blocks Phases 3–4 (they run in mock mode).

## 1. Tripo credits for Phase 5 (payment decision)

- Balance is **0 credits** (checked 2026-11-15; the key itself works).
- Phase 5 ("one real story end-to-end with live Tripo + rigging") cannot run without credits. The smallest top-up is
  **$1 = 100 credits**, which is outside the 0 € budget, so it is your call.
- What credits buy: static model 20, rigged quadruped 55 (rig 25 + 1 clip 10), fully rigged biped 95 (rig 25 + 5 clips).
  A 2-character story with one biped and one static character ≈ 115 credits; 100 credits ≈ one rigged biped, or five
  static models.
- If you do not top up: Phase 5 is finished in mock mode (bundled sample models) and the README says so. The credit
  guard already refuses to spend more than the balance.

## 2. Claude Code sign-in for the overnight runner

`overnight.log` shows on every attempt: *"this sign-in can end at any time from now until 2026-11-19 … Run `claude auth
login` now, or use `claude setup-token` for unattended jobs."* If the sign-in expires, `run_overnight.ps1` will loop
without doing any work. Run one of the two commands before the next unattended night.

(The last attempts in the log, 13–15, only hit the 5-hour usage limit; that resolves by itself.)

## 3. Before a public demo (Phase 5, not urgent)

- Un-pause the Supabase project if it has been idle for a week.
- Decide how the work reaches `main`: `main` is still at the initial commit. `phase-2-backend` (which contains all of
  Phase 1) is pushed but not merged and has no PR; `phase-1-setup` exists only on this machine.
