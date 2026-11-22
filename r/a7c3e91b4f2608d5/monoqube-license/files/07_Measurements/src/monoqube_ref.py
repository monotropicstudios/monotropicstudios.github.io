"""
MonoQube reference prototype (software model) of payload-independent runtime
metering and cryptographic attestation, following PCT/US26/39996:
  - device identity read from an identifier source outside the device (claims 5, 20, 26)
  - authorization record held by the controller, device cannot alter it (claim 1)
  - power gated only when authorized, withheld otherwise (claims 1, 6, 25, 27)
  - power measured by the pod, not reported by the device (claims 13, 19, 22, 28)
  - operating record binding identity, authorization state, power data (claims 7-12, 29)
  - continuous envelope re-evaluation with cut-off (spec, key point 4)
  - cryptographically verifiable summary for an external verifier (spec, key point 6)

This is a software reference model run on a general-purpose server. In the
production unit the controller and sensors are separate hardware; here they are
a separate OS process. Sensor readings come from a modeled sensor (see Sensor).
"""
import hashlib, json, os, time, struct
from dataclasses import dataclass, field
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature

def canon(d):  # canonical bytes for hashing
    return json.dumps(d, sort_keys=True, separators=(",", ":")).encode()

GENESIS = "0" * 64

@dataclass
class AuthRecord:
    device_id: str
    device_class: str
    max_watts: float
    permitted_s: float
    trust_tier: int = 1

class IdentifierReader:
    """Stands in for an RFID/EEPROM tag reader in the bay. Reads a tag value that
    is physically attached to the device; the device's software has no path to it."""
    def __init__(self, tag_map): self.tag_map = dict(tag_map)
    def read(self, bay): return self.tag_map.get(bay)

class Ledger:
    """Append-only, hash-chained operating record with signed checkpoints."""
    def __init__(self, key: Ed25519PrivateKey, pod_id="POD-REF-1", sign_every=1):
        self.key, self.pod_id, self.sign_every = key, pod_id, sign_every
        self.records, self.head, self.seq = [], GENESIS, 0
    def append(self, body: dict, sign=False):
        rec = {"pod": self.pod_id, "seq": self.seq, "prev": self.head, **body}
        h = hashlib.sha256(canon(rec)).hexdigest()
        rec["hash"] = h
        if sign or (self.sign_every and self.seq % self.sign_every == 0 and body.get("type") == "checkpoint"):
            rec["sig"] = self.key.sign(bytes.fromhex(h)).hex()
        self.records.append(rec); self.head = h; self.seq += 1
        return rec
    def checkpoint(self, t_ns):
        return self.append({"type": "checkpoint", "t_ns": t_ns, "count": self.seq}, sign=True)

def verify(records, pub: Ed25519PublicKey, last_known_checkpoint=None):
    """Returns (ok, reason). External verifier view: needs only public key and,
    optionally, the last checkpoint (seq, hash) it received from the pod."""
    prev, t_last = GENESIS, -1
    if not records: return False, "empty"
    for i, r in enumerate(records):
        if r.get("seq") != i: return False, f"seq@{i}"
        if r.get("prev") != prev: return False, f"chain@{i}"
        body = {k: v for k, v in r.items() if k not in ("hash", "sig")}
        if hashlib.sha256(canon(body)).hexdigest() != r.get("hash"): return False, f"hash@{i}"
        if "sig" in r:
            try: pub.verify(bytes.fromhex(r["sig"]), bytes.fromhex(r["hash"]))
            except (InvalidSignature, ValueError): return False, f"sig@{i}"
        t = r.get("t_ns", t_last)
        if t < t_last: return False, f"time@{i}"
        t_last = t; prev = r["hash"]
    if records[-1].get("type") != "checkpoint" or "sig" not in records[-1]:
        return False, "unsigned-tail"
    if last_known_checkpoint:
        s, h = last_known_checkpoint
        if s >= len(records) or records[s]["hash"] != h: return False, "rollback"
    return True, "ok"

class Sensor:
    """Modeled branch-circuit sensor: samples true power with gain error and
    Gaussian noise expressed as a fraction of reading, then quantizes like an ADC."""
    def __init__(self, rng, noise_frac=0.005, gain_err=0.0, adc_bits=16, full_scale_w=10000.0):
        self.rng, self.noise, self.gain = rng, noise_frac, gain_err
        self.lsb = full_scale_w / (2 ** adc_bits)
    def sample(self, true_w):
        v = true_w * (1 + self.gain) + self.rng.gauss(0, self.noise * true_w)
        return round(v / self.lsb) * self.lsb

class RuntimeController:
    def __init__(self, auth_db, reader, ledger, sensor):
        self.auth = {a.device_id: a for a in auth_db}
        self.reader, self.ledger, self.sensor = reader, ledger, sensor
        self.gate_closed = {}
    def insert(self, bay, t_ns):
        did = self.reader.read(bay)
        a = self.auth.get(did)
        state = "authorized" if a else "unauthorized"
        self.gate_closed[bay] = bool(a)
        self.ledger.append({"type": "authz", "t_ns": t_ns, "bay": bay, "device": did,
                            "state": state, "gate": "closed" if a else "open"})
        return bool(a)
    def window(self, bay, t_ns, samples_w, dt_s):
        """Record one metering window computed only from pod-side samples."""
        did = self.reader.read(bay); a = self.auth.get(did)
        if not self.gate_closed.get(bay):
            return None
        e_j = sum((samples_w[i] + samples_w[i+1]) / 2 * dt_s for i in range(len(samples_w)-1))
        peak = max(samples_w)
        rec = self.ledger.append({"type": "meter", "t_ns": t_ns, "bay": bay, "device": did,
                                  "energy_mj": round(e_j * 1000), "peak_mw": round(peak * 1000),
                                  "n": len(samples_w)})
        if a and peak > a.max_watts:
            self.gate_closed[bay] = False
            self.ledger.append({"type": "cutoff", "t_ns": t_ns, "bay": bay, "device": did,
                                "reason": "envelope", "gate": "open"})
        return rec

def new_key(seed: bytes = None):
    if seed: return Ed25519PrivateKey.from_private_bytes(hashlib.sha256(seed).digest())
    return Ed25519PrivateKey.generate()
