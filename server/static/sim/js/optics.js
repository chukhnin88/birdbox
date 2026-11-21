const OpticsState = {
  running: true,
  t: 0,
  freq: 440,
  amp: 10,          
  gap: 5.0,         
  lambda: 850,      
  R: 0.30,
  mode: "intensity",
  stiffness: 2e6,   
  samples: 600,
  dt: 0.00002       
};

function membraneDisplacement(p) {
  return p / OpticsState.stiffness;
}

function transmissionIntensity(gapMeters) {
  const d0 = 2e-6;
  const T0 = 0.9;
  return T0 * Math.exp(-gapMeters / d0);
}

function reflectionFabryPerot(gapMeters, lambdaMeters, R) {
  const delta = 4 * Math.PI * gapMeters / lambdaMeters;
  const s = Math.sin(delta / 2);
  const s2 = s * s;
  const num = 4 * R * s2;
  const den = Math.pow(1 - R, 2) + 4 * R * s2;
  return num / den;
}

function computeOpticsAt(t) {
  const omega = 2 * Math.PI * OpticsState.freq;
  const pressure = OpticsState.amp * Math.sin(omega * t);      
  const disp = membraneDisplacement(pressure);                 
  const baseGap = OpticsState.gap * 1e-6;                       
  const gap = Math.max(1e-9, baseGap + disp);

  let opticalOut;
  if (OpticsState.mode === "intensity") {
    opticalOut = transmissionIntensity(gap);
  } else {

    const lambdaM = OpticsState.lambda * 1e-9;
    opticalOut = reflectionFabryPerot(gap, lambdaM, OpticsState.R);
  }

  return { pressure, disp, gap, opticalOut };
}

function drawScheme(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#ffcc33";
  ctx.beginPath();
  ctx.arc(50, 70, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b131a";
  ctx.font = "12px system-ui";
  ctx.fillText("LED", 36, 100);

  // волокно 1
  ctx.strokeStyle = "#4fa3ff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(70, 70);
  ctx.lineTo(220, 70);
  ctx.stroke();

  ctx.strokeStyle = "#e6edf3";
  ctx.lineWidth = 3;
  const memX = 250;
  ctx.beginPath();
  ctx.moveTo(memX, 45);
  ctx.lineTo(memX, 95);
  ctx.stroke();
  ctx.fillStyle = "#e6edf3";
  ctx.font = "12px system-ui";
  ctx.fillText("мембрана", memX - 30, 115);

  ctx.fillStyle = "#8fa3b3";
  ctx.fillText("зазор", 270, 60);
  ctx.fillText(OpticsState.gap.toFixed(1) + " мкм", 270, 76);

  ctx.strokeStyle = "#4fa3ff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(320, 70);
  ctx.lineTo(470, 70);
  ctx.stroke();

  ctx.fillStyle = "#33cc77";
  ctx.beginPath();
  ctx.arc(500, 70, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b131a";
  ctx.fillText("PD", 490, 100);

  ctx.fillStyle = "#8fa3b3";
  ctx.font = "12px system-ui";
  ctx.fillText(
    OpticsState.mode === "intensity" ? "Режим: интенсивностная модуляция" : "Режим: интерференция Фабри–Перо",
    20, 135
  );
}

function drawSignals(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  const n = OpticsState.samples;
  const dt = OpticsState.dt;

  const midY = h / 2;

  // сетка
  ctx.strokeStyle = "#1f2a35";
  ctx.lineWidth = 1;
  for (let y = 0; y <= h; y += h / 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let x = 0; x <= w; x += w / 6) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }

  ctx.fillStyle = "#8fa3b3";
  ctx.font = "12px system-ui";
  ctx.fillText("Акустическое давление, Па", 8, 16);
  ctx.fillText("Сигнал фотодетектора", 8, midY + 16);

  ctx.strokeStyle = "#ffcc33";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const { pressure } = computeOpticsAt(t);
    const x = (i / (n - 1)) * w;
    const y = (h / 4) - (pressure / (OpticsState.amp || 1)) * (h / 4 - 10);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#33cc77";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let maxOut = 1e-6, minOut = 1e6;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const { opticalOut } = computeOpticsAt(t);
    if (opticalOut > maxOut) maxOut = opticalOut;
    if (opticalOut < minOut) minOut = opticalOut;
  }
  const span = Math.max(1e-9, maxOut - minOut);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const { opticalOut } = computeOpticsAt(t);
    const x = (i / (n - 1)) * w;
    const norm = (opticalOut - minOut) / span;
    const y = midY + (h / 4) - norm * (h / 4 - 10);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function updateOpticsReport() {
  const el = document.getElementById("opticsReport");
  const n = 200;
  let minOut = 1e9, maxOut = -1e9;
  for (let i = 0; i < n; i++) {
    const t = i * 1e-5;
    const { opticalOut } = computeOpticsAt(t);
    if (opticalOut > maxOut) maxOut = opticalOut;
    if (opticalOut < minOut) minOut = opticalOut;
  }
  const contrast = maxOut - minOut;
  const sensitivity = OpticsState.amp > 0
    ? contrast / OpticsState.amp
    : 0;

  el.innerHTML = `
    <b>Текущая модель:</b> ${OpticsState.mode === "intensity" ? "интенсивностная" : "Фабри–Перо"}<br>
    <b>Частота:</b> ${OpticsState.freq} Гц &nbsp;|&nbsp;
    <b>Амплитуда:</b> ${OpticsState.amp} Па &nbsp;|&nbsp;
    <b>Зазор:</b> ${OpticsState.gap.toFixed(1)} мкм<br>
    <b>Контраст выходного сигнала (max-min):</b> ${contrast.toFixed(4)}<br>
    <b>Условная чувствительность:</b> ${sensitivity.toFixed(4)} (отн. ед./Па)<br>
    <b>Пояснение:</b> звук смещает мембрану на микроны; в интенсивностном режиме это
    меняет пропускание зазора по экспоненте, в режиме Фабри–Перо — меняет
    интерференционную картину. На защите сравните: при R→0 интерференция
    исчезает, остаётся только интенсивностная модуляция.
  `;
}

function initOptics() {
  const freq = document.getElementById("freq");
  const amp = document.getElementById("amp");
  const gap = document.getElementById("gap");
  const lambda = document.getElementById("lambda");
  const r = document.getElementById("r");
  const toggleRun = document.getElementById("toggleRun");

  const sync = () => {
    OpticsState.freq = +freq.value;
    OpticsState.amp = +amp.value;
    OpticsState.gap = +gap.value;
    OpticsState.lambda = +lambda.value;
    OpticsState.R = +r.value;

    document.getElementById("freqVal").textContent = freq.value;
    document.getElementById("ampVal").textContent = amp.value;
    document.getElementById("gapVal").textContent = (+gap.value).toFixed(1);
    document.getElementById("lambdaVal").textContent = lambda.value;
    document.getElementById("rVal").textContent = (+r.value).toFixed(2);
  };

  [freq, amp, gap, lambda, r].forEach(el => el.addEventListener("input", sync));
  sync();

  document.querySelectorAll('input[name="mode"]').forEach(el => {
    el.addEventListener("change", () => {
      OpticsState.mode = el.value;
      updateOpticsReport();
    });
  });

  toggleRun.addEventListener("click", () => {
    OpticsState.running = !OpticsState.running;
    toggleRun.textContent = OpticsState.running ? "Пауза" : "Запуск";
  });

  const schemeCanvas = document.getElementById("schemeCanvas");
  const signalCanvas = document.getElementById("signalCanvas");
  const schemeCtx = schemeCanvas.getContext("2d");
  const signalCtx = signalCanvas.getContext("2d");

  function loop() {
    if (OpticsState.running) {
      OpticsState.t += 0.02;
    }
    drawScheme(schemeCtx);
    drawSignals(signalCtx);
    updateOpticsReport();
    requestAnimationFrame(loop);
  }
  loop();
}

document.addEventListener("DOMContentLoaded", initOptics);