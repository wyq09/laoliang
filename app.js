const $ = (selector) => document.querySelector(selector);

const elements = {
  root: document.documentElement,
  apparatus: $("#apparatus"),
  captureScene: $("#captureScene"),
  deviceStack: $("#deviceStack"),
  deviceScene: $("#deviceScene"),
  sliderZone: $("#sliderZone"),
  sliderHandle: $("#sliderHandle"),
  hint: $("#interactionHint"),
  soundButton: $("#soundButton"),
  saveButton: $("#saveButton"),
  editButton: $("#editButton"),
  panel: $("#customPanel"),
  scrim: $("#panelScrim"),
  closeButton: $("#closeButton"),
  doneButton: $("#doneButton"),
  resetButton: $("#resetButton"),
  avatarInput: $("#avatarInput"),
  avatarImage: $("#avatarImage"),
  avatarPreview: $("#avatarPreview"),
  topCopy: $("#topCopy"),
  topText: $("#topText"),
  topColor: $("#topColor"),
  topSize: $("#topSize"),
  topSizeOutput: $("#topSizeOutput"),
  mainText: $("#mainText"),
  mainPrefix: $("#mainPrefix"),
  mainAccent: $("#mainAccent"),
  mainSuffix: $("#mainSuffix"),
  mainColor: $("#mainColor"),
  accentColor: $("#accentColor"),
  accentFont: $("#accentFont"),
  mainSize: $("#mainSize"),
  mainSizeOutput: $("#mainSizeOutput"),
  accentSize: $("#accentSize"),
  accentSizeOutput: $("#accentSizeOutput"),
  soundToggle: $("#soundToggle"),
  volume: $("#volume"),
  volumeOutput: $("#volumeOutput"),
  toast: $("#toast"),
  priceMonitor: $("#priceMonitor"),
  priceStatus: $("#priceStatus"),
  refreshPriceButton: $("#refreshPriceButton"),
  flashInputPrice: $("#flashInputPrice"),
  flashOutputPrice: $("#flashOutputPrice"),
  proInputPrice: $("#proInputPrice"),
  proOutputPrice: $("#proOutputPrice"),
  currentTier: $("#currentTier"),
  priceUpdatedAt: $("#priceUpdatedAt"),
  posterQrImg: $("#posterQrImg"),
};

const accentFonts = {
  "noto-sans-sc": '"Noto Sans SC", sans-serif',
  "roboto-mono": '"Roboto Mono", monospace',
  "ma-shan-zheng": '"Ma Shan Zheng", cursive',
};

const defaults = {
  topText: "梁神 | 梁圣 | 梁子 | 牢梁",
  topColor: "#171411",
  topSize: 32,
  mainText: "滑动变[祖]器",
  mainColor: "#0e0c0a",
  accentColor: "#0874c9",
  accentFont: "noto-sans-sc",
  mainSize: 62,
  accentSize: 62,
  sound: true,
  volume: 78,
  slider: 58,
  avatar: "assets/avatar-default.jpg",
};

const storageKey = "rheostat-customization-v1";
let state = { ...defaults };
let drag = null;
let inertiaFrame = null;
let toastTimer = null;
let wheelTimer = null;
let lastTick = Math.round(state.slider);
let activePriceTier = null;
let automaticSlideFrame = null;
let priceRefreshTimer = null;

const pricingConfig = {
  endpoint: "/api/pricing.json",
  refreshInterval: 5 * 60 * 1000,
  tiers: [
    { name: "梁神", ceiling: 1 },
    { name: "梁圣", ceiling: 2 },
    { name: "梁子", ceiling: 3 },
    { name: "牢梁", ceiling: Infinity },
  ],
};

class MechanicalAudio {
  constructor() {
    this.context = null;
    this.output = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.enabled = true;
    this.volume = 0.85;
  }

  ensure() {
    if (!this.enabled) return false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume();
    return true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopSlide();
  }

  setVolume(value) {
    this.volume = value;
    if (this.output && this.context) {
      this.output.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
    }
  }

  startSlide() {
    if (!this.ensure() || this.noiseSource) return;
    const length = this.context.sampleRate * 1.25;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.9 + white * 0.1;
      data[i] = previous;
    }
    const source = this.context.createBufferSource();
    const band = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    band.type = "bandpass";
    band.frequency.value = 720;
    band.Q.value = 0.65;
    gain.gain.value = 0.0001;
    source.connect(band).connect(gain).connect(this.output);
    source.start();
    this.noiseSource = source;
    this.noiseGain = gain;
  }

  updateSlide(speed = 0.25) {
    if (!this.enabled) return;
    if (!this.noiseSource) this.startSlide();
    if (!this.noiseGain || !this.context) return;
    const intensity = Math.min(0.42, 0.05 + Math.abs(speed) * 0.012);
    this.noiseGain.gain.setTargetAtTime(intensity, this.context.currentTime, 0.018);
  }

  stopSlide() {
    if (!this.noiseSource || !this.context) return;
    const source = this.noiseSource;
    this.noiseGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.045);
    window.setTimeout(() => {
      try { source.stop(); } catch (_) { /* source may already be stopped */ }
    }, 150);
    this.noiseSource = null;
    this.noiseGain = null;
  }

  tick(strength = 1) {
    if (!this.ensure()) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const toneGain = this.context.createGain();
    const clickBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.025), this.context.sampleRate);
    const clickData = clickBuffer.getChannelData(0);
    for (let i = 0; i < clickData.length; i += 1) clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / 110);
    const click = this.context.createBufferSource();
    const clickGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(155 + Math.random() * 22, now);
    oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.045);
    toneGain.gain.setValueAtTime(0.13 * strength, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
    click.buffer = clickBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1250 + Math.random() * 350;
    filter.Q.value = 0.9;
    clickGain.gain.value = 0.28 * strength;
    oscillator.connect(toneGain).connect(this.output);
    click.connect(filter).connect(clickGain).connect(this.output);
    oscillator.start(now);
    oscillator.stop(now + 0.055);
    click.start(now);
  }
}

const audio = new MechanicalAudio();

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function setSlider(value, options = {}) {
  const next = clamp(value);
  const previous = state.slider;
  state.slider = next;
  elements.root.style.setProperty("--slider-x", `${next}%`);
  elements.sliderHandle.setAttribute("aria-valuenow", String(Math.round(next)));
  elements.sliderHandle.setAttribute("aria-valuetext", `${Math.round(next)} 欧姆`);
  const tick = Math.round(next);
  if (options.sound && tick !== lastTick) {
    audio.tick(Math.abs(tick - lastTick) > 2 ? 1 : 0.72);
    if (tick % 5 === 0 && navigator.vibrate) navigator.vibrate(4);
  }
  lastTick = tick;
  if (!options.skipTierUpdate) updateActiveTierHighlight(tierIndexForSlider(next));
  if (options.motion) {
    const direction = Math.sign(next - previous);
    elements.root.style.setProperty("--motion", String(direction * Math.min(2.2, Math.abs(next - previous) * 0.18)));
  }
}

function priceTierFor(inputPrice) {
  return pricingConfig.tiers.findIndex((tier) => inputPrice <= tier.ceiling);
}

function sliderValueForTier(tierIndex) {
  const labels = [...elements.topCopy.children];
  const targetLabel = labels[tierIndex];
  if (!targetLabel) return [8, 37, 66, 94][tierIndex] ?? 50;
  const zoneRect = elements.sliderZone.getBoundingClientRect();
  const labelRect = targetLabel.getBoundingClientRect();
  if (!zoneRect.width) return [8, 37, 66, 94][tierIndex] ?? 50;
  return clamp((((labelRect.left + labelRect.width / 2) - zoneRect.left) / zoneRect.width) * 100);
}

function tierIndexForSlider(value) {
  const labels = [...elements.topCopy.children];
  if (!labels.length) return 0;
  const positions = labels.map((_, index) => sliderValueForTier(index));
  let closest = 0;
  let minDistance = Infinity;
  positions.forEach((position, index) => {
    const distance = Math.abs(value - position);
    if (distance < minDistance) {
      minDistance = distance;
      closest = index;
    }
  });
  return closest;
}

function updateActiveTierHighlight(tierIndex) {
  const tier = pricingConfig.tiers[tierIndex];
  if (!tier) return;
  activePriceTier = tierIndex;
  elements.currentTier.textContent = tier.name;
  elements.currentTier.dataset.tier = String(tierIndex);
  [...elements.topCopy.children].forEach((label, index) => {
    label.classList.toggle("price-active", index === tierIndex);
  });
}

function animateSliderToTier(tierIndex) {
  cancelAnimationFrame(automaticSlideFrame);
  const start = state.slider;
  const target = sliderValueForTier(tierIndex);
  const duration = 900;
  const startedAt = performance.now();
  const frame = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    setSlider(start + (target - start) * eased, { motion: true });
    if (progress < 1) {
      automaticSlideFrame = requestAnimationFrame(frame);
    } else {
      setSlider(target);
      saveState();
    }
  };
  automaticSlideFrame = requestAnimationFrame(frame);
}

function formatPrice(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value) : "—";
}

function updatePriceStatus(status, message) {
  elements.priceMonitor.dataset.status = status;
  elements.priceStatus.querySelector("span").textContent = message;
  elements.refreshPriceButton.disabled = status === "loading";
}

function renderPricing(payload) {
  const flash = payload.models?.["deepseek-v4-flash"];
  const pro = payload.models?.["deepseek-v4-pro"];
  if (![flash?.input, flash?.output, pro?.input, pro?.output].every(Number.isFinite)) {
    throw new Error("定价数据不完整");
  }

  elements.flashInputPrice.textContent = formatPrice(flash.input);
  elements.flashOutputPrice.textContent = formatPrice(flash.output);
  elements.proInputPrice.textContent = formatPrice(pro.input);
  elements.proOutputPrice.textContent = formatPrice(pro.output);

  const tierIndex = priceTierFor(flash.input);
  animateSliderToTier(tierIndex);

  const updatedAt = new Date(payload.fetchedAt);
  elements.priceUpdatedAt.textContent = Number.isNaN(updatedAt.getTime())
    ? "查看官方定价"
    : `${updatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新`;
  updatePriceStatus("live", "官方价格已同步");
  elements.priceMonitor.classList.remove("price-entering");
  requestAnimationFrame(() => elements.priceMonitor.classList.add("price-entering"));
}

async function fetchPricing({ announce = false } = {}) {
  updatePriceStatus("loading", "正在连接官方定价");
  try {
    const response = await fetch(`${pricingConfig.endpoint}?t=${Date.now()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `价格接口异常（${response.status}）`);
    renderPricing(payload);
    if (announce) showToast("价格已刷新，滑片已同步");
  } catch (error) {
    updatePriceStatus("error", "价格同步失败");
    elements.currentTier.textContent = activePriceTier === null ? "暂时不可用" : pricingConfig.tiers[activePriceTier].name;
    if (announce) showToast(error.message || "价格获取失败，请稍后重试");
  } finally {
    window.clearTimeout(priceRefreshTimer);
    priceRefreshTimer = window.setTimeout(fetchPricing, pricingConfig.refreshInterval);
  }
}

function valueFromPointer(clientX) {
  const rect = elements.sliderZone.getBoundingClientRect();
  return clamp(((clientX - rect.left) / rect.width) * 100);
}

function beginInteraction() {
  cancelAnimationFrame(inertiaFrame);
  cancelAnimationFrame(automaticSlideFrame);
  elements.hint.classList.add("used");
  elements.root.style.setProperty("--press", "1");
  audio.startSlide();
}

function endInteraction() {
  elements.root.style.setProperty("--press", "0");
  elements.root.style.setProperty("--motion", "0");
  audio.stopSlide();
  saveState();
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const value = valueFromPointer(event.clientX);
  drag = { pointerId: event.pointerId, lastX: event.clientX, lastTime: performance.now(), velocity: 0 };
  elements.sliderZone.setPointerCapture(event.pointerId);
  beginInteraction();
  setSlider(value, { sound: true, motion: true });
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const now = performance.now();
  const elapsed = Math.max(8, now - drag.lastTime);
  drag.velocity = (event.clientX - drag.lastX) / elapsed;
  drag.lastX = event.clientX;
  drag.lastTime = now;
  const value = valueFromPointer(event.clientX);
  setSlider(value, { sound: true, motion: true });
  audio.updateSlide(drag.velocity * 22);
}

function runInertia(velocity) {
  let currentVelocity = velocity;
  let previousTime = performance.now();
  const frame = (now) => {
    const delta = Math.min(32, now - previousTime);
    previousTime = now;
    currentVelocity *= Math.pow(0.91, delta / 16.7);
    const rect = elements.sliderZone.getBoundingClientRect();
    const next = state.slider + (currentVelocity * delta * 100) / rect.width;
    setSlider(next, { sound: true, motion: true });
    audio.updateSlide(currentVelocity * 18);
    if (Math.abs(currentVelocity) > 0.018 && next > 0 && next < 100) {
      inertiaFrame = requestAnimationFrame(frame);
    } else {
      const snapped = Math.round(state.slider);
      setSlider(snapped, { sound: snapped !== lastTick });
      endInteraction();
    }
  };
  inertiaFrame = requestAnimationFrame(frame);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const velocity = drag.velocity;
  drag = null;
  if (elements.sliderZone.hasPointerCapture(event.pointerId)) elements.sliderZone.releasePointerCapture(event.pointerId);
  if (Math.abs(velocity) > 0.08) runInertia(velocity);
  else {
    setSlider(Math.round(state.slider), { sound: true });
    endInteraction();
  }
}

function onWheel(event) {
  event.preventDefault();
  beginInteraction();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  setSlider(state.slider + Math.sign(delta) * Math.min(4, Math.max(1, Math.abs(delta) / 30)), { sound: true, motion: true });
  audio.updateSlide(Math.abs(delta) / 12);
  window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(endInteraction, 120);
}

function onKeyDown(event) {
  const keys = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
  if (!(event.key in keys) && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  audio.ensure();
  const next = event.key === "Home" ? 0 : event.key === "End" ? 100 : state.slider + keys[event.key];
  setSlider(next, { sound: true, motion: true });
  saveState();
}

function parseMainText(value) {
  const match = value.match(/^(.*?)\[(.+?)\](.*)$/);
  if (match) return { prefix: match[1], accent: match[2], suffix: match[3] };
  const chars = [...value];
  const accentIndex = Math.max(0, chars.length - 2);
  return { prefix: chars.slice(0, accentIndex).join(""), accent: chars[accentIndex] || "", suffix: chars.slice(accentIndex + 1).join("") };
}

function renderState() {
  const labels = state.topText.split(/[|｜]/).map((item) => item.trim()).filter(Boolean).slice(0, 4);
  elements.topCopy.replaceChildren(...labels.map((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }));
  const main = parseMainText(state.mainText);
  elements.mainPrefix.textContent = main.prefix;
  elements.mainAccent.textContent = main.accent;
  elements.mainSuffix.textContent = main.suffix;
  elements.root.style.setProperty("--top-color", state.topColor);
  elements.root.style.setProperty("--top-size", `${state.topSize}px`);
  elements.root.style.setProperty("--main-color", state.mainColor);
  elements.root.style.setProperty("--accent-color", state.accentColor);
  elements.root.style.setProperty("--accent-font-family", accentFonts[state.accentFont] || accentFonts["noto-sans-sc"]);
  elements.root.style.setProperty("--main-size", `${state.mainSize}px`);
  elements.root.style.setProperty("--accent-size", `${state.accentSize}px`);
  elements.avatarImage.src = state.avatar;
  elements.avatarPreview.src = state.avatar;
  elements.topText.value = state.topText;
  elements.topColor.value = state.topColor;
  elements.topSize.value = state.topSize;
  elements.topSizeOutput.value = state.topSize;
  elements.mainText.value = state.mainText;
  elements.mainColor.value = state.mainColor;
  elements.accentColor.value = state.accentColor;
  elements.accentFont.value = accentFonts[state.accentFont] ? state.accentFont : defaults.accentFont;
  elements.mainSize.value = state.mainSize;
  elements.mainSizeOutput.value = state.mainSize;
  elements.accentSize.value = state.accentSize;
  elements.accentSizeOutput.value = state.accentSize;
  elements.soundToggle.checked = state.sound;
  elements.soundButton.setAttribute("aria-pressed", String(state.sound));
  elements.volume.value = state.volume;
  elements.volumeOutput.value = `${state.volume}%`;
  audio.setEnabled(state.sound);
  audio.setVolume(state.volume / 100);
  setSlider(state.slider, { skipTierUpdate: false });
  updateRangeFills();
}

function updateRangeFills() {
  [elements.topSize, elements.mainSize, elements.accentSize, elements.volume].forEach((input) => {
    const percent = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--fill", `${percent}%`);
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === "object") state = { ...defaults, ...saved };
  } catch (_) { state = { ...defaults }; }
}

function saveState() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* private mode or image too large */ }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function exportFilename() {
  const date = new Date();
  const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("");
  return `滑动变阻器-${stamp}.png`;
}

function buildPosterQr() {
  try {
    const qr = window.qrcode?.(0, "M");
    if (!qr) return;
    qr.addData(window.location.href);
    qr.make();
    elements.posterQrImg.innerHTML = qr.createSvgTag({
      cellSize: 4,
      margin: 0,
      scalable: true,
    });
  } catch (_) { /* qrcode lib missing — skip silently */ }
}

async function saveDeviceImage() {
  if (elements.saveButton.disabled) return;
  if (typeof window.htmlToImage?.toBlob !== "function") return showToast("图片组件加载失败，请刷新后重试");
  elements.saveButton.disabled = true;
  elements.saveButton.classList.add("saving");
  elements.root.style.setProperty("--tilt-x", "0deg");
  elements.root.style.setProperty("--tilt-y", "0deg");
  elements.root.style.setProperty("--tilt-z", "0deg");
  showToast("正在生成高清图片…");
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    elements.captureScene.classList.add("capture-ready");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = elements.captureScene.getBoundingClientRect();
    const pixelRatio = Math.min(3.5, Math.max(2, 2400 / rect.width));
    const blob = await window.htmlToImage.toBlob(elements.captureScene, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: "#100e0d",
    });
    if (!blob) throw new Error("Canvas export failed");
    const file = new File([blob], exportFilename(), { type: "image/png" });
    const canShare = navigator.share && navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches;
    if (canShare) {
      await navigator.share({ files: [file], title: "滑动变阻器" });
      showToast("已打开系统保存菜单");
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("高清图片已保存");
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("保存失败，请稍后重试");
  } finally {
    elements.captureScene.classList.remove("capture-ready");
    elements.saveButton.disabled = false;
    elements.saveButton.classList.remove("saving");
  }
}

function openPanel() {
  elements.panel.inert = false;
  elements.panel.classList.add("open");
  elements.scrim.classList.add("open");
  elements.panel.setAttribute("aria-hidden", "false");
  elements.editButton.setAttribute("aria-expanded", "true");
  window.setTimeout(() => elements.closeButton.focus(), 300);
}

function closePanel() {
  elements.panel.classList.remove("open");
  elements.scrim.classList.remove("open");
  elements.panel.setAttribute("aria-hidden", "true");
  elements.editButton.setAttribute("aria-expanded", "false");
  elements.panel.inert = true;
}

async function resizeAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const size = 420;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - sourceSize) / 2;
  const sy = (bitmap.height - sourceSize) / 2;
  context.drawImage(bitmap, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

function bindEditor() {
  const bindings = [
    [elements.topText, "input", (value) => { state.topText = value; }],
    [elements.topColor, "input", (value) => { state.topColor = value; }],
    [elements.topSize, "input", (value) => { state.topSize = Number(value); elements.topSizeOutput.value = value; }],
    [elements.mainText, "input", (value) => { state.mainText = value; }],
    [elements.mainColor, "input", (value) => { state.mainColor = value; }],
    [elements.accentColor, "input", (value) => { state.accentColor = value; }],
    [elements.accentFont, "change", (value) => { state.accentFont = value; }],
    [elements.mainSize, "input", (value) => { state.mainSize = Number(value); elements.mainSizeOutput.value = value; }],
    [elements.accentSize, "input", (value) => { state.accentSize = Number(value); elements.accentSizeOutput.value = value; }],
    [elements.volume, "input", (value) => { state.volume = Number(value); elements.volumeOutput.value = `${value}%`; }],
  ];
  bindings.forEach(([element, eventName, update]) => {
    element.addEventListener(eventName, () => {
      update(element.value);
      renderState();
      saveState();
    });
  });

  elements.soundToggle.addEventListener("change", () => {
    state.sound = elements.soundToggle.checked;
    renderState();
    saveState();
  });

  elements.avatarInput.addEventListener("change", async () => {
    const [file] = elements.avatarInput.files;
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("请选择图片文件");
    try {
      state.avatar = await resizeAvatar(file);
      renderState();
      saveState();
      showToast("头像已更新");
    } catch (_) {
      showToast("这张图片暂时无法读取");
    }
    elements.avatarInput.value = "";
  });
}

elements.sliderZone.addEventListener("pointerdown", onPointerDown);
elements.sliderZone.addEventListener("pointermove", onPointerMove);
elements.sliderZone.addEventListener("pointerup", onPointerUp);
elements.sliderZone.addEventListener("pointercancel", onPointerUp);
elements.sliderZone.addEventListener("wheel", onWheel, { passive: false });
elements.sliderHandle.addEventListener("keydown", onKeyDown);

elements.soundButton.addEventListener("click", () => {
  state.sound = !state.sound;
  renderState();
  saveState();
  if (state.sound) {
    audio.ensure();
    audio.tick(.8);
  }
  showToast(state.sound ? "机械音效已开启" : "机械音效已关闭");
});

elements.saveButton.addEventListener("click", saveDeviceImage);

elements.editButton.addEventListener("click", openPanel);
elements.closeButton.addEventListener("click", closePanel);
elements.doneButton.addEventListener("click", () => { closePanel(); showToast("自定义已保存"); });
elements.scrim.addEventListener("click", closePanel);
elements.resetButton.addEventListener("click", () => {
  state = { ...defaults };
  renderState();
  saveState();
  showToast("已恢复默认设置");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.panel.classList.contains("open")) closePanel();
});

window.addEventListener("resize", () => {
  requestAnimationFrame(() => setSlider(state.slider));
});

elements.refreshPriceButton.addEventListener("click", () => fetchPricing({ announce: true }));

loadState();
renderState();
bindEditor();
buildPosterQr();
fetchPricing();
