import json
import struct
import sys
import urllib.request
from datetime import datetime, timedelta

cfg = open(sys.argv[1], "rb").read()
_, _, _, server, token = struct.unpack("<8s64s64s128s64s", cfg[:328])
clean = lambda b: b.split(b"\0")[0].decode()
server, token = clean(server), clean(token)
start = datetime.now().astimezone() - timedelta(hours=3)


def send(lat, lon, acc, t):
    body = json.dumps(dict(latitude=lat, longitude=lon, accuracy=acc, timestamp=t.isoformat())).encode()
    req = urllib.request.Request(server + "/api/gps", data=body,
                                 headers={"X-Device-Token": token, "Content-Type": "application/json"})
    print(urllib.request.urlopen(req).read().decode())


for i in range(8):
    send(52.2 + i * 0.02, 21.0 + i * 0.02, 10, start + timedelta(minutes=10 * i))
send(52.8, 21.6, 10, start + timedelta(minutes=80))
