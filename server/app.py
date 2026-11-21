import io
import os
import secrets
import struct
import threading
import zipfile
from datetime import datetime
from functools import wraps

from flask import (Flask, abort, jsonify, redirect, render_template, request,
                   send_file, send_from_directory, session)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

import classifier
import gps_engine
import optics
import config
import db

BASE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(BASE, "data", "audio")
TPL = os.path.join(BASE, "firmware_template")
FW_SRC = os.path.join(BASE, "..", "firmware")
OPTICS_DIR = os.path.join(BASE, "optics")
os.makedirs(AUDIO, exist_ok=True)

CHIPS = {"esp32": ("esp32", "0x1000"), "esp32s3": ("esp32s3", "0x0")}
CFG_OFFSET = "0x3F0000"

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)


def process_event(eid):
    e = db.one("select * from events where id=%s", eid)
    try:
        when = e["ts"].replace(tzinfo=None)
        path = os.path.join(AUDIO, e["audio"])
        o = optics.analyze(classifier.read_wav(path))
        db.run("""update events set level=%s, crest=%s, mini_class=%s, mini_conf=%s,
               optical_depth=%s where id=%s""",
               o["level"], o["crest"], o["mini_class"], o["mini_conf"], o["optical_depth"], eid)
        r = classifier.classify(path, e["lat"], e["lon"], when)
        db.run("""update events set status='done', kind=%s, species=%s, confidence=%s,
               details=%s where id=%s""",
               r["kind"], r["species"], r["confidence"], r["details"], eid)
    except Exception as exc:
        db.run("update events set status='error', kind='Ошибка анализа', details=%s where id=%s",
               str(exc), eid)


def warmup():
    try:
        with classifier._lock:
            classifier.load_yamnet()
    except Exception:
        pass


def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get("uid"):
            return redirect("/login")
        return f(*a, **k)
    return w


def own_device(did):
    d = db.one("select * from devices where id=%s and user_id=%s", did, session["uid"])
    if not d:
        abort(404)
    return d


def num(v, default, cast=float):
    try:
        return cast(v)
    except Exception:
        return default


def form_fields(f):
    chip = f.get("chip", "esp32")
    if chip not in CHIPS:
        chip = "esp32"
    return (f.get("name", "device").strip() or "device", chip,
            num(f.get("lat"), 0.0), num(f.get("lon"), 0.0),
            f.get("wifi_ssid", ""), f.get("wifi_pass", ""),
            f.get("server_url", "").strip().rstrip("/"),
            max(1, num(f.get("listen_sec"), 10, int)),
            num(f.get("threshold"), 50, int),
            max(1, num(f.get("gain"), 1, int)),
            max(0, num(f.get("cooldown_sec"), 60, int)),
            1 if num(f.get("gps_mode"), 0, int) else 0)


@app.route("/login", methods=["GET", "POST"])
def login():
    err = None
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        pw = request.form["password"]
        if request.form.get("action") == "register":
            if db.one("select 1 as x from users where email=%s", email):
                err = "Такой email уже есть"
            else:
                session["uid"] = db.insert("insert into users(email,pw) values(%s,%s)",
                                           email, generate_password_hash(pw))
                return redirect("/")
        else:
            u = db.one("select * from users where email=%s", email)
            if u and check_password_hash(u["pw"], pw):
                session["uid"] = u["id"]
                return redirect("/")
            err = "Неверный email или пароль"
    return render_template("login.html", err=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


@app.route("/")
@login_required
def index():
    devices = db.rows("select * from devices where user_id=%s order by id", session["uid"])
    events = db.rows("""select e.*, d.name as dname from events e
                        join devices d on d.id=e.device_id
                        where d.user_id=%s order by e.id desc limit 100""", session["uid"])
    defaults = dict(name="", chip="esp32", lat="", lon="", wifi_ssid="", wifi_pass="",
                    server_url=request.host_url.rstrip("/"), listen_sec=10,
                    cooldown_sec=60, threshold=50, gain=1, gps_mode=0)
    return render_template("dashboard.html", devices=devices, events=events, d=defaults)


@app.post("/device/new")
@login_required
def device_new():
    v = form_fields(request.form)
    did = db.insert("""insert into devices(user_id,name,token,chip,lat,lon,wifi_ssid,wifi_pass,
                    server_url,listen_sec,threshold,gain,cooldown_sec,gps_mode)
                    values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    session["uid"], v[0], secrets.token_urlsafe(24), *v[1:])
    return redirect(f"/device/{did}")


@app.post("/device/<int:did>/edit")
@login_required
def device_edit(did):
    own_device(did)
    v = form_fields(request.form)
    db.run("""update devices set name=%s,chip=%s,lat=%s,lon=%s,wifi_ssid=%s,wifi_pass=%s,
           server_url=%s,listen_sec=%s,threshold=%s,gain=%s,cooldown_sec=%s,gps_mode=%s where id=%s""",
           *v, did)
    return redirect(f"/device/{did}")


@app.route("/device/<int:did>")
@login_required
def device_page(did):
    d = own_device(did)
    events = db.rows("""select e.*, d.name as dname from events e
                        join devices d on d.id=e.device_id
                        where d.id=%s order by e.id desc limit 200""", did)
    points = db.rows("select * from gps_points where device_id=%s order by ts desc limit 15", did)
    findings = db.rows("select * from findings where device_id=%s order by id desc limit 20", did)
    return render_template("device.html", d=d, events=events, points=points, findings=findings)


@app.get("/audio/<name>")
@login_required
def audio(name):
    ok = db.one("""select 1 as x from events e join devices d on d.id=e.device_id
                   where e.audio=%s and d.user_id=%s""", name, session["uid"])
    if not ok:
        abort(404)
    return send_file(os.path.join(AUDIO, os.path.basename(name)), mimetype="audio/wav")


def build_cfg(d):
    def s(v, n):
        return (v or "").encode()[: n - 1]
    raw = struct.pack("<8s64s64s128s64sIIIII", b"BIRDCFG1", s(d["wifi_ssid"], 64),
                      s(d["wifi_pass"], 64), s(d["server_url"], 128), s(d["token"], 64),
                      d["listen_sec"], d["threshold"], d["gain"], d["cooldown_sec"], d["gps_mode"])
    return raw + b"\xff" * (4096 - len(raw))


@app.get("/device/<int:did>/firmware.zip")
@login_required
def firmware(did):
    d = own_device(did)
    chip, boot = CHIPS[d["chip"]]
    tdir = os.path.join(TPL, d["chip"])
    bins = {"bootloader.bin": boot, "partitions.bin": "0x8000", "firmware.bin": "0x10000"}
    have = all(os.path.exists(os.path.join(tdir, b)) for b in bins)

    args = " ".join(f"{off} {b}" for b, off in bins.items()) if have else ""
    flash = f"{args} {CFG_OFFSET} cfg.bin".strip()
    sh = (f"#!/bin/sh\nPORT=${{1:-/dev/ttyUSB0}}\n"
          f"python3 -m esptool --chip {chip} --port $PORT --baud 460800 write_flash {flash}\n")
    bat = (f"@echo off\nset PORT=%1\nif \"%PORT%\"==\"\" set PORT=COM3\n"
           f"python -m esptool --chip {chip} --port %PORT% --baud 460800 write_flash {flash}\npause\n")
    if have:
        readme = ("1. Установите Python и выполните: pip install esptool\n"
                  "2. Подключите плату по USB (номер порта COM смотрите в Диспетчере устройств).\n"
                  "3. Windows: flash.bat COM5   |  Linux/Mac: sh flash.sh /dev/ttyUSB0\n"
                  "Если плата не прошивается - зажмите кнопку BOOT во время запуска.\n"
                  "4. Монитор порта: pip install pyserial, затем python -m serial.tools.miniterm COM5 115200\n")
    else:
        readme = ("Готовых бинарников на сервере нет, поэтому:\n"
                  "1. Установите PlatformIO (pip install platformio).\n"
                  f"2. В папке firmware: pio run -e {d['chip']} -t upload\n"
                  "3. Затем pip install esptool и запустите flash.bat / flash.sh (пишет cfg.bin).\n")
    readme += f"\nУстройство: {d['name']}  чип: {d['chip']}\n"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("cfg.bin", build_cfg(d))
        z.writestr("flash.sh", sh)
        z.writestr("flash.bat", bat)
        z.writestr("README.txt", readme)
        if have:
            for b in bins:
                z.write(os.path.join(tdir, b), b)
        src = os.path.abspath(FW_SRC)
        for root, dirs, files in os.walk(src):
            dirs[:] = [x for x in dirs if x not in (".pio", "__pycache__")]
            for fn in files:
                p = os.path.join(root, fn)
                z.write(p, os.path.join("firmware", os.path.relpath(p, src)))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"birdbox_{d['id']}.zip")


def parse_ts(s):
    try:
        t = datetime.fromisoformat(s)
    except Exception:
        return datetime.now().astimezone()
    return t if t.tzinfo else t.astimezone()


def register_gps(dev, lat, lon, accuracy, ts):
    prev = db.one("select ts, lat, lon from gps_points where device_id=%s order by ts desc limit 1", dev["id"])
    speeds = [r["speed_kmh"] for r in db.rows(
        "select speed_kmh from gps_points where device_id=%s and speed_kmh is not null order by ts desc limit 30",
        dev["id"])]
    speed, finding = gps_engine.check(prev, lat, lon, accuracy, ts, speeds)
    db.run("insert into gps_points(device_id,ts,lat,lon,accuracy,speed_kmh) values(%s,%s,%s,%s,%s,%s)",
           dev["id"], ts, lat, lon, accuracy, speed)
    if finding:
        db.run("insert into findings(device_id,ts,severity,reason,lat,lon) values(%s,%s,%s,%s,%s,%s)",
               dev["id"], ts, finding[0], finding[1], lat, lon)
    if finding is None or finding[0] != "Критическая":
        db.run("update devices set lat=%s, lon=%s where id=%s", lat, lon, dev["id"])
    return finding


@app.post("/api/gps")
def api_gps():
    body = request.get_json(silent=True) or {}
    token = request.headers.get("X-Device-Token") or body.get("token") or request.args.get("token", "")
    dev = db.one("select * from devices where token=%s", token)
    if not dev:
        return jsonify(ok=False, error="bad token"), 403
    lat = num(body.get("latitude"), None)
    lon = num(body.get("longitude"), None)
    if lat is None or lon is None:
        return jsonify(ok=False, error="no coordinates"), 400
    finding = register_gps(dev, lat, lon, num(body.get("accuracy"), 0.0), parse_ts(str(body.get("timestamp", ""))))
    db.run("update devices set last_seen=now() where id=%s", dev["id"])
    return jsonify(ok=True, finding=finding[1] if finding else None)


@app.post("/api/upload")
def upload():
    dev = db.one("select * from devices where token=%s", request.headers.get("X-Device-Token", ""))
    if not dev:
        return jsonify(error="bad token"), 403
    data = request.get_data()
    if len(data) < 1000:
        return jsonify(error="too short"), 400
    name = secrets.token_hex(8) + ".wav"
    with open(os.path.join(AUDIO, name), "wb") as f:
        f.write(data)
    lat, lon = dev["lat"], dev["lon"]
    la = num(request.headers.get("X-Lat"), None)
    lo = num(request.headers.get("X-Lon"), None)
    if la is not None and lo is not None:
        register_gps(dev, la, lo, num(request.headers.get("X-Acc"), 0.0), datetime.now().astimezone())
        lat, lon = la, lo
    db.run("update devices set last_seen=now() where id=%s", dev["id"])
    mini_names = ["тихий фон", "обычный звук", "возможный резкий звук"]
    mi = num(request.headers.get("X-Mini"), None, int)
    dev_mini = mini_names[mi] if mi in (0, 1, 2) else None
    dev_level = num(request.headers.get("X-Level"), None, int)
    dev_crest = num(request.headers.get("X-Crest"), None)
    eid = db.insert("""insert into events(device_id,lat,lon,audio,status,dev_mini,dev_level,dev_crest)
                    values(%s,%s,%s,%s,'pending',%s,%s,%s)""",
                    dev["id"], lat, lon, name, dev_mini, dev_level, dev_crest)
    threading.Thread(target=process_event, args=(eid,), daemon=True).start()
    return jsonify(ok=True)


@app.route("/optics/")
def optics_index():
    return send_from_directory(OPTICS_DIR, "index.html")


@app.route("/optics/<path:p>")
def optics_files(p):
    return send_from_directory(OPTICS_DIR, p)


if __name__ == "__main__":
    db.init_db()
    threading.Thread(target=warmup, daemon=True).start()
    app.run(host="0.0.0.0", port=5000, threaded=True)
