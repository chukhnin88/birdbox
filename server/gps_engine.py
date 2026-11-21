import math
import statistics

EARTH_KM = 6371.0088


def distance_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return EARTH_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def check(prev, lat, lon, accuracy, ts, speeds):
    finding = None
    speed = None
    if accuracy > 150:
        finding = ("Средняя", "Низкая достоверность GPS: погрешность выше 150 м.")
    if prev:
        hours = (ts - prev["ts"]).total_seconds() / 3600
        if 0.0001 < hours < 48:
            dist = distance_km(prev["lat"], prev["lon"], lat, lon)
            speed = dist / hours
            if dist > 25 and hours < 1.0:
                finding = ("Критическая",
                           f"Скачок координат: {dist:.1f} км за {hours * 60:.0f} мин. Возможна ошибка GPS.")
            elif speed > 120:
                finding = ("Критическая", f"Нереалистичная скорость перемещения: {speed:.1f} км/ч.")
            elif len(speeds) >= 5:
                med = statistics.median(speeds)
                mad = statistics.median([abs(v - med) for v in speeds])
                limit = max(80.0, med + 6 * max(mad, 1.5))
                if speed > limit:
                    finding = ("Высокая",
                               f"Скорость {speed:.1f} км/ч выше индивидуального порога "
                               f"{limit:.1f} км/ч (медиана истории {med:.1f}).")
        elif hours <= 0:
            finding = ("Средняя", "Время GPS не новее предыдущей точки. Проверьте часы устройства.")
    return speed, finding
