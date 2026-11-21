#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <esp_partition.h>
#include <esp_sleep.h>
#include <esp_bt.h>
#include <math.h>

#ifndef PIN_BCLK
#define PIN_BCLK 26
#endif
#ifndef PIN_WS
#define PIN_WS 25
#endif
#ifndef PIN_SD
#define PIN_SD 33
#endif

#ifndef GPS_RX
#define GPS_RX 16
#endif
#define GPS_BAUD 9600
#define GPS_WAIT_MS 3000

#define SAMPLE_RATE 16000
#define REC_SECONDS 4
#define DETECT_SECONDS 1
#define WAV_HDR 44
#define TOTAL_SAMPLES (SAMPLE_RATE * REC_SECONDS)
#define LOW_THRESHOLD_FACTOR 4.0f
#define BASELINE_FACTOR 2.5f

struct __attribute__((packed)) Cfg {
  char magic[8];
  char ssid[64];
  char pass[64];
  char server[128];
  char token[64];
  uint32_t listenSec;
  uint32_t threshold;
  uint32_t gain;
  uint32_t cooldownSec;
  uint32_t gpsMode;
};

RTC_DATA_ATTR float baseLow = 0;
RTC_DATA_ATTR float baseHigh = 0;
RTC_DATA_ATTR uint8_t failCount = 0;
RTC_DATA_ATTR uint8_t wifiChannel = 0;
RTC_DATA_ATTR uint8_t wifiBssid[6] = {0};

static void sleepFor(uint32_t sec) {
  esp_sleep_enable_timer_wakeup((uint64_t)sec * 1000000ULL);
  esp_deep_sleep_start();
}

static bool loadCfg(Cfg &c) {
  const esp_partition_t *p = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, (esp_partition_subtype_t)0x40, "cfg");
  if (!p) return false;
  if (esp_partition_read(p, 0, &c, sizeof(c)) != ESP_OK) return false;
  if (memcmp(c.magic, "BIRDCFG1", 8) != 0) return false;
  c.ssid[63] = 0;
  c.pass[63] = 0;
  c.server[127] = 0;
  c.token[63] = 0;
  if (c.listenSec < 1 || c.listenSec > 86400) c.listenSec = 10;
  if (c.gain < 1 || c.gain > 16) c.gain = 1;
  if (c.cooldownSec > 86400) c.cooldownSec = 60;
  if (c.gpsMode > 1) c.gpsMode = 0;
  return true;
}

static void i2sStart() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 4;
  cfg.dma_buf_len = 256;
  i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_BCLK;
  pins.ws_io_num = PIN_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = PIN_SD;
  i2s_set_pin(I2S_NUM_0, &pins);
}

static void readBlock(int16_t *out, size_t n, int32_t gain) {
  static int32_t tmp[256];
  size_t done = 0;
  while (done < n) {
    size_t want = min((size_t)256, n - done);
    size_t got = 0;
    i2s_read(I2S_NUM_0, tmp, want * 4, &got, portMAX_DELAY);
    size_t cnt = got / 4;
    for (size_t i = 0; i < cnt; i++) {
      int32_t v = (tmp[i] >> 14) * gain;
      if (v > 32767) v = 32767;
      if (v < -32768) v = -32768;
      out[done + i] = (int16_t)v;
    }
    done += cnt;
  }
}

static void wavHeader(uint8_t *h, uint32_t dataLen) {
  uint32_t riff = dataLen + 36, fmtLen = 16, rate = SAMPLE_RATE, byteRate = SAMPLE_RATE * 2;
  uint16_t pcm = 1, ch = 1, align = 2, bits = 16;
  memcpy(h, "RIFF", 4);
  memcpy(h + 4, &riff, 4);
  memcpy(h + 8, "WAVEfmt ", 8);
  memcpy(h + 16, &fmtLen, 4);
  memcpy(h + 20, &pcm, 2);
  memcpy(h + 22, &ch, 2);
  memcpy(h + 24, &rate, 4);
  memcpy(h + 28, &byteRate, 4);
  memcpy(h + 32, &align, 2);
  memcpy(h + 34, &bits, 2);
  memcpy(h + 36, "data", 4);
  memcpy(h + 40, &dataLen, 4);
}

static bool parseGga(const String &s, double &lat, double &lon, float &acc) {
  if (!(s.startsWith("$GPGGA") || s.startsWith("$GNGGA"))) return false;
  String f[10];
  int n = 0, start = 0, len = s.length();
  for (int i = 0; i <= len && n < 10; i++) {
    if (i == len || s[i] == ',') {
      f[n++] = s.substring(start, i);
      start = i + 1;
    }
  }
  if (n < 9 || f[6].toInt() == 0 || f[2].length() < 4 || f[4].length() < 5) return false;
  double la = f[2].substring(0, 2).toDouble() + f[2].substring(2).toDouble() / 60.0;
  double lo = f[4].substring(0, 3).toDouble() + f[4].substring(3).toDouble() / 60.0;
  if (f[3] == "S") la = -la;
  if (f[5] == "W") lo = -lo;
  lat = la;
  lon = lo;
  acc = f[8].toFloat() * 5.0f;
  return true;
}

static bool readGps(uint32_t waitMs, double &lat, double &lon, float &acc) {
  Serial2.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, -1);
  String line;
  bool ok = false;
  uint32_t t0 = millis();
  while (!ok && millis() - t0 < waitMs) {
    while (Serial2.available() && !ok) {
      char ch = Serial2.read();
      if (ch == '\n') {
        ok = parseGga(line, lat, lon, acc);
        line = "";
      } else if (ch != '\r' && line.length() < 120) {
        line += ch;
      }
    }
    delay(5);
  }
  Serial2.end();
  return ok;
}

static bool connectWifi(const Cfg &c) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  bool fast = wifiChannel != 0;
  if (fast) WiFi.begin(c.ssid, c.pass, wifiChannel, wifiBssid, true);
  else WiFi.begin(c.ssid, c.pass);
  WiFi.setTxPower(WIFI_POWER_15dBm);
  uint32_t limit = fast ? 4000 : 12000;
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < limit) delay(50);
  if (WiFi.status() == WL_CONNECTED) {
    wifiChannel = WiFi.channel();
    memcpy(wifiBssid, WiFi.BSSID(), 6);
    return true;
  }
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  if (fast) {
    wifiChannel = 0;
    delay(50);
    return connectWifi(c);
  }
  return false;
}

static int gMini = 0;
static int gLevel = 0;
static float gCrest = 0;

static int miniNet(float rms, float peak, float &conf, float &crest) {
  crest = rms > 0.0001f ? min(8.0f, peak / rms) : 0.0f;
  float x1 = min(1.0f, rms * 8.0f);
  float x2 = min(1.0f, crest / 8.0f);
  float h1 = 1.0f / (1.0f + expf(-(2.4f * x1 - 0.8f * x2 - 0.7f)));
  float h2 = 1.0f / (1.0f + expf(-(1.8f * x2 + 0.8f * x1 - 1.0f)));
  float h3 = 1.0f / (1.0f + expf(-(-2.0f * x1 + 0.2f)));
  float s[3] = {2.5f * h3 - h1 - h2, 1.6f * h1 - 0.2f * h2 - 0.2f * h3, 1.8f * h2 + 0.6f * h1 - 0.7f * h3};
  int best = 0;
  for (int i = 1; i < 3; i++) if (s[i] > s[best]) best = i;
  float sum = 0;
  for (int i = 0; i < 3; i++) sum += expf(s[i] - s[best]);
  conf = 1.0f / sum;
  return best;
}

static bool upload(const Cfg &c, uint8_t *buf, size_t len, bool hasGps, double lat, double lon, float acc) {
  if (!connectWifi(c)) {
    Serial.println("wifi fail");
    return false;
  }
  String url = String(c.server) + "/api/upload";
  HTTPClient http;
  WiFiClientSecure sec;
  WiFiClient plain;
  if (url.startsWith("https")) {
    sec.setInsecure();
    http.begin(sec, url);
  } else {
    http.begin(plain, url);
  }
  http.setTimeout(15000);
  http.addHeader("X-Device-Token", c.token);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("ngrok-skip-browser-warning", "1");
  http.addHeader("X-Mini", String(gMini));
  http.addHeader("X-Level", String(gLevel));
  http.addHeader("X-Crest", String(gCrest, 2));
  if (hasGps) {
    http.addHeader("X-Lat", String(lat, 6));
    http.addHeader("X-Lon", String(lon, 6));
    http.addHeader("X-Acc", String(acc, 1));
  }
  int code = http.POST(buf, len);
  Serial.printf("upload -> %d\n", code);
  http.end();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  return code == 200;
}

void setup() {
  setCpuFrequencyMhz(80);
  Serial.begin(115200);
  btStop();

  Cfg c;
  if (!loadCfg(c)) {
    Serial.println("cfg missing");
    sleepFor(60);
  }

  uint8_t *buf = (uint8_t *)malloc(WAV_HDR + TOTAL_SAMPLES * 2);
  if (!buf) sleepFor(c.listenSec);
  int16_t *pcm = (int16_t *)(buf + WAV_HDR);

  i2sStart();
  readBlock(pcm, 3200, 1);
  size_t detN = SAMPLE_RATE * DETECT_SECONDS;
  readBlock(pcm, detN, c.gain);

  double sum = 0;
  for (size_t i = 0; i < detN; i++) sum += pcm[i];
  double mean = sum / detN;
  double accLow = 0, accHigh = 0, peakAbs = 0;
  for (size_t i = 0; i < detN; i++) {
    double v = pcm[i] - mean;
    accLow += v * v;
    if (fabs(v) > peakAbs) peakAbs = fabs(v);
    if (i > 0) {
      double d = pcm[i] - pcm[i - 1];
      accHigh += d * d;
    }
  }
  float low = sqrt(accLow / detN);
  float high = sqrt(accHigh / detN);
  float nrms = low / 32768.0f;
  float miniConf = 0;
  gMini = miniNet(nrms, (float)peakAbs / 32768.0f, miniConf, gCrest);
  gLevel = (int)min(100.0f, roundf(nrms * 240.0f));
  float thrHigh = max((float)c.threshold, baseHigh * BASELINE_FACTOR);
  float thrLow = max((float)c.threshold * LOW_THRESHOLD_FACTOR, baseLow * BASELINE_FACTOR);
  bool trig = high > thrHigh || low > thrLow || c.threshold == 0;
  if (!trig) {
    baseHigh = (baseHigh == 0) ? high : 0.9f * baseHigh + 0.1f * high;
    baseLow = (baseLow == 0) ? low : 0.9f * baseLow + 0.1f * low;
  }
  Serial.printf("low=%.1f/%.1f high=%.1f/%.1f trig=%d\n", low, thrLow, high, thrHigh, trig);

  if (trig) readBlock(pcm + detN, TOTAL_SAMPLES - detN, c.gain);
  i2s_driver_uninstall(I2S_NUM_0);

  uint32_t nextSleep = c.listenSec;
  if (trig) {
    wavHeader(buf, TOTAL_SAMPLES * 2);
    double glat = 0, glon = 0;
    float gacc = 0;
    bool hasGps = c.gpsMode && readGps(GPS_WAIT_MS, glat, glon, gacc);
    if (upload(c, buf, WAV_HDR + TOTAL_SAMPLES * 2, hasGps, glat, glon, gacc)) {
      failCount = 0;
      nextSleep = c.cooldownSec > c.listenSec ? c.cooldownSec : c.listenSec;
    } else {
      if (failCount < 5) failCount++;
      uint32_t backoff = c.listenSec << failCount;
      nextSleep = backoff > 3600 ? 3600 : backoff;
    }
  }
  sleepFor(nextSleep);
}

void loop() {}
