function drawRing(ctx, method, distance, angle) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0b131a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#101c26";
  ctx.fillRect(0, h - 60, w, 60);
  ctx.strokeStyle = "#1f2a35";
  ctx.beginPath(); ctx.moveTo(0, h - 60); ctx.lineTo(w, h - 60); ctx.stroke();

  const rx = 80, ry = h - 60;
  ctx.fillStyle = "#4fa3ff";
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx - 20, ry + 30);
  ctx.lineTo(rx + 20, ry + 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8fa3b3";
  ctx.font = "12px system-ui";
  ctx.fillText("приёмник", rx - 30, ry + 50);

  const scale = (w - 160) / 50;
  const bx = 120 + distance * scale;
  const by = h - 90;

  ctx.fillStyle = "#ffcc33";
  ctx.beginPath();
  ctx.arc(bx, by, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fa3b3";
  ctx.fillText("птица", bx + 10, by + 4);


  if (method === "vhf") {
    const rad = (angle * Math.PI) / 180;
    const len = 90;
    ctx.strokeStyle = "#33cc77";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry - 20);
    ctx.lineTo(rx + Math.sin(rad) * len, ry - 20 - Math.cos(rad) * len);
    ctx.stroke();

    const signal = Math.max(0, 1 - distance / 50) * Math.max(0, Math.cos(rad));
    ctx.fillStyle = "#33cc77";
    ctx.fillText("уровень сигнала: " + (signal * 100).toFixed(0) + "%", 20, 30);
    ctx.fillText("направление: " + angle + "°", 20, 50);
  }

  if (method === "gps") {
    ctx.fillStyle = "#4fa3ff";
    ctx.beginPath();
    ctx.arc(w - 80, 40, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("спутник", w - 120, 25);

    ctx.strokeStyle = "#4fa3ff";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w - 80, 50);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("координаты → база", bx - 60, by - 14);
  }

  if (method === "gls") {
    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("Геолокатор: данные считываются только после повторного отлова", 20, 30);

    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 200; i++) {
      const x = 20 + (i / 200) * (w - 40);
      const day = (i / 200) * 365;
      const y = 80 + 40 * Math.sin(day / 58.09) + 10 * Math.sin(day / 7);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#8fa3b3";
    ctx.fillText("освещённость за год → широта/долгота с ошибкой", 20, 180);
  }
}

function updateRingReport(method, distance, angle) {
  const el = document.getElementById("ringReport");
  let html = "";

  if (method === "vhf") {
    const signal = Math.max(0, 1 - distance / 50) * Math.max(0, Math.cos((angle * Math.PI) / 180));
    html = `
      <b>VHF-радиометка.</b> Передатчик на птице испускает короткие импульсы.
      Приёмник с направленной антенной (Яги) ловит их; оператор вращает антенну
      до максимума и идёт в сторону птицы.<br>
      <b>Расстояние:</b> ${distance.toFixed(1)} км &nbsp;|&nbsp;
      <b>Угол антенны:</b> ${angle}° &nbsp;|&nbsp;
      <b>Уровень сигнала:</b> ${(signal * 100).toFixed(0)}%<br>
      <b>Дальность:</b> с земли 10–15 км с возвышенности, с самолёта до 40–50 км.
    `;
  } else if (method === "gps") {
    html = `
      <b>GPS / Argos.</b> Логгер записывает координаты и передаёт их через
      спутниковую систему. Не нужно искать птицу с антенной вручную, но
      устройство дороже и тяжелее.<br>
      <b>Расстояние:</b> ${distance.toFixed(1)} км — для GPS не важно,
      координаты приходят автоматически.
    `;
  } else {
    html = `
      <b>Геолокатор (GLS).</b> Не передаёт, а записывает освещённость.
      По длине дня и времени полудня вычисляется широта и долгота.
      Данные считываются только после повторного отлова.<br>
      <b>Плюс:</b> дёшево и легко. <b>Минус:</b> нет онлайн-трекинга,
      точность — сотни километров.
    `;
  }
  el.innerHTML = html;
}

function initBirdRing() {
  const dist = document.getElementById("dist");
  const angle = document.getElementById("angle");
  const btn = document.getElementById("simulateRing");
  const canvas = document.getElementById("ringCanvas");
  const ctx = canvas.getContext("2d");

  const getMethod = () =>
    document.querySelector('input[name="ringMethod"]:checked').value;

  const redraw = () => {
    const method = getMethod();
    const d = +dist.value;
    const a = +angle.value;
    document.getElementById("distVal").textContent = d.toFixed(1);
    document.getElementById("angleVal").textContent = a;
    drawRing(ctx, method, d, a);
    updateRingReport(method, d, a);
  };

  [dist, angle].forEach(el => el.addEventListener("input", redraw));
  document.querySelectorAll('input[name="ringMethod"]').forEach(el =>
    el.addEventListener("change", redraw)
  );
  btn.addEventListener("click", redraw);

  redraw();
}

document.addEventListener("DOMContentLoaded", initBirdRing);