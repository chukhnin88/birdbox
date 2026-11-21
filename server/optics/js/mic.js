function drawMic(ctx, type, pressure, readerDist) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b131a";
  ctx.fillRect(0, 0, w, h);

  ctx.font = "12px system-ui";

  if (type === "electret") {
    ctx.strokeStyle = "#4fa3ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 100, 200, 100);

    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 3;
    const offset = pressure * 8;
    ctx.beginPath();
    ctx.moveTo(180, 110 - offset);
    ctx.lineTo(180, 190 - offset);
    ctx.stroke();

    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("заряженная плёнка (электрет)", 90, 90);
    ctx.fillText("заряд «вморожен» при изготовлении", 90, 220);
    ctx.fillText("батарейки внутри нет", 90, 240);

    ctx.strokeStyle = "#33cc77";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(280, 130);
    ctx.lineTo(420, 130);
    ctx.lineTo(420, 170);
    ctx.lineTo(280, 170);
    ctx.stroke();

    ctx.fillStyle = "#33cc77";
    ctx.fillText("усилитель (питается отдельно)", 300, 120);

    const current = pressure * 0.4;
    ctx.fillStyle = "#ffcc33";
    ctx.fillText("ток во внешней цепи: " + current.toFixed(2) + " мкА", 300, 200);
  } else {
    ctx.fillStyle = "#4fa3ff";
    ctx.fillText("считыватель (излучает поле)", 40, 60);

    ctx.strokeStyle = "#4fa3ff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(120, 120 + i * 12, 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    const mx = 340;
    ctx.strokeStyle = "#ffcc33";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(mx, 120 + i * 12, 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "#8fa3b3";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(150, 200);
    ctx.lineTo(mx - 30, 200);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("d = " + readerDist.toFixed(1) + " см", 220, 220);

    const coupling = Math.exp(-readerDist / 8);
    ctx.fillStyle = coupling > 0.2 ? "#33cc77" : "#cc4444";
    ctx.fillText("связь: " + (coupling * 100).toFixed(0) + "%", 220, 250);

    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("звук меняет резонансную частоту контура;", 40, 280);
    ctx.fillText("считыватель детектирует изменение импеданса", 40, 300);

    ctx.fillStyle = "#ffcc33";
    ctx.fillText("давление: " + pressure.toFixed(2) + " Па", mx - 40, 320);
  }
}

function updateMicReport(type, pressure, readerDist) {
  const el = document.getElementById("micReport");
  if (type === "electret") {
    el.innerHTML = `
      <b>Электретный микрофон.</b> В плёнке из электрета заряд «вморожен»
      при изготовлении — это электрический аналог постоянного магнита.
      Звук колеблет заряженную мембрану, меняется ёмкость, во внешней цепи
      течёт ток. Батарейки в капсюле нет, но усилитель питается отдельно.<br>
      <b>Давление:</b> ${pressure.toFixed(2)} Па &nbsp;|&nbsp;
      <b>Ток:</b> ${(pressure * 0.4).toFixed(2)} мкА<br>
      <b>Вывод:</b> энергия не создаётся из ничего — она запасена в материале.
    `;
  } else {
    const coupling = Math.exp(-readerDist / 8);
    el.innerHTML = `
      <b>Пассивный RF-микрофон.</b> Считыватель облучает контур микрофона
      переменным полем. Микрофон модулирует свою резонансную частоту под
      действием звука, считыватель детектирует изменение импеданса.
      Энергия для работы поступает от считывателя по воздуху.<br>
      <b>Давление:</b> ${pressure.toFixed(2)} Па &nbsp;|&nbsp;
      <b>Расстояние:</b> ${readerDist.toFixed(1)} см &nbsp;|&nbsp;
      <b>Связь:</b> ${(coupling * 100).toFixed(0)}%<br>
      <b>Вывод:</b> ${coupling > 0.2 ? "связь есть, микрофон работает" : "связь потеряна — сигнала нет"}.
    `;
  }
}

async function fillMicDevices() {
  const select = document.getElementById('micDevice');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">По умолчанию (система)</option>';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    devices
      .filter(d => d.kind === 'audioinput')
      .forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Микрофон ${i + 1}`;
        select.appendChild(opt);
      });
    // восстановить выбор, если устройство ещё есть
    if ([...select.options].some(o => o.value === current)) select.value = current;
  } catch (e) {
    console.warn('Не удалось перечислить устройства', e);
  }
}

function initMic() {
  const pressure = document.getElementById("pressure");
  const reader = document.getElementById("reader");
  const btn = document.getElementById("simulateMic");
  const canvas = document.getElementById("micCanvas");
  const ctx = canvas.getContext("2d");

  const getType = () =>
    document.querySelector('input[name="micType"]:checked').value;

  const redraw = () => {
    const type = getType();
    const p = +pressure.value;
    const d = +reader.value;
    document.getElementById("pressureVal").textContent = p.toFixed(2);
    document.getElementById("readerVal").textContent = d.toFixed(1);
    drawMic(ctx, type, p, d);
    updateMicReport(type, p, d);
  };

  [pressure, reader].forEach(el => el.addEventListener("input", redraw));
  document.querySelectorAll('input[name="micType"]').forEach(el =>
    el.addEventListener("change", redraw)
  );
  btn.addEventListener("click", redraw);

  redraw();
}

document.addEventListener("DOMContentLoaded", initMic);

// Учебная модель влияния ветрового шума на полезный сигнал.
// Это не измерение реального микрофона: значения условные и нужны для демонстрации.
function drawWindTest(ctx, wind, wanted) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b131a";
  ctx.fillRect(0, 0, w, h);
  const mid = h / 2;
  ctx.strokeStyle = "#243443";
  ctx.lineWidth = 1;
  for (let y = 0; y <= h; y += h / 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#8fa3b3";
  ctx.fillText("Полезный звук и шум ветра (условные уровни)", 12, 18);

  const noise = wind * 8;
  // Полезный сигнал — относительно ровная синусоида.
  ctx.strokeStyle = "#4fa3ff"; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const y = mid - Math.sin(x * 0.045) * wanted * 0.55;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Ветер — шумовая волна, амплитуда растёт вместе с ползунком.
  ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const noiseWave = (Math.sin(x * 0.19) * 0.45 + Math.sin(x * 0.071) * 0.35 + Math.sin(x * 0.31) * 0.2);
    const y = mid - noiseWave * noise * 1.6;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = "#4fa3ff"; ctx.fillText("Синий — полезный звук", 12, h - 12);
  ctx.fillStyle = "#ffcc33"; ctx.fillText("Жёлтый — шум ветра", 230, h - 12);
}

function updateWindTest() {
  const wind = document.getElementById("wind");
  const wanted = document.getElementById("wanted");
  const canvas = document.getElementById("windCanvas");
  const report = document.getElementById("windReport");
  if (!wind || !wanted || !canvas || !report) return;
  const windLevel = Number(wind.value);
  const wantedLevel = Number(wanted.value);
  document.getElementById("windVal").textContent = windLevel;
  document.getElementById("wantedVal").textContent = wantedLevel;

  // Условная модель: ветер повышает шум; полезный сигнал задаётся отдельно.
  const noise = windLevel * 8;
  const ratio = wantedLevel / Math.max(1, noise);
  const quality = windLevel === 0 ? "Отличное" : ratio >= 5 ? "Хорошее" : ratio >= 2 ? "Среднее" : "Плохое";
  drawWindTest(canvas.getContext("2d"), windLevel, wantedLevel);
  report.innerHTML = `
    <b>Сила ветра:</b> ${windLevel}/10 &nbsp;|&nbsp;
    <b>Полезный звук:</b> ${wantedLevel}% &nbsp;|&nbsp;
    <b>Условный уровень шума:</b> ${noise}%<br>
    <b>Оценка модели:</b> ${quality}<br>
    <span class="hint">Это упрощённая симуляция для демонстрации. Для реального теста нужно записать звук с разрешения браузера и анализировать его уровень.</span>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  const wind = document.getElementById("wind");
  const wanted = document.getElementById("wanted");
  const testButton = document.getElementById("testWind");
  if (wind && wanted && testButton) {
    [wind, wanted].forEach(el => el.addEventListener("input", updateWindTest));
    testButton.addEventListener("click", updateWindTest);
    updateWindTest();
  }
});


// Измерение реального уровня звука с микрофона через Web Audio API.
// Никакая запись не сохраняется и не отправляется: считаем только уровень сигнала.
let realMicStream = null;
let realMicContext = null;
let realMicAnimation = null;

function initRealMicTest() {
  const start = document.getElementById("startRealMic");
  const stop = document.getElementById("stopRealMic");
  const captureQuiet = document.getElementById("captureQuiet");
  const captureNoise = document.getElementById("captureNoise");
  const comparisonReport = document.getElementById("comparisonReport");
  const status = document.getElementById("realMicStatus");
  const levelText = document.getElementById("realMicLevel");
  const bar = document.getElementById("realMicBar");
  const advice = document.getElementById("realMicAdvice");
  const neuralReport = document.getElementById("neuralReport");
  const soundEventReport = document.getElementById("soundEventReport");
  if (!start || !stop || !status || !levelText || !bar || !advice) return;

  let analyser = null;
  let data = null;
  let quietLevel = null;
  let noiseLevel = null;
  let captureInProgress = false;
  let previousPercent = 0;
  let lastSoundEventAt = 0;
  let soundEventCount = 0;
  
  // ─── Список микрофонов ───
  async function fillMicDevices() {
    const select = document.getElementById('micDevice');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">По умолчанию (система)</option>';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devices
        .filter(d => d.kind === 'audioinput')
        .forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Микрофон ${i + 1}`;
          select.appendChild(opt);
        });
      if ([...select.options].some(o => o.value === current)) select.value = current;
    } catch (e) {
      console.warn('Не удалось перечислить устройства', e);
    }
  }

  document.getElementById('refreshDevices')?.addEventListener('click', fillMicDevices);
  if (navigator.mediaDevices && 'addEventListener' in navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', fillMicDevices);
  }
  fillMicDevices();

  function stopMic() {
    if (realMicAnimation !== null) cancelAnimationFrame(realMicAnimation);
    realMicAnimation = null;
    if (realMicStream) realMicStream.getTracks().forEach(track => track.stop());
    realMicStream = null;
    if (realMicContext && realMicContext.state !== "closed") realMicContext.close();
    realMicContext = null;
    analyser = null;
    data = null;
    start.disabled = false;
    stop.disabled = true;
    captureQuiet.disabled = true;
    captureNoise.disabled = true;
    status.textContent = "Микрофон выключен.";
    levelText.textContent = "0";
    bar.style.width = "0%";
    advice.textContent = "Измерение остановлено. Для нового теста нажми «Включить микрофон».";
  }

  function measure() {
    if (!analyser || !data) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / data.length);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs((data[i] - 128) / 128));
    const crest = rms > 0.0001 ? Math.min(8, peak / rms) : 0;
    const percent = Math.min(100, Math.round(rms * 240));
    // Simple transient detector: flags a possible clap/knock, not a reliable sound classifier.
    const now = performance.now();
    const suddenRise = percent >= 3 && percent >= previousPercent + 2;
    const sharpTransient = peak >= 0.12 && crest >= 2.2;
    if ((suddenRise || sharpTransient) && now - lastSoundEventAt > 900) {
      lastSoundEventAt = now;
      soundEventCount += 1;
      if (soundEventReport) soundEventReport.innerHTML = `<b>Возможный хлопок или резкий звук!</b><br>Событий обнаружено: ${soundEventCount}<br><span class="hint">Всплеск сигнала: уровень ${percent}%, пиковая амплитуда ${peak.toFixed(2)}. Это обнаружение по правилам, оно может ошибаться.</span>`;
    }
    previousPercent = percent;
    // Tiny feed-forward neural network demo: 2 inputs -> 3 hidden neurons -> 3 outputs.
    // Weights are illustrative and manually selected, not trained on labelled audio data.
    const x1 = Math.min(1, rms * 8);
    const x2 = Math.min(1, crest / 8);
    const sigmoid = x => 1 / (1 + Math.exp(-x));
    const h1 = sigmoid(2.4 * x1 - 0.8 * x2 - 0.7);
    const h2 = sigmoid(1.8 * x2 + 0.8 * x1 - 1.0);
    const h3 = sigmoid(-2.0 * x1 + 0.2);
    const scores = [
      { name: "тихий фон", value: 2.5 * h3 - h1 - h2 },
      { name: "обычный звук", value: 1.6 * h1 - 0.2 * h2 - 0.2 * h3 },
      { name: "возможный резкий звук", value: 1.8 * h2 + 0.6 * h1 - 0.7 * h3 }
    ];
    const maxScore = Math.max(...scores.map(s => s.value));
    const expScores = scores.map(s => Math.exp(s.value - maxScore));
    const totalScore = expScores.reduce((a, b) => a + b, 0);
    const bestIndex = expScores.indexOf(Math.max(...expScores));
    const confidence = Math.round(expScores[bestIndex] / totalScore * 100);
    if (neuralReport) neuralReport.innerHTML = `<b>Предположение модели:</b> ${scores[bestIndex].name}<br><b>Условная уверенность:</b> ${confidence}%<br><span class="hint">Входные признаки: уровень ${percent}%, резкость ${crest.toFixed(1)}. Результат демонстрационный, не является надёжным распознаванием звука.</span>`;
    levelText.textContent = String(percent);
    bar.style.width = percent + "%";
    if (percent < 4) {
      advice.textContent = "Очень тихо: попробуй говорить рядом с микрофоном или слегка постучать по столу.";
    } else if (percent < 20) {
      advice.textContent = "Уровень звука умеренный. Произнеси фразу и посмотри, как меняется показатель.";
    } else {
      advice.textContent = "Сильный сигнал. Если показатель часто держится у 100%, отодвинься от микрофона.";
    }
    realMicAnimation = requestAnimationFrame(measure);
  }

start.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = "Браузер не предоставляет доступ к микрофону. Открой приложение в актуальном Chrome или Edge; если не получится, запусти его через localhost.";
    return;
  }
  start.disabled = true;
  status.textContent = "Запрашиваем разрешение на микрофон…";
  try {
    // ↓↓↓ ИЗМЕНЕНИЕ ЗДЕСЬ ↓↓↓
      const selectedId = document.getElementById('micDevice')?.value || '';
      realMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedId ? { exact: selectedId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    // ↑↑↑ КОНЕЦ ИЗМЕНЕНИЯ ↑↑↑

    realMicContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = realMicContext.createMediaStreamSource(realMicStream);
    analyser = realMicContext.createAnalyser();
    analyser.fftSize = 2048;
    data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    stop.disabled = false;
    captureQuiet.disabled = false;
    captureNoise.disabled = false;
    status.textContent = "Микрофон включён. Говори или воспроизведи звук рядом с устройством.";
    await fillMicDevices();   // ← добавлено
    measure();
    status.textContent = "Микрофон включён. Говори или воспроизведи звук рядом с устройством.";
    await fillMicDevices();   // ← ДОБАВИТЬ: обновит названия после разрешения
    measure();
    } catch (error) {
      if (realMicStream) realMicStream.getTracks().forEach(track => track.stop());
      realMicStream = null;
      start.disabled = false;
      if (error && error.name === "OverconstrainedError") {
        status.textContent = "Выбранное USB-устройство не найдено. Подключите его и нажмите «Обновить список».";
      } else if (error && error.name === "NotReadableError") {
        status.textContent = "Устройство занято другим приложением (Zoom/Discord и т.п.). Закройте его и повторите.";
      } else if (error && error.name === "NotAllowedError") {
        status.textContent = "Доступ запрещён. Разреши использование микрофона в настройках браузера и попробуй снова.";
      } else {
        status.textContent = "Не удалось включить микрофон. Проверь, подключён ли он и не используется ли другим приложением.";
      }
    }
  });
  async function captureAverage(target) {
    if (!analyser || !data || captureInProgress) return;
    captureInProgress = true;
    captureQuiet.disabled = true;
    captureNoise.disabled = true;
    status.textContent = "Измеряем 3 секунды… постарайся сохранить выбранные условия.";
    const values = [];
    const started = performance.now();
    while (performance.now() - started < 3000) {
      if (!analyser || !data) break;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = (data[i] - 128) / 128;
        sum += sample * sample;
      }
      values.push(Math.sqrt(sum / data.length) * 240);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    if (target === "quiet") quietLevel = average;
    else noiseLevel = average;
    const fmt = v => `${Math.round(Math.min(100, v))}%`;
    let report = `Тихий фон: ${quietLevel === null ? "ещё не измерен" : fmt(quietLevel)}<br>Шумная среда: ${noiseLevel === null ? "ещё не измерена" : fmt(noiseLevel)}`;
    if (quietLevel !== null && noiseLevel !== null) {
      const difference = noiseLevel - quietLevel;
      const reference = Math.max(quietLevel, 0.1);
      const relativeChange = (difference / reference) * 100;
      const ratio = noiseLevel / reference;
      // Относительная оценка в дБ по отношению амплитуд. Это не калиброванный уровень звукового давления.
      const relativeDb = 20 * Math.log10(Math.max(noiseLevel, 0.1) / reference);
      let interpretation;
      if (quietLevel < 2 && noiseLevel < 2) {
        interpretation = "Оба измерения очень низкие. Проверь выбранный микрофон и его уровень в настройках системы; попробуй повторить тест ближе к источнику звука.";
      } else if (difference > 8) {
        interpretation = "Абсолютный уровень в шумной среде заметно выше. Это подтверждает, что микрофон улавливает изменение уровня, но само по себе не измеряет разборчивость речи.";
      } else if (difference > 2) {
        interpretation = "Есть небольшое увеличение уровня. Для более надёжного сравнения повтори оба измерения в одинаковых условиях.";
      } else {
        interpretation = "Абсолютные уровни близки. Возможно, шум был слабым, автоматическая обработка звука сгладила разницу или микрофон слабо реагирует на этот звук.";
      }
      report += `<br><br><b>Абсолютная разница:</b> ${difference >= 0 ? "+" : ""}${difference.toFixed(1)} условных пункта.`;
      report += `<br><b>Изменение относительно тихого фона:</b> ${relativeChange >= 0 ? "+" : ""}${relativeChange.toFixed(0)}%.`;
      report += `<br><b>Относительное изменение уровня:</b> ${relativeDb >= 0 ? "+" : ""}${relativeDb.toFixed(1)} дБ (оценка по амплитуде, не калиброванное измерение).`;
      report += `<br><br>${interpretation}`;
    } else {
      report += "<br>Сделай второе измерение в других условиях, чтобы сравнить.";
    }
    comparisonReport.innerHTML = report;
    status.textContent = "Измерение завершено.";
    captureInProgress = false;
    captureQuiet.disabled = !analyser;
    captureNoise.disabled = !analyser;
  }

  captureQuiet.addEventListener("click", () => captureAverage("quiet"));
  captureNoise.addEventListener("click", () => captureAverage("noise"));
  stop.addEventListener("click", stopMic);
  window.addEventListener("beforeunload", () => {
    if (realMicStream) realMicStream.getTracks().forEach(track => track.stop());
  });
}

document.addEventListener("DOMContentLoaded", initRealMicTest);


// Educational digitization visualization: generated sample waveform -> sampling -> quantization -> binary codes.
document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("digitizeDemo");
  const canvas = document.getElementById("digitizeCanvas");
  const report = document.getElementById("digitizeReport");
  if (!button || !canvas || !report) return;
  const ctx = canvas.getContext("2d");
  button.addEventListener("click", () => {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#8a8a8a";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, h/2); ctx.lineTo(w-10, h/2); ctx.stroke();
    const N = 24, maxCode = 15;
    const samples = [];
    ctx.strokeStyle = "#2785d8"; ctx.lineWidth = 2; ctx.beginPath();
    for (let px=0; px<w-30; px++) {
      const t = px/(w-30)*Math.PI*4;
      const y = h/2 - Math.sin(t)*65 - Math.sin(t*2.1)*13;
      if (px===0) ctx.moveTo(20+px,y); else ctx.lineTo(20+px,y);
    }
    ctx.stroke();
    ctx.fillStyle = "#df4b4b";
    const codes = [];
    for (let i=0;i<N;i++) {
      const t = i/(N-1)*Math.PI*4;
      const raw = (Math.sin(t)+Math.sin(t*2.1)*0.2 + 1.2)/2.4;
      const code = Math.max(0,Math.min(maxCode,Math.round(raw*maxCode)));
      const x = 20 + i*(w-40)/(N-1);
      const y = h/2 - (code/maxCode-0.5)*130;
      ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#df4b4b"; ctx.beginPath(); ctx.moveTo(x,h/2); ctx.lineTo(x,y); ctx.stroke();
      codes.push(code.toString(2).padStart(4,"0"));
    }
    report.innerHTML = "<b>Пример 4-битной оцифровки:</b><br>Отсчёты (первые 12): " +
      codes.slice(0,12).join(", ") + "<br><span class='hint'>Синяя линия — исходная условная волна; красные точки — взятые отсчёты. Каждый отсчёт округляется до одного из 16 уровней и записывается 4 битами.</span>";
  });
});
