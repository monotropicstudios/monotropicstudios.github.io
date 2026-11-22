"""Reproducible benchmarks for the MonoQube reference prototype.
Run: python3 bench.py  (writes ../results/*.json)"""
import os, sys, json, time, math, random, statistics as st, hashlib, copy, platform, subprocess, multiprocessing as mp
sys.path.insert(0, os.path.dirname(__file__))
from monoqube_ref import *
OUT = os.path.join(os.path.dirname(__file__), "..", "results"); os.makedirs(OUT, exist_ok=True)
SEED = 20261122
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs)-1, int(p/100*len(xs)))]
def save(name, obj):
    json.dump(obj, open(os.path.join(OUT, name + ".json"), "w"), indent=2); print(name, json.dumps(obj)[:600]); sys.stdout.flush()

def env():
    import cryptography
    return {"date_local": time.strftime("%Y-%m-%d %H:%M %Z"), "python": platform.python_version(),
            "cryptography": cryptography.__version__, "cpu": subprocess.getoutput("lscpu | grep -m1 'Model name'").split(":")[-1].strip(),
            "cores": os.cpu_count(), "kernel": platform.release(), "seed": SEED}

# 1. attestation sign / verify time
def bench_crypto(n=20000):
    k = new_key(b"bench"); pub = k.public_key(); msg = hashlib.sha256(b"x").digest()
    s_t, v_t = [], []
    for i in range(n):
        m = hashlib.sha256(i.to_bytes(8, "big")).digest()
        t0 = time.perf_counter_ns(); sig = k.sign(m); t1 = time.perf_counter_ns(); pub.verify(sig, m); t2 = time.perf_counter_ns()
        s_t.append(t1 - t0); v_t.append(t2 - t1)
    f = lambda xs: {"p50_us": round(pct(xs, 50)/1000, 1), "p99_us": round(pct(xs, 99)/1000, 1), "mean_us": round(st.mean(xs)/1000, 1)}
    return {"alg": "Ed25519", "n": n, "sign": f(s_t), "verify": f(v_t), "sig_bytes": 64}

# 2. throughput
def bench_throughput(n=200000):
    k = new_key(b"tp"); led = Ledger(k)
    t0 = time.perf_counter()
    for i in range(n):
        led.append({"type": "meter", "t_ns": i, "bay": 1, "device": "DEV-A", "energy_mj": 1234567, "peak_mw": 2000000, "n": 1000})
        if i % 1000 == 999: led.checkpoint(i)
    led.checkpoint(n); t1 = time.perf_counter()
    ok, why = verify(led.records, k.public_key()); t2 = time.perf_counter()
    led2 = Ledger(k); m = 50000; t3 = time.perf_counter()
    for i in range(m): led2.append({"type": "meter", "t_ns": i, "bay": 1, "device": "DEV-A", "energy_mj": 1, "peak_mw": 1, "n": 1}, sign=True)
    t4 = time.perf_counter()
    rec_bytes = len(canon(led.records[5]))
    return {"records": len(led.records), "append_hash_chain_per_s": round(len(led.records)/(t1-t0)),
            "append_every_record_signed_per_s": round(m/(t4-t3)), "verify_per_s": round(len(led.records)/(t2-t1)),
            "verify_ok": ok, "record_bytes_json": rec_bytes, "single_core": True}

# 3. tamper detection
def build_ledger(rng, key, n_windows=2000, cp_every=100):
    led = Ledger(key)
    led.append({"type": "authz", "t_ns": 0, "bay": 1, "device": "DEV-A", "state": "authorized", "gate": "closed"})
    for i in range(n_windows):
        led.append({"type": "meter", "t_ns": (i+1)*10**9, "bay": 1, "device": "DEV-A",
                    "energy_mj": rng.randint(10**5, 10**7), "peak_mw": rng.randint(10**5, 10**7), "n": 1000})
        if (i+1) % cp_every == 0: led.checkpoint((i+1)*10**9)
    if led.records[-1]["type"] != "checkpoint": led.checkpoint((n_windows+1)*10**9)
    return led

def rechain(recs, from_i, key=None):
    """Attacker who recomputes hashes (and optionally re-signs with a key it holds)."""
    prev = recs[from_i-1]["hash"] if from_i > 0 else GENESIS
    for i in range(from_i, len(recs)):
        r = recs[i]; r["seq"] = i; r["prev"] = prev
        body = {k: v for k, v in r.items() if k not in ("hash", "sig")}
        r["hash"] = hashlib.sha256(canon(body)).hexdigest()
        if "sig" in r:
            r["sig"] = key.sign(bytes.fromhex(r["hash"])).hex() if key else r["sig"]
        prev = r["hash"]
    return recs

def bench_tamper(trials=1000):
    rng = random.Random(SEED); key = new_key(b"pod"); pub = key.public_key(); evil = new_key(b"attacker")
    base = build_ledger(rng, key); n = len(base.records)
    cps = [i for i, r in enumerate(base.records) if r["type"] == "checkpoint"]
    last_cp = (cps[-1], base.records[cps[-1]]["hash"])
    meters = [i for i, r in enumerate(base.records) if r["type"] == "meter"]
    faults = {}
    def run(name, fn, use_lkc=False):
        det = 0
        for _ in range(trials):
            recs = copy.deepcopy(base.records); recs = fn(recs)
            ok, _ = verify(recs, pub, last_cp if use_lkc else None)
            det += (not ok)
        faults[name] = {"trials": trials, "detected": det, "rate_pct": round(100*det/trials, 2)}
    def mutate(recs, re=False, k=None):
        i = rng.choice(meters); recs[i]["energy_mj"] = int(recs[i]["energy_mj"] * rng.uniform(0.5, 0.99))
        return rechain(recs, i, k) if re else recs
    run("value_edit_naive", lambda r: mutate(r))
    run("value_edit_rechained", lambda r: mutate(r, True))
    run("value_edit_rechained_resigned_wrong_key", lambda r: mutate(r, True, evil))
    def delete(recs, re=True):
        i = rng.choice(meters); del recs[i]; return rechain(recs, i) if re else recs
    run("delete_record_naive", lambda r: delete(r, False))
    run("delete_record_rechained", lambda r: delete(r, True))
    def insert(recs):
        i = rng.choice(meters); fake = dict(recs[i]); fake.pop("sig", None); recs.insert(i+1, fake); return rechain(recs, i+1)
    run("insert_forged_record_rechained", insert)
    def swap(recs):
        i = rng.choice(meters[:-1]); j = i+1
        recs[i], recs[j] = recs[j], recs[i]; return rechain(recs, i)
    run("reorder_records_rechained", swap)
    def replay(recs):
        i = rng.choice(meters); recs.insert(i+1, copy.deepcopy(recs[i])); return recs
    run("replay_duplicate_naive", replay)
    def backdate(recs):
        i = rng.choice(meters[1:]); recs[i]["t_ns"] = recs[i-1]["t_ns"] - 1; return rechain(recs, i)
    run("backdate_timestamp_rechained", backdate)
    def forge_sig(recs):
        i = rng.choice(cps); recs[i]["sig"] = evil.sign(bytes.fromhex(recs[i]["hash"])).hex(); return recs
    run("forged_signature_wrong_key", forge_sig)
    def truncate(recs):
        c = rng.choice(cps[:-1]); return recs[:c+1]
    run("truncate_to_earlier_checkpoint_no_external_copy", truncate, False)
    run("truncate_to_earlier_checkpoint_with_external_last_checkpoint", truncate, True)
    faults["_note"] = ("Attacker model: full write access to the stored record, can recompute SHA-256 chain, "
                       "does not hold the pod signing key. Truncation without an external copy of the last checkpoint is "
                       "undetectable by design and is listed to show the limit.")
    # false positive check
    fp = sum(not verify(build_ledger(random.Random(s), key).records, pub)[0] for s in range(200))
    faults["clean_ledgers_false_positive"] = {"trials": 200, "flagged": fp}
    return faults

# 4. accuracy vs ground truth
def bench_accuracy(sessions=200, seconds=60, fs=1000, noise=0.005, gain_sd=0.0):
    rng = random.Random(SEED); errs, derr = [], []
    for s in range(sessions):
        segs = []; t = 0.0
        while t < seconds:
            d = min(rng.uniform(2, 15), seconds - t); segs.append((t, t+d, rng.uniform(200, 6000))); t += d
        A = rng.uniform(0, 150); f = rng.uniform(0.2, 5.0); ph = rng.uniform(0, 2*math.pi)
        true_e = sum((b-a)*p for a, b, p in segs) + A*(-math.cos(2*math.pi*f*seconds+ph) + math.cos(ph))/(2*math.pi*f)
        sen = Sensor(rng, noise_frac=noise, gain_err=rng.gauss(0, gain_sd))
        n = seconds*fs; dt = 1/fs; k = 0; samples = []
        for i in range(n+1):
            tt = i*dt
            while k < len(segs)-1 and tt >= segs[k][1]: k += 1
            samples.append(sen.sample(segs[k][2] + A*math.sin(2*math.pi*f*tt+ph)))
        # meter in 1 s windows exactly as RuntimeController.window does (shared boundary samples)
        e = 0.0
        for w in range(seconds):
            win = samples[w*fs:(w+1)*fs+1]
            e += sum((win[i]+win[i+1])/2*dt for i in range(len(win)-1))
        errs.append(abs(e-true_e)/true_e*100)
        derr.append(abs((len(samples)-1)*dt - seconds))
    return {"sessions": sessions, "session_s": seconds, "sample_hz": fs, "modeled_sensor_noise_pct_of_reading": noise*100,
            "modeled_gain_error_sd_pct": gain_sd*100, "adc_bits": 16,
            "energy_abs_error_pct": {"mean": round(st.mean(errs), 4), "p95": round(pct(errs, 95), 4), "max": round(max(errs), 4)},
            "duration_abs_error_s_max": max(derr)}

# 5/6. overhead on a real payload + payload exposure
CANARY = hashlib.sha256(b"payload-secret-canary").hexdigest()
def payload(core, iters, q):
    os.sched_setaffinity(0, {core})
    buf = (CANARY.encode() * (32*2**20 // 64))  # 32 MB of payload data containing the canary
    times = []
    for _ in range(iters):
        t0 = time.perf_counter(); hashlib.sha256(buf).digest(); hashlib.sha3_256(buf).digest(); times.append(time.perf_counter()-t0)
    q.put(times)

def meter(core, target_pid, stop, q, ledger_path):
    os.sched_setaffinity(0, {core})
    key = new_key(b"pod-overhead"); led = Ledger(key)
    rc = RuntimeController([AuthRecord("DEV-A", "cpu", 10000, 3600)], IdentifierReader({1: "DEV-A"}), led, Sensor(random.Random(SEED)))
    rc.insert(1, time.monotonic_ns())
    hz = os.sysconf("SC_CLK_TCK"); last = None; win = []; t_next = time.perf_counter(); c0 = time.process_time(); w0 = time.perf_counter()
    while not stop.is_set():
        try:  # OS-side counter for the payload process; stands in for a current clamp. Payload never writes to it.
            f = open(f"/proc/{target_pid}/stat").read().split(); ticks = int(f[13]) + int(f[14])
        except Exception: break
        now = time.perf_counter()
        util = 0.0 if last is None else min(1.0, (ticks-last[0])/hz/max(1e-6, now-last[1]))
        last = (ticks, now); win.append(rc.sensor.sample(150 + 250*util))
        if len(win) >= 1001:
            rc.window(1, time.monotonic_ns(), win, 0.001); led.checkpoint(time.monotonic_ns()); win = win[-1:]
        t_next += 0.001; time.sleep(max(0, t_next - time.perf_counter()))
    led.checkpoint(time.monotonic_ns())
    cpu = time.process_time()-c0; wall = time.perf_counter()-w0
    json.dump(led.records, open(ledger_path, "w"))
    q.put({"meter_cpu_pct_of_one_core": round(100*cpu/wall, 2), "records": len(led.records),
           "verify_ok": verify(led.records, key.public_key())[0]})

def run_overhead(meter_on, same_core, iters=15):
    q = mp.Queue(); mq = mp.Queue(); stop = mp.Event()
    p = mp.Process(target=payload, args=(2, iters, q)); p.start()
    m = None
    if meter_on:
        m = mp.Process(target=meter, args=(2 if same_core else 5, p.pid, stop, mq, os.path.join(OUT, "overhead_ledger.json"))); m.start()
    times = q.get(); p.join(); mres = None
    if m: stop.set(); mres = mq.get(); m.join()
    return times, mres

def bench_overhead(rounds=6):
    res = {"baseline": [], "meter_other_core": [], "meter_same_core": []}; mstats = []
    for r in range(rounds):  # interleaved to cancel drift
        res["baseline"] += run_overhead(False, False)[0][2:]
        t, m = run_overhead(True, False); res["meter_other_core"] += t[2:]; mstats.append(("other", m))
        t, m = run_overhead(True, True); res["meter_same_core"] += t[2:]; mstats.append(("same", m))
    b = st.median(res["baseline"])
    out = {"payload": "SHA-256 + SHA3-256 over a 32 MB buffer per iteration", "samples_per_condition": len(res["baseline"]),
           "baseline_median_ms": round(b*1000, 2)}
    for k in ("meter_other_core", "meter_same_core"):
        mm = st.median(res[k]); out[k] = {"median_ms": round(mm*1000, 2), "latency_overhead_pct": round(100*(mm-b)/b, 2)}
    out["meter_cpu_pct_of_one_core"] = {"other_core": round(st.mean(m["meter_cpu_pct_of_one_core"] for c, m in mstats if c == "other"), 2),
                                        "same_core": round(st.mean(m["meter_cpu_pct_of_one_core"] for c, m in mstats if c == "same"), 2)}
    out["meter_ledgers_verified"] = all(m["verify_ok"] for _, m in mstats)
    out["sample_hz"] = 1000; out["signed_checkpoint_hz"] = 1
    # payload exposure scan
    raw = open(os.path.join(OUT, "overhead_ledger.json"), "rb").read()
    recs = json.loads(raw); fields = sorted({k for r in recs for k in r})
    out["exposure"] = {"ledger_bytes_scanned": len(raw), "canary_hex_hits": raw.count(CANARY.encode()),
                       "canary_prefix16_hits": raw.count(CANARY[:16].encode()), "record_fields": fields,
                       "payload_content_bytes_in_record": 0 if raw.count(CANARY[:16].encode()) == 0 else "FOUND"}
    return out

if __name__ == "__main__":
    which = sys.argv[1:] or ["env", "crypto", "throughput", "tamper", "accuracy", "accuracy_gain", "overhead"]
    if "env" in which: save("env", env())
    if "crypto" in which: save("crypto", bench_crypto())
    if "throughput" in which: save("throughput", bench_throughput())
    if "tamper" in which: save("tamper", bench_tamper())
    if "accuracy" in which: save("accuracy", bench_accuracy())
    if "accuracy_gain" in which: save("accuracy_with_gain_error", bench_accuracy(sessions=100, gain_sd=0.002))
    if "overhead" in which: save("overhead", bench_overhead())
