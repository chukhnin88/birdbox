import csv
import threading
import wave
import numpy as np

CATEGORIES = [
    ("Птица", 1.0, [
        "Bird", "Bird vocalization, bird call, bird song", "Chirp, tweet", "Squawk",
        "Pigeon, dove", "Coo", "Crow", "Caw", "Owl", "Hoot", "Gull, seagull", "Duck",
        "Quack", "Goose", "Honk", "Chicken, rooster", "Cluck", "Crowing, cock-a-doodle-doo",
        "Turkey", "Gobble", "Fowl", "Bird flight, flapping wings"]),
    ("Легковой автомобиль", 1.0, [
        "Car", "Car passing by", "Vehicle horn, car horn, honking", "Toot", "Skidding",
        "Tire squeal", "Accelerating, revving, vroom"]),
    ("Грузовик / автобус", 1.0, [
        "Truck", "Bus", "Air brake", "Air horn, truck horn", "Reversing beeps",
        "Ice cream truck, ice cream van"]),
    ("Мотоцикл", 1.0, ["Motorcycle"]),
    ("Самолёт", 1.0, [
        "Aircraft", "Aircraft engine", "Jet engine", "Propeller, airscrew",
        "Fixed-wing aircraft, airplane"]),
    ("Вертолёт", 1.0, ["Helicopter"]),
    ("Поезд", 1.0, [
        "Train", "Railroad car, train wagon", "Train wheels squealing", "Train horn",
        "Rail transport", "Subway, metro, underground", "Train whistle"]),
    ("Судно / лодка", 1.0, ["Boat, Water vehicle", "Motorboat, speedboat", "Ship"]),
    ("Велосипед", 1.0, ["Bicycle", "Bicycle bell"]),
    ("Транспорт (тип не определён)", 0.9, [
        "Vehicle", "Motor vehicle (road)", "Engine", "Light engine (high frequency)",
        "Medium engine (mid frequency)", "Heavy engine (low frequency)", "Idling",
        "Engine knocking", "Engine starting"]),
    ("Сирена", 1.0, [
        "Siren", "Civil defense siren", "Emergency vehicle", "Police car (siren)",
        "Ambulance (siren)", "Fire engine, fire truck (siren)"]),
    ("Человек", 1.0, [
        "Speech", "Male speech, man speaking", "Female speech, woman speaking",
        "Child speech, kid speaking", "Conversation", "Shout", "Yell", "Laughter",
        "Crowd", "Walk, footsteps", "Whistling", "Human voice"]),
    ("Собака", 1.0, ["Dog", "Bark", "Howl", "Bow-wow"]),
    ("Кошка", 1.0, ["Cat", "Meow", "Purr"]),
    ("Ветер / дождь / гроза", 1.0, [
        "Wind", "Rustling leaves", "Wind noise (microphone)", "Rain", "Raindrop",
        "Rain on surface", "Thunderstorm", "Thunder"]),
    ("Выстрел / взрыв", 1.0, [
        "Gunshot, gunfire", "Machine gun", "Explosion", "Fireworks", "Firecracker", "Boom"]),
    ("Инструмент / пила", 1.0, [
        "Chainsaw", "Power tool", "Drill", "Sawing", "Lawn mower", "Hammer"]),
]

MIN_SCORE = 0.2
BIRD_CHECK_SCORE = 0.15
BIRD_CONFIDENT = 0.4

_lock = threading.Lock()
_yamnet = None
_names = None
_groups = None
_birdnet = None


def load_yamnet():
    global _yamnet, _names, _groups
    if _yamnet is not None:
        return
    import tensorflow_hub as hub
    model = hub.load("https://tfhub.dev/google/yamnet/1")
    path = model.class_map_path().numpy().decode("utf-8")
    with open(path, newline="", encoding="utf-8") as f:
        names = [row["display_name"] for row in csv.DictReader(f)]
    index = {n: i for i, n in enumerate(names)}
    groups = []
    for label, weight, members in CATEGORIES:
        ids = [index[m] for m in members if m in index]
        if ids:
            groups.append((label, weight, ids))
    _names = names
    _groups = groups
    _yamnet = model


def read_wav(path):
    with wave.open(path, "rb") as w:
        channels = w.getnchannels()
        raw = w.readframes(w.getnframes())
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data


def score_categories(data):
    scores = _yamnet(data)[0].numpy()
    cats = [(label, float(scores[:, ids].max()) * weight) for label, weight, ids in _groups]
    cats.sort(key=lambda x: -x[1])
    mean = scores.mean(axis=0)
    top = np.argsort(-mean)[:5]
    top_text = ", ".join(f"{_names[i]} {mean[i]:.2f}" for i in top)
    return cats, top_text


def birdnet_species(path, lat, lon, when):
    global _birdnet
    from birdnetlib import Recording
    from birdnetlib.analyzer import Analyzer
    if _birdnet is None:
        _birdnet = Analyzer()
    rec = Recording(_birdnet, path, lat=lat, lon=lon, date=when, min_conf=0.25)
    rec.analyze()
    best = {}
    for d in rec.detections:
        key = (d["common_name"], d["scientific_name"])
        best[key] = max(best.get(key, 0.0), d["confidence"])
    return sorted(best.items(), key=lambda x: -x[1])


def classify(path, lat, lon, when):
    with _lock:
        load_yamnet()
        data = read_wav(path)
        cats, top_text = score_categories(data)
        scores = dict(cats)
        kind, score = cats[0]
        if score < MIN_SCORE:
            kind = "Неопознанный звук"
        species_list = []
        bird_error = None
        if scores.get("Птица", 0.0) >= BIRD_CHECK_SCORE:
            try:
                species_list = birdnet_species(path, lat, lon, when)
            except Exception as exc:
                bird_error = str(exc)
    species = None
    confidence = min(score, 1.0)
    if species_list and species_list[0][1] >= BIRD_CONFIDENT:
        kind = "Птица"
        (common, sci), confidence = species_list[0]
        species = f"{common} ({sci})"
    elif kind == "Птица":
        species = "вид не определён"
    details = "Категории: " + ", ".join(f"{l} {s:.2f}" for l, s in cats[:3])
    details += " | Топ YAMNet: " + top_text
    if species_list:
        details += " | BirdNET: " + "; ".join(f"{c} {v:.2f}" for (c, _), v in species_list[:5])
    if scores.get("Ветер / дождь / гроза", 0.0) >= 0.3:
        details += " | Предупреждение: сильный ветер или дождь, запись может быть искажена"
    if bird_error:
        details += " | BirdNET ошибка: " + bird_error
    return dict(kind=kind, species=species, confidence=confidence, details=details)
