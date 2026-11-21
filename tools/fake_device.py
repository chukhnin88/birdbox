import io
import json
import math
import struct
import sys
import urllib.request
import wave


def synth():
    rate = 16000
    frames = bytearray()
    for i in range(rate * 4):
        t = i / rate
        f = 3000 + 1500 * math.sin(2 * math.pi * 6 * t)
        a = 0.4 if (t % 1.0) < 0.3 else 0.02
        frames += struct.pack("<h", int(a * 32767 * math.sin(2 * math.pi * f * t)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def clean(b):
    return b.split(b"\0")[0].decode()


cfg = open(sys.argv[1], "rb").read()
magic, ssid, pw, server, token, listen, thr, gain, cool, gpsm = struct.unpack("<8s64s64s128s64sIIIII", cfg[:348])
server = clean(server)
token = clean(token)
mode = sys.argv[2]

if mode == "gps":
    body = json.dumps({"latitude": float(sys.argv[3]), "longitude": float(sys.argv[4]), "accuracy": 8}).encode()
    req = urllib.request.Request(server + "/api/gps", data=body,
                                 headers={"X-Device-Token": token, "Content-Type": "application/json"})
else:
    audio = synth() if mode == "synth" else open(mode, "rb").read()
    headers = {"X-Device-Token": token, "Content-Type": "audio/wav",
               "X-Mini": "2", "X-Level": "60", "X-Crest": "3.1"}
    if len(sys.argv) >= 5:
        headers["X-Lat"] = sys.argv[3]
        headers["X-Lon"] = sys.argv[4]
        headers["X-Acc"] = "8"
    req = urllib.request.Request(server + "/api/upload", data=audio, headers=headers)

print(urllib.request.urlopen(req).read().decode())
