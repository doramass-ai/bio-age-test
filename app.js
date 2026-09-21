"use strict";

/* =====================================================================
 * Модель: линейная регрессия из Healthspan Copilot (NUS).
 * Восстановлена из обучающего файла «BA estimation (CDC dataset Asian).csv»
 * (n = 276, данные NHANES/CDC). Хронологический возраст в предсказании
 * не участвует — он нужен только для расчёта разрыва BA − CA.
 * =================================================================== */
const MODEL = {
  intercept: -16.201802820582969,
  coef: {
    hba1c:  2.907691242251438,   // %
    weight: -0.801936767300258,  // кг
    waist:  1.007639395018719,   // см
    hscrp: -0.566539049420262,   // мг/л
    hdl:    0.140084546503692,   // мг/дл
    sbp:    0.489668775693383,   // мм рт. ст.
    dbp:   -0.466750533826358,   // мм рт. ст.
    pulse: -0.149604158266665,   // уд/мин
    sex:   -4.709920194080644,   // 1 = муж, 2 = жен
  },
  // Средние обучающей выборки — подстановка при «не знаю»
  means: {
    hba1c: 5.808, weight: 66.328, waist: 88.992, hscrp: 2.012,
    hdl: 56.149, sbp: 122.609, dbp: 75.685, pulse: 70.659,
  },
  gapSD: 10.772, // SD разрыва BA − CA в обучающей выборке
};

const MMOL_TO_MGDL = 38.67; // ХС-ЛПВП: ммоль/л → мг/дл

/* Ссылки на финальном экране.
 * Threads: если квиз открыт по ссылке вида ...?post=<url-поста>,
 * кнопка ведёт именно в этот пост (можно шарить квиз из разных постов).
 * Иначе — запасная ссылка ниже. */
const LINKS = {
  threadsFallback: "https://www.threads.com",
  wowfit: "https://wowfit.ru",
  // telegramBot: "https://t.me/<бот>", // бот ещё не создан — кнопка «Узнать позже» скрыта
};
function threadsUrl() {
  const post = new URLSearchParams(location.search).get("post");
  if (post && /^https?:\/\/(www\.)?threads\.(com|net)\//.test(post)) return post;
  return LINKS.threadsFallback;
}

function biologicalAge(v) {
  const c = MODEL.coef;
  return MODEL.intercept
    + c.hba1c * v.hba1c + c.weight * v.weight + c.waist * v.waist
    + c.hscrp * v.hscrp + c.hdl * v.hdl + c.sbp * v.sbp
    + c.dbp * v.dbp + c.pulse * v.pulse + c.sex * v.sex;
}

// Φ(x) — нормальная CDF (аппроксимация Абрамовица–Стигана)
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/* =====================================================================
 * Конфиг шагов — копирайт и порядок правятся здесь, не в движке
 * =================================================================== */
const STEPS = [
  { kind: "cover" },
  {
    kind: "number", key: "age", emoji: "🎂",
    title: "Сколько вам лет по паспорту?",
    sub: "От этой точки посчитаем, куда качнулись биологические часы.",
    unit: "лет", min: 18, max: 90, step: 1, def: 40,
  },
  {
    kind: "choice", key: "sex", emoji: "🧬",
    title: "Ваш пол",
    sub: "Мужской и женский организмы стареют по-разному — модель это учитывает.",
    options: [
      { value: 1, label: "Мужской", emoji: "👨" },
      { value: 2, label: "Женский", emoji: "👩" },
    ],
  },
  {
    kind: "number", key: "weight", emoji: "⚖️",
    title: "Ваш вес",
    sub: "Примерно — точность до килограмма достаточна.",
    unit: "кг", min: 40, max: 150, step: 1, def: 70,
  },
  {
    kind: "number", key: "waist", emoji: "📏",
    title: "Обхват талии",
    sub: "Один из самых сильных маркеров метаболического здоровья.",
    unit: "см", min: 55, max: 140, step: 1, def: 85,
    hint: "<b>Как измерить:</b> сантиметровой лентой на уровне пупка, стоя, на выдохе, не втягивая живот.",
  },
  {
    kind: "bp", key: "bp", emoji: "🫀",
    title: "Артериальное давление",
    sub: "В покое: «верхнее» и «нижнее». Если мерили недавно — вспомните обычные цифры.",
    naLabel: "Не знаю своё давление",
    hint: "<b>Нет тонометра?</b> Отметьте «не знаю» — подставим среднее по выборке, но оценка станет менее точной.",
  },
  {
    kind: "number", key: "pulse", emoji: "💓",
    title: "Пульс в покое",
    sub: "Сидя, после 5 минут спокойствия.",
    unit: "уд/мин", min: 40, max: 120, step: 1, def: 68, na: true,
    naLabel: "Не знаю свой пульс",
    hint: "<b>Измерьте прямо сейчас:</b> найдите пульс на запястье, посчитайте удары за 15 секунд и умножьте на 4. Или подсмотрите в фитнес-браслете.",
  },
  {
    kind: "interlude", emoji: "🔬",
    title: "Остался последний блок — анализы крови",
    sub: "Три лабораторных маркера. Их можно найти в любом недавнем чекапе или биохимии крови.",
    facts: [
      { icon: "🩸", text: "<b>HbA1c</b> — «средний сахар» за 3 месяца, маркер гликирования." },
      { icon: "🛡️", text: "<b>hs-CRP</b> — тихое хроническое воспаление, драйвер старения." },
      { icon: "💧", text: "<b>ЛПВП</b> — «хороший» холестерин, защитник сосудов." },
    ],
    note: "Нет анализов под рукой? Любой пункт можно пропустить — оценка просто будет грубее.",
    cta: "Понятно, дальше",
  },
  {
    kind: "number", key: "hba1c", emoji: "🩸",
    title: "Гликированный гемоглобин HbA1c",
    sub: "В бланке анализа: «HbA1c» или «гликированный гемоглобин», в процентах.",
    unit: "%", min: 4, max: 12, step: 0.1, def: 5.4, na: true,
    naLabel: "Не сдавал(а) / не помню",
    hint: "<b>Ориентир:</b> норма — до 5,7%. Выше 6,5% — зона диабета.",
  },
  {
    kind: "hdl", key: "hdl", emoji: "💧",
    title: "«Хороший» холестерин ЛПВП",
    sub: "В бланке: «ЛПВП», «HDL» или «HDL-C». Выберите единицы как в вашем анализе.",
    naLabel: "Не сдавал(а) / не помню",
    hint: "<b>Ориентир:</b> в российских бланках чаще ммоль/л. Хорошо, когда у мужчин выше 1,0, у женщин выше 1,3 ммоль/л.",
  },
  {
    kind: "number", key: "hscrp", emoji: "🛡️",
    title: "С-реактивный белок (hs-CRP)",
    sub: "В бланке: «СРБ высокочувствительный» или «hs-CRP», в мг/л.",
    unit: "мг/л", min: 0.1, max: 20, step: 0.1, def: 1, na: true,
    naLabel: "Не сдавал(а) / не помню",
    hint: "<b>Важно:</b> нужен именно высокочувствительный СРБ. Если недавно болели — значение может быть завышено.",
  },
  { kind: "calc" },
  { kind: "result" },
];

/* =====================================================================
 * Состояние и движок
 * =================================================================== */
const state = {
  step: 0,
  dir: 1,
  answers: {},   // key -> value | null (null = «не знаю»)
  hdlUnit: "mmol",
};

const stage = document.getElementById("stage");
const topbar = document.getElementById("topbar");
const backBtn = document.getElementById("backBtn");
const progressFill = document.getElementById("progressFill");
const stepCounter = document.getElementById("stepCounter");

/* Сквозная ссылка «Пройти потом» — одна точка настройки.
 * Сценарий ещё не выбран (бот / сбор контакта / напоминание),
 * поэтому пока заглушка. Вся логика ссылки живёт здесь. */
function laterAction() {
  // TODO: подключить сценарий «пройти потом»
}

// Ссылка живёт под главной кнопкой экрана; на экранах без кнопки
// (выбор пола, расчёт) встаёт в конец карточки.
function attachLaterLink() {
  const card = stage.firstElementChild;
  if (!card) return;
  // На обложке host — сама карточка, поэтому ссылка встаёт после подписи
  // «9 вопросов, 2 минуты…», а не сразу под кнопкой.
  const host = card.querySelector(".next-wrap, .result-actions") || card;
  const link = el(`<button class="later-btn">Пройти потом</button>`);
  link.addEventListener("click", laterAction);
  // На результате кнопок несколько — ссылка встаёт в конец, чтобы их не разрывать.
  const btn = host.classList.contains("result-actions") ? null : host.querySelector(".btn-primary");
  if (btn && btn.parentElement === host) btn.insertAdjacentElement("afterend", link);
  else host.appendChild(link);
}

backBtn.addEventListener("click", () => {
  if (state.step > 0) { state.dir = -1; state.step--; render(); }
});

function go(delta) {
  state.dir = delta;
  state.step += delta;
  render();
}

function render() {
  const step = STEPS[state.step];
  const qSteps = STEPS.filter(s => !["cover", "calc", "result"].includes(s.kind)).length;
  const qIndex = STEPS.slice(0, state.step).filter(s => !["cover", "calc", "result"].includes(s.kind)).length;

  const showBar = !["cover", "calc", "result"].includes(step.kind);
  topbar.hidden = !showBar;
  if (showBar) {
    progressFill.style.width = `${Math.round((qIndex / qSteps) * 100)}%`;
    stepCounter.textContent = `${qIndex + 1} / ${qSteps}`;
    backBtn.disabled = state.step === 0;
  }

  stage.innerHTML = "";
  const renderers = {
    cover: renderCover, choice: renderChoice, number: renderNumber,
    bp: renderBP, hdl: renderHDL, interlude: renderInterlude,
    calc: renderCalc, result: renderResult,
  };
  renderers[step.kind](step);
  attachLaterLink();
  if (state.dir === -1) {
    const card = stage.firstElementChild;
    if (card) card.classList.add("slide-back");
  }
  window.scrollTo({ top: 0 });
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ============ Cover ============ */
function renderCover() {
  const card = el(`
    <div class="card cover">
      <div class="cover-emoji">⏳</div>
      <h1>Ваши часы идут <span>быстрее</span> или <span>медленнее</span> паспорта?</h1>
      <p class="cover-sub">Биологический возраст — показатель того, насколько молодым чувствует себя ваше тело. Оценим его по 9 показателям здоровья.</p>
      <div class="cover-badges">
        <span class="badge">⏱️ 2 минуты</span>
        <span class="badge">🆓 Бесплатно</span>
      </div>
      <div class="cover-actions">
        <button class="btn-primary">Узнать свой биологический возраст</button>
      </div>
      <p class="cover-note">9 вопросов, 2 минуты.<br>Анализы крови — по желанию, без них тоже посчитаем.</p>
    </div>`);
  card.querySelector(".btn-primary").addEventListener("click", () => go(1));
  stage.appendChild(card);
}

/* ============ Choice ============ */
function renderChoice(step) {
  const card = el(`
    <div class="card">
      <div class="q-emoji">${step.emoji}</div>
      <h2 class="q-title">${step.title}</h2>
      <p class="q-sub">${step.sub}</p>
      <div class="choice-grid"></div>
    </div>`);
  const grid = card.querySelector(".choice-grid");
  step.options.forEach(opt => {
    const b = el(`<button class="choice-btn"><span class="ce">${opt.emoji}</span>${opt.label}</button>`);
    if (state.answers[step.key] === opt.value) b.classList.add("selected");
    b.addEventListener("click", () => {
      state.answers[step.key] = opt.value;
      b.classList.add("selected");
      setTimeout(() => go(1), 220);
    });
    grid.appendChild(b);
  });
  stage.appendChild(card);
}

/* ============ Number (slider + steppers, optional NA) ============ */
function fmt(val, step) {
  return step < 1 ? val.toFixed(1).replace(".", ",") : String(Math.round(val));
}

function renderNumber(step) {
  const saved = state.answers[step.key];
  const isNA = saved === null;
  let val = (typeof saved === "number") ? saved : step.def;

  const card = el(`
    <div class="card">
      <div class="q-emoji">${step.emoji}</div>
      <h2 class="q-title">${step.title}</h2>
      <p class="q-sub">${step.sub}</p>
      <div class="num-block">
        <div class="num-display">
          <span class="num-value"></span><span class="num-unit">${step.unit}</span>
        </div>
        <div class="num-row">
          <button class="stepper" data-d="-1">−</button>
          <input type="range" min="${step.min}" max="${step.max}" step="${step.step}">
          <button class="stepper" data-d="1">+</button>
        </div>
      </div>
      ${step.na ? `<label class="na-toggle"><input type="checkbox" ${isNA ? "checked" : ""}><span>${step.naLabel}</span></label>` : ""}
      ${step.hint ? `<div class="q-hint">${step.hint}</div>` : ""}
      <div class="next-wrap"><button class="btn-primary">Дальше</button></div>
    </div>`);

  const numBlock = card.querySelector(".num-block");
  const valueEl = card.querySelector(".num-value");
  const range = card.querySelector("input[type=range]");
  const naCheck = card.querySelector(".na-toggle input");

  function sync() {
    valueEl.textContent = fmt(val, step.step);
    range.value = val;
    if (naCheck) numBlock.classList.toggle("disabled", naCheck.checked);
  }
  range.addEventListener("input", () => { val = parseFloat(range.value); sync(); });
  card.querySelectorAll(".stepper").forEach(b => b.addEventListener("click", () => {
    val = Math.min(step.max, Math.max(step.min, val + step.step * Number(b.dataset.d)));
    val = Math.round(val * 10) / 10;
    sync();
  }));
  if (naCheck) naCheck.addEventListener("change", sync);

  card.querySelector(".btn-primary").addEventListener("click", () => {
    state.answers[step.key] = (naCheck && naCheck.checked) ? null : val;
    go(1);
  });
  sync();
  stage.appendChild(card);
}

/* ============ Blood pressure (two fields) ============ */
function renderBP(step) {
  const saved = state.answers.bp;
  const isNA = saved === null;
  let sbp = (saved && saved.sbp) || 120;
  let dbp = (saved && saved.dbp) || 76;

  const card = el(`
    <div class="card">
      <div class="q-emoji">${step.emoji}</div>
      <h2 class="q-title">${step.title}</h2>
      <p class="q-sub">${step.sub}</p>
      <div class="num-block">
        <div class="dual-fields">
          <div>
            <div class="field-label">Верхнее</div>
            <div class="num-display"><span class="num-value" id="sbpVal"></span></div>
            <input type="range" id="sbpRange" min="80" max="210" step="1">
          </div>
          <div>
            <div class="field-label">Нижнее</div>
            <div class="num-display"><span class="num-value" id="dbpVal"></span></div>
            <input type="range" id="dbpRange" min="45" max="130" step="1">
          </div>
        </div>
      </div>
      <label class="na-toggle"><input type="checkbox" ${isNA ? "checked" : ""}><span>${step.naLabel}</span></label>
      <div class="q-hint">${step.hint}</div>
      <div class="next-wrap"><button class="btn-primary">Дальше</button></div>
    </div>`);

  const numBlock = card.querySelector(".num-block");
  const naCheck = card.querySelector(".na-toggle input");
  const sbpVal = card.querySelector("#sbpVal"), dbpVal = card.querySelector("#dbpVal");
  const sbpRange = card.querySelector("#sbpRange"), dbpRange = card.querySelector("#dbpRange");

  function sync() {
    sbpVal.textContent = sbp; dbpVal.textContent = dbp;
    sbpRange.value = sbp; dbpRange.value = dbp;
    numBlock.classList.toggle("disabled", naCheck.checked);
  }
  sbpRange.addEventListener("input", () => { sbp = +sbpRange.value; sync(); });
  dbpRange.addEventListener("input", () => { dbp = +dbpRange.value; sync(); });
  naCheck.addEventListener("change", sync);

  card.querySelector(".btn-primary").addEventListener("click", () => {
    state.answers.bp = naCheck.checked ? null : { sbp, dbp };
    go(1);
  });
  sync();
  stage.appendChild(card);
}

/* ============ HDL (unit toggle) ============ */
function renderHDL(step) {
  const saved = state.answers.hdl; // хранится в мг/дл
  const isNA = saved === null;
  let unit = state.hdlUnit;
  let mgdl = (typeof saved === "number") ? saved : 54;

  const card = el(`
    <div class="card">
      <div class="q-emoji">${step.emoji}</div>
      <h2 class="q-title">${step.title}</h2>
      <p class="q-sub">${step.sub}</p>
      <div class="unit-toggle">
        <button data-u="mmol">ммоль/л</button>
        <button data-u="mgdl">мг/дл</button>
      </div>
      <div class="num-block">
        <div class="num-display"><span class="num-value"></span><span class="num-unit"></span></div>
        <div class="num-row">
          <button class="stepper" data-d="-1">−</button>
          <input type="range">
          <button class="stepper" data-d="1">+</button>
        </div>
      </div>
      <label class="na-toggle"><input type="checkbox" ${isNA ? "checked" : ""}><span>${step.naLabel}</span></label>
      <div class="q-hint">${step.hint}</div>
      <div class="next-wrap"><button class="btn-primary">Дальше</button></div>
    </div>`);

  const numBlock = card.querySelector(".num-block");
  const valueEl = card.querySelector(".num-value");
  const unitEl = card.querySelector(".num-unit");
  const range = card.querySelector("input[type=range]");
  const naCheck = card.querySelector(".na-toggle input");
  const unitBtns = card.querySelectorAll(".unit-toggle button");

  function conf() {
    return unit === "mmol"
      ? { min: 0.5, max: 3.5, step: 0.05, label: "ммоль/л", get: () => mgdl / MMOL_TO_MGDL, set: x => mgdl = x * MMOL_TO_MGDL }
      : { min: 20, max: 135, step: 1, label: "мг/дл", get: () => mgdl, set: x => mgdl = x };
  }
  function sync() {
    const c = conf();
    unitBtns.forEach(b => b.classList.toggle("on", b.dataset.u === unit));
    range.min = c.min; range.max = c.max; range.step = c.step;
    const shown = Math.min(c.max, Math.max(c.min, c.get()));
    range.value = shown;
    valueEl.textContent = unit === "mmol" ? shown.toFixed(2).replace(".", ",") : String(Math.round(shown));
    unitEl.textContent = c.label;
    numBlock.classList.toggle("disabled", naCheck.checked);
  }
  unitBtns.forEach(b => b.addEventListener("click", () => { unit = b.dataset.u; state.hdlUnit = unit; sync(); }));
  range.addEventListener("input", () => { conf().set(parseFloat(range.value)); sync(); });
  card.querySelectorAll(".stepper").forEach(b => b.addEventListener("click", () => {
    const c = conf();
    const next = Math.min(c.max, Math.max(c.min, c.get() + c.step * Number(b.dataset.d)));
    c.set(next); sync();
  }));
  naCheck.addEventListener("change", sync);

  card.querySelector(".btn-primary").addEventListener("click", () => {
    state.answers.hdl = naCheck.checked ? null : Math.round(mgdl * 10) / 10;
    go(1);
  });
  sync();
  stage.appendChild(card);
}

/* ============ Interlude ============ */
function renderInterlude(step) {
  const card = el(`
    <div class="card interlude">
      <div class="q-emoji">${step.emoji}</div>
      <h2 class="q-title">${step.title}</h2>
      <p class="q-sub">${step.sub}</p>
      <div class="fact-list">
        ${step.facts.map(f => `<div class="fact-item"><span class="fi">${f.icon}</span><span>${f.text}</span></div>`).join("")}
      </div>
      <p class="q-sub" style="font-size:13px; margin-top:14px;">${step.note}</p>
      <button class="btn-primary">${step.cta}</button>
    </div>`);
  card.querySelector(".btn-primary").addEventListener("click", () => go(1));
  stage.appendChild(card);
}

/* ============ Calculating ============ */
function renderCalc() {
  const phrases = [
    "Считываем биомаркеры…",
    "Сравниваем с выборкой из 276 участников…",
    "Калибруем модель под ваш профиль…",
    "Останавливаем часы… готово!",
  ];
  const card = el(`
    <div class="card calc-screen">
      <div class="pulse-ring">🧬</div>
      <h2 class="q-title">Анализируем ваши показатели</h2>
      <p class="calc-status"></p>
    </div>`);
  stage.appendChild(card);
  const status = card.querySelector(".calc-status");
  let i = 0;
  status.textContent = phrases[0];
  const timer = setInterval(() => {
    i++;
    if (i < phrases.length) { status.textContent = phrases[i]; }
    else { clearInterval(timer); go(1); }
  }, 800);
}

/* ============ Result ============ */
function computeResult() {
  const a = state.answers;
  const imputed = [];
  function pick(key, val, mean) {
    if (val === null || val === undefined) { imputed.push(key); return mean; }
    return val;
  }
  const v = {
    hba1c: pick("hba1c", a.hba1c, MODEL.means.hba1c),
    weight: pick("weight", a.weight, MODEL.means.weight),
    waist: pick("waist", a.waist, MODEL.means.waist),
    hscrp: pick("hscrp", a.hscrp, MODEL.means.hscrp),
    hdl: pick("hdl", a.hdl, MODEL.means.hdl),
    sbp: a.bp ? a.bp.sbp : pick("bp", null, MODEL.means.sbp),
    dbp: a.bp ? a.bp.dbp : MODEL.means.dbp,
    pulse: pick("pulse", a.pulse, MODEL.means.pulse),
    sex: a.sex,
  };
  const ba = biologicalAge(v);
  const gap = ba - a.age;
  // Доля выборки с бОльшим (худшим) разрывом
  const betterThan = Math.min(99, Math.max(1, Math.round((1 - normCDF(gap / MODEL.gapSD)) * 100)));
  return { v, ba, gap, betterThan, imputed: [...new Set(imputed)] };
}

function markerStatuses(r) {
  const a = state.answers, v = r.v;
  const male = a.sex === 1;
  const rows = [];
  function row(name, key, valueText, status, statusText) {
    rows.push({ name, key, valueText, status, statusText });
  }
  const naText = "не указано — взято среднее по выборке";

  // HbA1c
  if (a.hba1c == null) row("HbA1c", "hba1c", "—", "na", naText);
  else row("HbA1c", "hba1c", `${fmt(v.hba1c, 0.1)} %`,
    v.hba1c < 5.7 ? "good" : v.hba1c < 6.5 ? "warn" : "risk",
    v.hba1c < 5.7 ? "в оптимальной зоне" : v.hba1c < 6.5 ? "преддиабетная зона (5,7–6,4%)" : "зона диабета — обсудите с врачом");

  // hs-CRP
  if (a.hscrp == null) row("hs-CRP (воспаление)", "hscrp", "—", "na", naText);
  else row("hs-CRP (воспаление)", "hscrp", `${fmt(v.hscrp, 0.1)} мг/л`,
    v.hscrp < 1 ? "good" : v.hscrp <= 3 ? "warn" : "risk",
    v.hscrp < 1 ? "низкое воспаление" : v.hscrp <= 3 ? "умеренное воспаление" : "повышенное воспаление");

  // HDL
  if (a.hdl == null) row("ЛПВП («хороший» холестерин)", "hdl", "—", "na", naText);
  else {
    const mmol = v.hdl / MMOL_TO_MGDL;
    const low = male ? 1.0 : 1.3;
    row("ЛПВП («хороший» холестерин)", "hdl", `${mmol.toFixed(2).replace(".", ",")} ммоль/л`,
      mmol >= 1.55 ? "good" : mmol >= low ? "good" : "warn",
      mmol >= 1.55 ? "защитный уровень" : mmol >= low ? "в норме" : "ниже нормы");
  }

  // Давление
  if (a.bp == null) row("Давление", "bp", "—", "na", naText);
  else {
    const { sbp, dbp } = a.bp;
    const status = (sbp < 130 && dbp < 85) ? "good" : (sbp < 140 && dbp < 90) ? "warn" : "risk";
    row("Давление", "bp", `${sbp}/${dbp}`,
      status,
      status === "good" ? (sbp < 120 && dbp < 80 ? "оптимальное" : "в норме") : status === "warn" ? "на верхней границе нормы" : "повышенное — стоит контролировать");
  }

  // Пульс
  if (a.pulse == null) row("Пульс в покое", "pulse", "—", "na", naText);
  else row("Пульс в покое", "pulse", `${v.pulse} уд/мин`,
    v.pulse < 60 ? "good" : v.pulse <= 80 ? "good" : v.pulse <= 90 ? "warn" : "risk",
    v.pulse < 60 ? "как у тренированных людей" : v.pulse <= 80 ? "в норме" : v.pulse <= 90 ? "слегка повышен" : "повышен");

  // Талия
  const waistLimit = male ? { ok: 94, risk: 102 } : { ok: 80, risk: 88 };
  row("Талия", "waist", `${v.waist} см`,
    v.waist < waistLimit.ok ? "good" : v.waist < waistLimit.risk ? "warn" : "risk",
    v.waist < waistLimit.ok ? "в безопасной зоне" : v.waist < waistLimit.risk ? "пограничная зона" : "зона метаболического риска");

  return rows;
}

const TIPS = {
  hba1c: "<b>Снизить HbA1c:</b> меньше быстрых углеводов, прогулка 10–15 минут после еды, силовые 2 раза в неделю — мышцы главный «утилизатор» глюкозы.",
  hscrp: "<b>Снизить воспаление:</b> сон 7–8 часов, жирная рыба 2 раза в неделю, меньше ультрапереработанной еды и алкоголя.",
  hdl: "<b>Поднять ЛПВП:</b> регулярное кардио, отказ от курения, оливковое масло и орехи вместо трансжиров.",
  bp: "<b>Снизить давление:</b> меньше соли (до 5 г/день), больше калия (овощи, бобовые), регулярное кардио и контроль стресса.",
  pulse: "<b>Снизить пульс покоя:</b> аэробные тренировки 150+ минут в неделю — сердце становится экономичнее буквально за 2–3 месяца.",
  waist: "<b>Уменьшить талию:</b> дефицит калорий + белок в каждом приёме пищи + 8–10 тысяч шагов в день работают лучше любых «жиросжигателей».",
};

function renderResult() {
  const r = computeResult();
  const a = state.answers;
  const baShown = Math.round(r.ba);
  const gapRounded = Math.round(Math.abs(r.gap));

  let gapClass, gapText;
  if (r.gap <= -2) { gapClass = "younger"; gapText = `🎉 На ${gapRounded} ${plural(gapRounded)} моложе паспорта`; }
  else if (r.gap < 2) { gapClass = "same"; gapText = "⚖️ Совпадает с паспортным возрастом"; }
  else { gapClass = "older"; gapText = `⚠️ На ${gapRounded} ${plural(gapRounded)} старше паспорта`; }

  // Позиция маркера на шкале CA−15 … CA+15
  const pos = Math.min(97, Math.max(3, 50 + (r.gap / 15) * 50));

  const rows = markerStatuses(r);
  const iconOf = { good: "✓", warn: "!", risk: "▲", na: "–" };
  const tipRows = rows.filter(x => x.status === "warn" || x.status === "risk").slice(0, 2);

  const card = el(`
    <div>
      <div class="result-hero">
        <div class="rh-label">Ваш биологический возраст</div>
        <div class="rh-number"><span id="baCount">0</span><small> ${plural(baShown)}</small></div>
        <div class="rh-gap ${gapClass}">${gapText}</div>
        <div class="scale-wrap">
          <div class="scale-track"><div class="scale-marker" style="left:50%"></div></div>
          <div class="scale-labels"><span>моложе</span><span>паспорт: ${a.age}</span><span>старше</span></div>
        </div>
        <div class="rh-percentile">Разрыв «биология − паспорт» у вас меньше, чем у ${r.betterThan}% участников исследования</div>
      </div>

      <div class="card section-card">
        <div class="section-title">Ваши маркеры под микроскопом</div>
        ${rows.map(x => `
          <div class="marker-row">
            <div class="marker-icon ${x.status}">${iconOf[x.status]}</div>
            <div class="marker-info">
              <div class="marker-name">${x.name}</div>
              <div class="marker-status">${x.statusText}</div>
            </div>
            <div class="marker-value">${x.valueText}</div>
          </div>`).join("")}
        ${r.imputed.length ? `<div class="precision-note">⚠️ Вы пропустили ${r.imputed.length} ${pluralPok(r.imputed.length)} — вместо них подставлены средние значения выборки, поэтому оценка приблизительная. Сдайте анализы и вернитесь за точным результатом.</div>` : ""}
      </div>

      ${tipRows.length ? `
      <div class="card section-card">
        <div class="section-title">С чего начать отматывать часы</div>
        ${tipRows.map(x => `<div class="tip-card">${TIPS[x.key]}</div>`).join("")}
      </div>` : `
      <div class="card section-card">
        <div class="section-title">Так держать 👏</div>
        <div class="tip-card">Все указанные маркеры в хорошей зоне. Лучшее, что можно сделать, — повторять замеры раз в полгода и следить за трендом, а не за разовой цифрой.</div>
      </div>`}

      <div class="result-actions">
        <button class="btn-primary" id="threadsBtn">💬 Вернуться в Threads и поделиться</button>
        <div class="copy-toast" id="copyToast" hidden>Результат скопирован — вставьте его в комментарий ✌️</div>
        <a class="btn-secondary" href="${LINKS.wowfit}" target="_blank" rel="noopener">Узнать больше про WowFit</a>
        <button class="btn-ghost" id="restartBtn">Пройти тест заново</button>
      </div>

      <p class="disclaimer">Оценка построена на популяционной линейной модели Healthspan Copilot (National University of Singapore), обученной на выборке NHANES/CDC (n = 276). Это экспериментальный индекс здоровья, а не медицинская диагностика и не валидированные «часы старения». Результат не заменяет консультацию врача.</p>
    </div>`);

  card.querySelector("#restartBtn").addEventListener("click", () => {
    state.answers = {}; state.step = 0; state.dir = 1; render();
  });
  card.querySelector("#threadsBtn").addEventListener("click", () => {
    const text = `Мой биологический возраст: ${baShown} ${plural(baShown)} (по паспорту ${a.age}). ${r.gap <= -2 ? `Биологически я моложе на ${gapRounded}! 🎉 ` : ""}Проверь свой: ${location.origin + location.pathname}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    card.querySelector("#copyToast").hidden = false;
    window.open(threadsUrl(), "_blank", "noopener");
  });

  stage.appendChild(card);

  // Анимация числа
  const countEl = card.querySelector("#baCount");
  const dur = 1400, t0 = performance.now();
  function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    countEl.textContent = Math.round(baShown * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Маркер шкалы
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.querySelector(".scale-marker").style.left = pos + "%";
  }));

  if (r.gap <= -2) confetti();
}

function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "год";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "года";
  return "лет";
}
function pluralPok(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "показатель";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "показателя";
  return "показателей";
}

function confetti() {
  const colors = ["#7b87e8", "#4ade80", "#fbbf24", "#f472b6", "#a6aef0"];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    const size = 6 + (i % 5) * 2;
    c.style.cssText = `left:${(i * 7.3) % 100}vw; width:${size}px; height:${size * 1.4}px;` +
      `background:${colors[i % colors.length]};` +
      `animation-duration:${2.2 + (i % 7) * 0.35}s; animation-delay:${(i % 10) * 0.12}s;`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6500);
  }
}

render();
