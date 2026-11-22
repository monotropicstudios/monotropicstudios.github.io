"""Noise floor for the overhead test, and a 60 s exposure run."""
import statistics as st, json, os
from bench import *
if __name__ == "__main__":
    a, b = [], []
    for r in range(6):
        a += run_overhead(False, False)[0][2:]; b += run_overhead(False, False)[0][2:]
    floor = round(100*(st.median(b)-st.median(a))/st.median(a), 2)
    t, m = run_overhead(True, False, iters=780)
    raw = open(os.path.join(OUT, "overhead_ledger.json"), "rb").read(); recs = json.loads(raw)
    save("overhead_extra", {"noise_floor_baseline_vs_baseline_pct": floor, "samples_each": len(a),
        "long_run": {"payload_iters": 780, "seconds_approx": round(sum(t), 1), "ledger_records": len(recs),
        "ledger_bytes_scanned": len(raw), "canary_hex_hits": raw.count(CANARY.encode()),
        "canary_prefix16_hits": raw.count(CANARY[:16].encode()), "meter": m}})
