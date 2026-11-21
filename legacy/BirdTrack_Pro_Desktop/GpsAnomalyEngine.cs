using System.Text.Json;

namespace BirdTrack;

public sealed class GpsTrackPoint
{
    public string Ring { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double Accuracy { get; set; }
    public DateTime Time { get; set; }
    public double? SpeedKmh { get; set; }
}

public sealed class AiFinding
{
    public string Ring { get; set; } = "";
    public DateTime Time { get; set; }
    public string Severity { get; set; } = "Внимание";
    public string Reason { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
}

/// <summary>
/// Offline adaptive anomaly detector. It learns a robust per-ring speed baseline
/// from recent GPS segments using median and median absolute deviation (MAD).
/// It is a lightweight statistical ML detector, not a pretrained neural network.
/// </summary>
public sealed class GpsAnomalyEngine
{
    private readonly List<GpsTrackPoint> points = new();
    private const int MaxPoints = 50000;
    public int PointCount => points.Count;
    public int RingCount => points.Select(p => p.Ring).Distinct(StringComparer.OrdinalIgnoreCase).Count();

    public AiFinding? Add(string ring, double lat, double lon, double accuracy, DateTime time)
    {
        var previous = points.Where(p => p.Ring.Equals(ring, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(p => p.Time).FirstOrDefault();

        var point = new GpsTrackPoint { Ring = ring, Latitude = lat, Longitude = lon, Accuracy = accuracy, Time = time };
        AiFinding? finding = null;

        if (accuracy > 150)
            finding = Make(ring, time, lat, lon, "Низкая достоверность GPS: погрешность выше 150 м.", "Средняя");

        if (previous != null)
        {
            var hours = (time - previous.Time).TotalHours;
            if (hours > 0.0001 && hours < 48)
            {
                var distance = DistanceKm(previous.Latitude, previous.Longitude, lat, lon);
                var speed = distance / hours;
                point.SpeedKmh = speed;

                if (distance > 25 && hours < 1.0)
                    finding = Make(ring, time, lat, lon,
                        $"Скачок координат: {distance:F1} км за {hours * 60:F0} мин. Возможна ошибка GPS.", "Критическая");
                else if (speed > 120)
                    finding = Make(ring, time, lat, lon,
                        $"Нереалистичная скорость перемещения: {speed:F1} км/ч.", "Критическая");
                else
                {
                    var baseline = points.Where(p => p.Ring.Equals(ring, StringComparison.OrdinalIgnoreCase) && p.SpeedKmh.HasValue)
                        .OrderByDescending(p => p.Time).Take(30).Select(p => p.SpeedKmh!.Value).ToList();
                    if (baseline.Count >= 5)
                    {
                        var median = Median(baseline);
                        var mad = Median(baseline.Select(v => Math.Abs(v - median)).ToList());
                        var adaptiveLimit = Math.Max(80, median + 6 * Math.Max(mad, 1.5));
                        if (speed > adaptiveLimit)
                            finding = Make(ring, time, lat, lon,
                                $"Скорость {speed:F1} км/ч выше индивидуального порога {adaptiveLimit:F1} км/ч (медиана истории {median:F1}).", "Высокая");
                    }
                }
            }
            else if (hours <= 0)
            {
                finding = Make(ring, time, lat, lon, "Время GPS не новее предыдущей точки. Проверьте часы устройства.", "Средняя");
            }
        }

        points.Add(point);
        if (points.Count > MaxPoints) points.RemoveRange(0, points.Count - MaxPoints);
        return finding;
    }

    private static AiFinding Make(string ring, DateTime time, double lat, double lon, string reason, string severity)
        => new() { Ring = ring, Time = time, Latitude = lat, Longitude = lon, Reason = reason, Severity = severity };

    public GpsTrackPoint? Last(string ring) => points.Where(p => p.Ring.Equals(ring, StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(p => p.Time).FirstOrDefault();
    public List<GpsTrackPoint> Recent(string ring, int count) => points.Where(p => p.Ring.Equals(ring, StringComparison.OrdinalIgnoreCase))
        .OrderBy(p => p.Time).TakeLast(count).ToList();
    public void ResetRing(string ring) => points.RemoveAll(p => p.Ring.Equals(ring, StringComparison.OrdinalIgnoreCase));

    public void Save(string path) => File.WriteAllText(path, JsonSerializer.Serialize(points, new JsonSerializerOptions { WriteIndented = true }));
    public void Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            var loaded = JsonSerializer.Deserialize<List<GpsTrackPoint>>(File.ReadAllText(path));
            if (loaded != null) points.AddRange(loaded.TakeLast(MaxPoints));
        }
        catch { /* damaged history must not prevent application startup */ }
    }

    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        values.Sort();
        int m = values.Count / 2;
        return values.Count % 2 == 0 ? (values[m - 1] + values[m]) / 2 : values[m];
    }

    private static double DistanceKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double earth = 6371.0088;
        double rad(double d) => d * Math.PI / 180;
        var dLat = rad(lat2 - lat1);
        var dLon = rad(lon2 - lon1);
        var a = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(rad(lat1)) * Math.Cos(rad(lat2)) * Math.Pow(Math.Sin(dLon / 2), 2);
        return earth * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
