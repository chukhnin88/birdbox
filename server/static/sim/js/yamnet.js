// Real pretrained environmental audio classifier using MediaPipe Audio Classifier + YAMNet.
// Requires internet access to load the JS runtime, WASM and model files.
import { AudioClassifier, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.14/+esm";

const startButton = document.getElementById('startYamnet');
const stopButton = document.getElementById('stopYamnet');
const statusEl = document.getElementById('yamnetStatus');
const resultsEl = document.getElementById('yamnetResults');
let classifier = null;
let stream = null;
let audioContext = null;
let processor = null;
let source = null;
let busy = false;
let lastRun = 0;
const motorDetectionEl = document.getElementById('motorDetection');

// YAMNet уже содержит несколько классов, связанных с двигателями.
// Объединяем их в понятную категорию, не меняя и не подменяя классы самой модели.
function updateMotorDetection(categories) {
  if (!motorDetectionEl) return;

  const motorPattern = /(engine|motor|revving|idling|vroom|accelerat)/i;
  const matches = categories
    .map(category => ({
      label: String(category.displayName || category.categoryName || 'Unknown'),
      score: Number(category.score) || 0
    }))
    .filter(item => motorPattern.test(item.label))
    .sort((a, b) => b.score - a.score);

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  if (!matches.length || matches[0].score < 0.08) {
    motorDetectionEl.innerHTML =
      '<b>Распознавание мотора:</b> уверенного совпадения пока нет. ' +
      'Это не означает, что мотора точно нет: модель могла отнести звук к другой категории.';
    return;
  }

  const best = matches[0];
  const details = matches.slice(0, 3).map(item =>
    `${escapeHtml(translateLabel(item.label).text)} — ${(item.score * 100).toFixed(1)}%`
  ).join('<br>');

  const confidenceText = best.score >= 0.25
    ? 'Модель обнаружила признаки звука двигателя.'
    : 'Есть слабое или предварительное совпадение с двигателем.';

  motorDetectionEl.innerHTML =
    `<b>Распознавание мотора:</b> ${confidenceText}<br>` +
    `<b>${escapeHtml(translateLabel(best.label).text)}</b> — ${(best.score * 100).toFixed(1)}%` +
    (matches.length > 1 ? `<br><span class="hint">Другие совпадения:</span><br>${details}` : '') +
    '<br><span class="hint">Это оценка YAMNet, а не гарантированное определение любого мотора.</span>';
}

// Переводы распространённых меток YAMNet / AudioSet.
// Модель возвращает исходные английские метки; переводим их только для интерфейса.
// Переводы меток YAMNet / AudioSet (521 класс).
// Сгруппировано по онтологии AudioSet. Неизвестные метки
// дополнительно обрабатываются в translateLabel().
// ВАЖНО: ключи не удалять даже при совпадении перевода —
// иначе YAMNet не сможет перевести соответствующую метку.
const RU_LABELS = {
  // ── Human sounds: речь и голос ────────────────────────────────
  "Speech": "Речь",
  "Child speech, kid speaking": "Детская речь",
  "Conversation": "Разговор",
  "Narration, monologue": "Рассказ / монолог",
  "Babbling": "Неразборчивая речь",
  "Speech synthesizer": "Синтезированная речь",
  "Shout": "Крик",
  "Bellow": "Громкий крик",
  "Whoop": "Возглас",
  "Yell": "Крик",
  "Children shouting": "Дети кричат",
  "Screaming": "Визг / крик",
  "Whispering": "Шёпот",
  "Laughter": "Смех",
  "Baby laughter": "Смех ребёнка",
  "Giggle": "Хихиканье",
  "Snicker": "Сдержанный смешок",
  "Belly laugh": "Раскатистый смех",
  "Chuckle, chortle": "Посмеивание",
  "Crying, sobbing": "Плач",
  "Baby cry, infant cry": "Плач младенца",
  "Whimper": "Скулёж / хныканье",
  "Wail, moan": "Вопль / стон",
  "Sigh": "Вздох",
  "Singing": "Пение",
  "Choir": "Хор",
  "Yodeling": "Йодль",
  "Chant": "Речитатив / скандирование",
  "Mantra": "Мантра",
  "Male singing": "Мужское пение",
  "Female singing": "Женское пение",
  "Child singing": "Детское пение",
  "Synthetic singing": "Синтезированное пение",
  "Humming": "Напевание",
  "Groan": "Стон",
  "Grunt": "Кряхтение",
  "Whistling": "Свист",
  "Breathing": "Дыхание",
  "Wheeze": "Хрип",
  "Snoring": "Храп",
  "Gasp": "Резкий вдох",
  "Pant": "Тяжёлое дыхание",
  "Snort": "Фырканье",
  "Cough": "Кашель",
  "Sneeze": "Чихание",
  "Sniff": "Шмыганье носом",
  "Throat clearing": "Покашливание / прочистка горла",
  "Burping, eructation": "Отрыжка",
  "Hiccup": "Икота",
  "Fart": "Звук кишечника",
  "Chewing, mastication": "Жевание",
  "Biting": "Кусание",
  "Gargling": "Полоскание горла",
  "Stomach rumble": "Урчание в животе",
  "Heart sounds, heartbeat": "Сердцебиение",
  "Heart murmur": "Шум сердца",
  "Cheering": "Ликование / одобрительные крики",
  "Applause": "Аплодисменты",
  "Finger snapping": "Щелчок пальцами",
  "Hands": "Хлопки руками",
  "Clapping": "Аплодисменты",
  "Footsteps": "Шаги",
  "Walk, footsteps": "Шаги",
  "Run": "Бег",

  // ── Human sounds: телесные и бытовые ───────────────────────────
  "Brushing teeth": "Чистка зубов",
  "Brushing hair": "Расчёсывание волос",
  "Flushing toilet": "Смыв унитаза",
  "Dental drill, dentist's drill": "Стоматологическая бормашина",

  // ── Music: инструменты ─────────────────────────────────────────
  "Music": "Музыка",
  "Musical instrument": "Музыкальный инструмент",
  "Plucked string instrument": "Щипковый струнный инструмент",
  "Guitar": "Гитара",
  "Electric guitar": "Электрогитара",
  "Bass guitar": "Бас-гитара",
  "Acoustic guitar": "Акустическая гитара",
  "Steel guitar, slide guitar": "Стальная гитара / слайд-гитара",
  "Tapping (guitar technique)": "Тэппинг на гитаре",
  "Strum": "Бой по струнам",
  "Banjo": "Банджо",
  "Sitar": "Ситар",
  "Mandolin": "Мандолина",
  "Zither": "Цитра",
  "Ukulele": "Укулеле",
  "Harp": "Арфа",
  "Keyboard (musical)": "Клавишный инструмент",
  "Piano": "Фортепиано",
  "Electric piano": "Электропиано",
  "Organ": "Орган",
  "Electronic organ": "Электроорган",
  "Hammond organ": "Орган Хаммонда",
  "Synthesizer": "Синтезатор",
  "Sampler": "Сэмплер",
  "Harpsichord": "Клавесин",
  "Drum": "Барабан",
  "Drum kit": "Ударная установка",
  "Drum machine": "Драм-машина",
  "B snare drum": "Малый барабан",
  "Bass drum": "Большой барабан",
  "Snare drum": "Малый барабан",
  "Hi-hat": "Хай-хэт",
  "Cymbal": "Тарелка",
  "Ride cymbal": "Райд-тарелка",
  "Crash cymbal": "Крэш-тарелка",
  "Percussion": "Ударные инструменты",
  "Drum roll": "Барабанная дробь",
  "Timpani": "Литавры",
  "Gong": "Гонг",
  "Wood block": "Деревянный блок",
  "Tambourine": "Бубен",
  "Maraca": "Маракас",
  "Rattle (instrument)": "Трещотка",
  "Cowbell": "Коровий колокольчик",
  "Vibraphone": "Вибрафон",
  "Marimba, xylophone": "Маримба / ксилофон",
  "Glockenspiel": "Глокеншпиль",
  "Chime": "Колокольчик / чимес",
  "Bell": "Колокол",
  "Church bell": "Церковный колокол",
  "Jingle bell": "Бубенчик",
  "Bicycle bell": "Велосипедный звонок",
  "Tubular bells": "Трубчатые колокола",
  "Trumpet": "Труба",
  "Trombone": "Тромбон",
  "French horn": "Валторна",
  "Brass instrument": "Медный духовой инструмент",
  "Saxophone": "Саксофон",
  "Clarinet": "Кларнет",
  "Oboe": "Гобой",
  "Bassoon": "Фагот",
  "Flute": "Флейта",
  "Recorder": "Блокфлейта",
  "Pan flute": "Пан-флейта",
  "Harmonica": "Губная гармоника",
  "Accordion": "Аккордеон",
  "Bagpipes": "Волынка",
  "Didgeridoo": "Диджериду",
  "Violin, fiddle": "Скрипка",
  "Cello": "Виолончель",
  "Double bass": "Контрабас",
  "Viola": "Альт",
  "String section": "Струнная группа",
  "Bowed string instrument": "Смычковый струнный инструмент",
  "Pizzicato": "Пиццикато",
  "Orchestra": "Оркестр",
  "Brass band": "Духовой оркестр",

  // ── Music: жанры и вокал ───────────────────────────────────────
  "Rapping": "Рэп",
  "Beatboxing": "Битбокс",
  "Electronic music": "Электронная музыка",
  "Pop music": "Поп-музыка",
  "Hip hop music": "Хип-хоп",
  "Rock music": "Рок",
  "Heavy metal": "Хеви-метал",
  "Punk rock": "Панк-рок",
  "Grunge": "Гранж",
  "Progressive rock": "Прогрессивный рок",
  "Rock and roll": "Рок-н-ролл",
  "Psychedelic rock": "Психоделический рок",
  "Rhythm and blues": "Ритм-н-блюз",
  "Soul music": "Соул",
  "Reggae": "Регги",
  "Country": "Кантри",
  "Swing music": "Свинг",
  "Jazz": "Джаз",
  "Disco": "Диско",
  "Classical music": "Классическая музыка",
  "Opera": "Опера",
  "Ambient music": "Эмбиент",
  "Techno": "Техно",
  "House music": "Хаус",
  "Dubstep": "Дабстеп",
  "Funk": "Фанк",
  "Folk music": "Народная музыка",
  "Bluegrass": "Блюграсс",
  "Blues": "Блюз",
  "Gospel music": "Госпел",
  "Salsa": "Сальса",
  "Tango": "Танго",
  "Waltz": "Вальс",
  "March": "Марш",
  "Lullaby": "Колыбельная",
  "Christmas music": "Рождественская музыка",
  "Wedding music": "Свадебная музыка",
  "Happy music": "Весёлая музыка",
  "Sad music": "Грустная музыка",
  "Scary music": "Страшная музыка",
  "Soundtrack music": "Музыка из фильма",
  "Background music": "Фоновая музыка",
  "Jingle (music)": "Джингл",
  "Theme music": "Тематическая музыка",
  "Video game music": "Музыка из видеоигр",
  "Sound effect": "Звуковой эффект",

  // ── Music: структура и техника ─────────────────────────────────
  "Chord": "Аккорд",
  "Arpeggio": "Арпеджио",
  "Scale": "Гамма",
  "Harmony": "Гармония",
  "Melody": "Мелодия",
  "Tempo": "Темп",
  "Beat": "Ритм",
  "Rhythm": "Ритм",
  "Groove": "Грув",
  "Riff": "Рифф",
  "Solo": "Соло",
  "Vibrato": "Вибрато",
  "Tremolo": "Тремоло",
  "Glissando": "Глиссандо",
  "Staccato": "Стаккато",
  "Legato": "Легато",

  // ── Sounds of things: природа ─────────────────────────────────
  "Rain": "Дождь",
  "Raindrop": "Капля дождя",
  "Rain on surface": "Дождь по поверхности",
  "Rain on leaves": "Дождь по листьям",
  "Rain on metal": "Дождь по металлу",
  "Thunderstorm": "Гроза",
  "Thunder": "Гром",
  "Wind": "Ветер",
  "Wind noise (microphone)": "Ветер в микрофоне",
  "Rustling leaves": "Шелест листьев",
  "Crackling fire": "Треск огня",
  "Fire": "Огонь",
  "Firecracker": "Петарда",
  "Fireworks": "Фейерверк",
  "Water": "Вода",
  "Stream": "Ручей",
  "Waterfall": "Водопад",
  "Ocean": "Океан",
  "Waves, surf": "Морские волны",
  "Liquid": "Жидкость",
  "Pouring water": "Льётся вода",
  "Pour": "Наливание",
  "Drip": "Капанье",
  "Boiling": "Кипение",
  "Bubble": "Пузырьки",
  "Splash, splatter": "Всплеск",
  "Toilet flush": "Смыв унитаза",
  "Gurgling": "Бульканье",
  "Gush": "Поток воды",
  "Trickle, dribble": "Струйка / капанье",
  "Squirt": "Брызги",
  "Underwater": "Под водой",
  "Outside, rural or natural": "Природная обстановка на улице",

  // ── Sounds of things: животные ─────────────────────────────────
  "Animal": "Животное",
  "Wild animals": "Дикие животные",
  "Domestic animals, pets": "Домашние животные",
  "Livestock, farm animals": "Сельскохозяйственные животные",
  "Bird": "Птица",
  "Bird vocalization, bird call, bird song": "Пение / крики птиц",
  "Chirp, tweet": "Чириканье",
  "Squawk": "Резкий крик птицы",
  "Caw": "Карканье",
  "Owl": "Сова",
  "Hoot": "Уханье",
  "Crow": "Ворона",
  "Pigeon, dove": "Голубь",
  "Duck": "Утка",
  "Quack": "Кряканье",
  "Goose": "Гусь",
  "Honk": "Гоготание",
  "Chicken, rooster": "Курица / петух",
  "Rooster": "Петух",
  "Hen, chicken": "Курица",
  "Turkey": "Индюк",
  "Fowl": "Домашняя птица",
  "Gull, seagull": "Чайка",
  "Coo": "Воркование",
  "Dog": "Собака",
  "Bark": "Лай",
  "Yip": "Тявканье",
  "Howl": "Вой",
  "Bow-wow": "Гав-гав",
  "Growling": "Рычание",
  "Whimper (dog)": "Скулёж собаки",
  "Cat": "Кошка",
  "Meow": "Мяуканье",
  "Purr": "Мурлыканье",
  "Hiss": "Шипение",
  "Caterwaul": "Кошачий крик",
  "Horse": "Лошадь",
  "Clip-clop": "Цокот копыт",
  "Neigh, whinny": "Ржание",
  "Cattle, bovinae": "Крупный рогатый скот",
  "Moo": "Мыканье коровы",
  "Pig": "Свинья",
  "Oink": "Хрюканье",
  "Sheep": "Овца",
  "Bleat": "Блеяние",
  "Goat": "Коза",
  "Frog": "Лягушка",
  "Croak": "Кваканье",
  "Insect": "Насекомое",
  "Cricket": "Сверчок",
  "Mosquito": "Комар",
  "Fly, housefly": "Муха",
  "Bee, wasp, etc.": "Пчела / оса",
  "Buzz": "Жужжание",
  "Snake": "Змея",
  "Rattle (snake)": "Трещотка гремучей змеи",
  "Rodents, rats, mice": "Грызуны",
  "Mouse": "Мышь",
  "Squeak": "Писк",
  "Bat": "Летучая мышь",
  "Whale": "Кит",
  "Dolphin": "Дельфин",

  // ── Sounds of things: транспорт и техника ─────────────────────
  "Vehicle": "Транспорт",
  "Car": "Автомобиль",
  "Vehicle horn, car horn, honking": "Автомобильный гудок",
  "Car alarm": "Автосигнализация",
  "Truck": "Грузовик",
  "Bus": "Автобус",
  "Motorcycle": "Мотоцикл",
  "Traffic noise, roadway noise": "Шум дорожного движения",
  "Engine": "Двигатель",
  "Engine starting": "Запуск двигателя",
  "Engine idling": "Работа двигателя на холостом ходу",
  "Idling": "Работа двигателя на холостом ходу",
  "Accelerating, revving, vroom": "Разгон двигателя",
  "Aircraft": "Воздушное судно",
  "Airplane": "Самолёт",
  "Aircraft engine": "Авиационный двигатель",
  "Helicopter": "Вертолёт",
  "Train": "Поезд",
  "Rail transport": "Железнодорожный транспорт",
  "Subway, metro, underground": "Метро",
  "Boat, Water vehicle": "Лодка / водный транспорт",
  "Ship": "Корабль",
  "Bicycle": "Велосипед",
  "Skateboard": "Скейтборд",
  "Siren": "Сирена",
  "Civil defense siren": "Сирена оповещения",
  "Police car (siren)": "Полицейская сирена",
  "Fire engine, fire truck (siren)": "Пожарная сирена",
  "Ambulance (siren)": "Сирена скорой помощи",
  "Alarm": "Сигнал тревоги",
  "Alarm clock": "Будильник",
  "Smoke detector, smoke alarm": "Дымовой извещатель",
  "Doorbell": "Дверной звонок",
  "Telephone": "Телефон",
  "Telephone bell ringing": "Звонок телефона",
  "Ringtone": "Мелодия звонка",
  "Clock": "Часы",
  "Tick": "Тиканье",
  "Tick-tock": "Тиканье часов",
  "Mechanisms": "Механизмы",
  "Mechanical fan": "Механический вентилятор",
  "Printer": "Принтер",
  "Typing": "Печатание на клавиатуре",
  "Computer keyboard": "Компьютерная клавиатура",
  "Computer": "Компьютер",
  "Electronic buzzer": "Электронный зуммер",
  "Beep, bleep": "Звуковой сигнал",
  "Clicking": "Щелчки",
  "Clickety-clack": "Дробный стук",
  "Thump, thud": "Глухой удар",
  "Bang": "Громкий удар / хлопок",
  "Slap, smack": "Шлепок",
  "Knock": "Стук",
  "Tap": "Лёгкий стук",
  "Slam": "Резкий хлопок",
  "Crumpling, crinkling": "Шуршание / сминание",
  "Crushing": "Хруст / раздавливание",
  "Crack": "Треск",
  "Glass": "Стекло",
  "Glass breaking": "Разбивание стекла",
  "Shatter": "Разлетающееся стекло",
  "Wood": "Дерево",
  "Chop": "Рубящий удар",
  "Sawing": "Пиление",
  "Filing (rasp)": "Обработка напильником",
  "Sanding": "Шлифование",
  "Tools": "Инструменты",
  "Power tool": "Электроинструмент",
  "Drill": "Дрель",
  "Chainsaw": "Бензопила",
  "Hammer": "Молоток",
  "Jackhammer": "Отбойный молоток",
  "Explosion": "Взрыв",
  "Gunshot, gunfire": "Выстрел",
  "Machine gun": "Автоматная очередь",
  "Burst, pop": "Резкий хлопок",
  "Cap gun": "Игрушечный пистолет",
  "Artillery fire": "Артиллерийский огонь",

  // ── Sounds of things: быт и дом ───────────────────────────────
  "Door": "Дверь",
  "Door slam": "Хлопок дверью",
  "Knock (door)": "Стук в дверь",
  "Squeak (door)": "Скрип двери",
  "Creak": "Скрип",
  "Rattle": "Дребезг",
  "Hum": "Гул",
  "Whir": "Жужжание",
  "Vibration": "Вибрация",
  "Dishes, pots, and pans": "Посуда и кухонная утварь",
  "Cutlery, silverware": "Столовые приборы",
  "Frying (food)": "Жарка",
  "Chopping food": "Нарезка продуктов",
  "Vacuum cleaner": "Пылесос",
  "Washing machine": "Стиральная машина",
  "Water tap, faucet": "Водопроводный кран",
  "Toothbrush": "Зубная щётка",
  "Shaver, electric razor": "Электробритва",
  "Hair dryer": "Фен",
  "Blender": "Блендер",
  "Microwave oven": "Микроволновка",
  "Refrigerator": "Холодильник",
  "Kettle": "Чайник",
  "Zipper (clothing)": "Застёжка-молния",
  "Keys jangling": "Звон ключей",
  "Coin (dropping)": "Падающая монета",
  "Paper": "Бумага",
  "Writing": "Письмо ручкой",
  "Scissors": "Ножницы",
  "Velcro, hook and loop fastener": "Липучка",
  "Toilet": "Туалет",
  "Shower": "Душ",
  "Footsteps on snow": "Шаги по снегу",
  "Rustle": "Шорох",
  "Scratching (performance technique)": "Скрэтч",

  // ── Sounds of things: люди и толпа ───────────────────────────
  "Crowd": "Толпа",
  "Crowd noise": "Шум толпы",
  "Children playing": "Играющие дети",
  "Battle cry": "Боевой клич",

  // ── Sounds of things: обстановка и шум ───────────────────────
  "Silence": "Тишина",
  "Environmental noise": "Окружающий шум",
  "Noise": "Шум",
  "Static": "Статический шум",
  "White noise": "Белый шум",
  "Pink noise": "Розовый шум",
  "Sine wave": "Синусоидальный сигнал",
  "Frequency": "Частота",
  "Echo": "Эхо",
  "Reverberation": "Реверберация",
  "Inside, small room": "Звук в небольшом помещении",
  "Inside, large room or hall": "Звук в большом помещении",
  "Inside, public space": "Общественное помещение",
  "Outside, urban or manmade": "Городская уличная обстановка",
  "Domestic sounds, home sounds": "Домашние звуки",
};

function translateLabel(label) {
  const original = String(label || '').trim();
  if (!original) return { text: 'Неизвестный звук', translated: false };

  // 1. Точное совпадение в словаре
  if (RU_LABELS[original]) return { text: RU_LABELS[original], translated: true };

  // 2. Нормализация: снимаем пробелы в начале (артефакты вида "F ireworks")
  const squeezed = original.replace(/\s+/g, ' ').trim();
  if (RU_LABELS[squeezed]) return { text: RU_LABELS[squeezed], translated: true };

  // 3. Групповые паттерны для того, что не попало в словарь
  const lower = original.toLowerCase();
  const rules = [
    [/(bird|chirp|tweet|squawk|coo\b|hoot|gull)/,            'Птица / птичьи звуки'],
    [/(dog|bark|yip|howl|puppy|growl|whimper)/,               'Собака / собачьи звуки'],
    [/(cat|meow|purr|hiss\b|caterwaul)/,                      'Кошка / кошачьи звуки'],
    [/(horse|neigh|whinny|clip-clop)/,                        'Лошадь'],
    [/(cow|cattle|bovine|moo\b)/,                             'Крупный рогатый скот'],
    [/(pig|oink)/,                                            'Свинья'],
    [/(sheep|goat|bleat)/,                                    'Овца / коза'],
    [/(frog|croak)/,                                          'Лягушка'],
    [/(insect|cricket|mosquito|bee|wasp|fly\b)/,              'Насекомые'],
    [/(snake|rattle|hiss)/,                                   'Змея / шипение'],
    [/(mouse|rat|rodent|squeak)/,                             'Грызуны / писк'],
    [/(rain|drip|downpour)/,                                  'Дождь'],
    [/(thunder|lightning)/,                                   'Гром'],
    [/(wind|breeze|gust)/,                                    'Ветер'],
    [/(water|stream|waterfall|river|ocean|wave|drip)/,        'Вода'],
    [/(fire|crackl|flame)/,                                   'Огонь'],
    [/(music|musical|song|melody|harmon|chord|riff|solo)/,    'Музыка'],
    [/(guitar|bass|banjo|mandolin|ukulele|harp|sitar)/,       'Струнный инструмент'],
    [/(piano|organ|synth|keyboard|harpsichord)/,              'Клавишный инструмент'],
    [/(drum|cymbal|percussion|tambourine|maraca|timpani)/,    'Ударные инструменты'],
    [/(trumpet|trombone|horn|brass|sax|clarinet|flute|oboe)/, 'Духовой инструмент'],
    [/(violin|viola|cello|fiddle|string section)/,            'Смычковый инструмент'],
    [/(speech|talk|conversation|voice|narrat|monolog)/,       'Речь / разговор'],
    [/(shout|yell|scream|cry|cheer)/,                         'Крик / громкий голос'],
    [/(laugh|giggle|chuckle|snicker|guffaw)/,                 'Смех'],
    [/(sing|choir|chant|hum)/,                                'Пение'],
    [/(whisper|murmur|mumble)/,                               'Шёпот / бормотание'],
    [/(cough|sneeze|sniff|snort|throat)/,                     'Звуки дыхания / горла'],
    [/(breath|sigh|gasp|pant|wheeze|snor)/,                   'Дыхание'],
    [/(vehicle|engine|car\b|truck|bus\b|motor|traffic|honk)/, 'Транспорт / двигатель'],
    [/(airplane|aircraft|helicopter|plane)/,                  'Воздушное судно'],
    [/(train|rail|subway|metro)/,                             'Железнодорожный транспорт'],
    [/(boat|ship|water vehicle)/,                             'Водный транспорт'],
    [/(bicycle|skateboard|scooter)/,                          'Колёсный транспорт'],
    [/(siren|alarm|police|ambulance|fire truck)/,             'Сигнал тревоги / сирена'],
    [/(bell|chime|doorbell|jingle)/,                          'Звонок / колокольчик'],
    [/(telephone|ringtone|phone)/,                            'Телефон'],
    [/(clock|tick|tock|timer)/,                               'Часы / тиканье'],
    [/(printer|typing|keyboard|computer|click)/,              'Компьютер / клавиатура'],
    [/(tool|drill|hammer|saw|jackhammer|chainsaw)/,           'Инструменты'],
    [/(explosion|gunshot|gunfire|firework|firecracker|burst)/, 'Взрыв / выстрел / фейерверк'],
    [/(glass|shatter|break)/,                                 'Стекло / разбивание'],
    [/(door|knock|slam|creak|squeak)/,                        'Дверь / скрип'],
    [/(dishes|cutlery|pot|pan|kitchen|cook|fry)/,             'Кухня / посуда'],
    [/(vacuum|washing|dryer|blender|microwave|fridge|kettle)/, 'Бытовая техника'],
    [/(footstep|walk|run\b|step)/,                            'Шаги'],
    [/(applause|clap|cheer|crowd)/,                           'Аплодисменты / толпа'],
    [/(crowd|children|people|public)/,                        'Люди / толпа'],
    [/(noise|static|hiss|hum\b|buzz|whir)/,                   'Шум / гул'],
    [/(echo|reverb)/,                                         'Эхо / реверберация'],
    [/(silence|quiet)/,                                       'Тишина'],
    [/(inside|room|hall|indoor)/,                             'Внутри помещения'],
    [/(outside|outdoor|urban|rural|street)/,                  'Улица / природа'],
  ];
  for (const [re, text] of rules) {
    if (re.test(lower)) return { text, translated: true };
  }

  // 4. Не переведено — возвращаем оригинал
  return { text: original, translated: false };
}

function stopYamnet() {
  if (processor) { processor.onaudioprocess = null; try { processor.disconnect(); } catch {} }
  if (source) { try { source.disconnect(); } catch {} }
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext && audioContext.state !== 'closed') audioContext.close();
  processor = null; source = null; stream = null; audioContext = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  statusEl.textContent = classifier ? 'Распознавание остановлено. Модель уже загружена.' : 'Распознавание остановлено.';
}

startButton?.addEventListener('click', async () => {
  startButton.disabled = true;
  statusEl.textContent = 'Загружаем MediaPipe и модель YAMNet. При медленном интернете это может занять время…';
  resultsEl.textContent = 'Ожидание первого анализа звука…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не предоставляет доступ к микрофону. Открой через localhost в Chrome/Edge.');
    if (!classifier) {
      const fileset = await FilesetResolver.forAudioTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.14/wasm');
      classifier = await AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite' },
        maxResults: 10,
        scoreThreshold: 0.05
      });
    }
    const selectedId = document.getElementById('micDevice')?.value || '';
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedId ? { exact: selectedId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(16384, 1, 1);
    processor.onaudioprocess = (event) => {
      const now = performance.now();
      if (busy || now - lastRun < 850 || !classifier) return;
      busy = true; lastRun = now;
      try {
        const input = new Float32Array(event.inputBuffer.getChannelData(0));
        const results = classifier.classify(input, audioContext.sampleRate);
        const cats = results?.[0]?.classifications?.[0]?.categories || [];
        updateMotorDetection(cats);
        if (cats.length) {
          const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
          resultsEl.innerHTML = '<b>Результат предобученной нейросети YAMNet:</b><br>' + cats.slice(0,7).map(c => {
            const label = String(c.displayName || c.categoryName || 'Unknown');
            const translated = translateLabel(label);
            const english = translated.text === label ? '' : ` <span class="hint">(${escapeHtml(label)})</span>`;
            const translationNote = translated.translated ? '' : ' <span class="hint">(перевод уточняется)</span>';
            return `<b>${escapeHtml(translated.text)}</b>${english}${translationNote} — ${(c.score*100).toFixed(1)}%`;
          }).join('<br>') + '<br><span class="hint">YAMNet — настоящая предобученная нейросеть с 521 классом звуков. Проценты — оценки модели, а не гарантированная точность. Неизвестные метки пока показываются на английском.</span>';
        } else {
          resultsEl.textContent = 'Модель работает, но пока не вернула классы. Говори или воспроизведи звук рядом с микрофоном.';
        }
      } catch (err) {
        statusEl.textContent = 'Ошибка анализа: ' + (err?.message || err);
      } finally { busy = false; }
    };
    source.connect(processor);
    // Connect to a muted gain node to keep processing alive without audio feedback.
    const mute = audioContext.createGain(); mute.gain.value = 0;
    processor.connect(mute); mute.connect(audioContext.destination);
    stopButton.disabled = false;
    statusEl.textContent = 'YAMNet загружена. Слушаем выбранный микрофон…';
  } catch (err) {
    stopYamnet();
    statusEl.textContent = 'Не удалось запустить YAMNet: ' + (err?.message || err) + '. Проверь интернет, разрешение микрофона и попробуй через localhost.';
  }
});
stopButton?.addEventListener('click', stopYamnet);
window.addEventListener('beforeunload', () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (classifier) classifier.close();
});
