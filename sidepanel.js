let latestData = {
  question: "",
  options: []
};

let lastHash = "";
let autoRefreshTimer = null;
let isReading = false;

document.getElementById("sendPromptBtn").addEventListener("click", sendPromptToGroq);
document.getElementById("saveApiKeyBtn").addEventListener("click", saveApiKey);

init();

async function init() {
  const saved = await chrome.storage.local.get(["groqApiKey"]);
  if (saved.groqApiKey) {
    document.getElementById("apiKey").value = saved.groqApiKey;
  }

  await readQuestion(true);
  startAutoRefresh();
}

async function saveApiKey() {
  const apiKey = document.getElementById("apiKey").value.trim();

  if (!apiKey) {
    setStatus("Введи API key");
    return;
  }

  await chrome.storage.local.set({ groqApiKey: apiKey });
  setStatus("API key saved");
}

function startAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer = setInterval(async () => {
    if (document.hidden) return;
    await readQuestion(false);
  }, 900);
}

async function readQuestion(forceRender = false) {
  if (isReading) return;

  isReading = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setStatus("Active tab not found");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractQuestionData
    });

    const data = results?.[0]?.result || { question: "", options: [] };

    const normalizedData = {
      question: data.question || "",
      options: Array.isArray(data.options) ? data.options : []
    };

    const newHash = JSON.stringify(normalizedData);

    if (!forceRender && newHash === lastHash) {
      return;
    }

    lastHash = newHash;
    latestData = normalizedData;

    renderData(latestData);
    setStatus(forceRender ? "Question loaded" : "Updated");
  } catch (error) {
    setStatus("Read failed");
  } finally {
    isReading = false;
  }
}

// ОБНОВЛЕННАЯ ФУНКЦИЯ: Теперь создает элементы для каждого варианта
function renderData(data) {
  document.getElementById("question").textContent =
    data.question || "Question not found";

  const optionsContainer = document.getElementById("options");
  optionsContainer.innerHTML = ""; // Очищаем контейнер

  if (data.options.length) {
    data.options.forEach((item, index) => {
      const div = document.createElement("div");
      div.id = `option-${index + 1}`;
      div.className = "option-item";
      div.style.padding = "8px";
      div.style.marginBottom = "4px";
      div.style.borderRadius = "4px";
      div.style.transition = "background-color 0.3s";
      div.textContent = `${index + 1}. ${item}`;
      optionsContainer.appendChild(div);
    });
  } else {
    optionsContainer.textContent = "Options not found";
  }
  
  // Сбрасываем старый анализ при загрузке нового вопроса
  document.getElementById("analysis").textContent = "No analysis yet";
}

async function sendPromptToGroq() {
  const apiKeyInput = document.getElementById("apiKey").value.trim();

  if (!apiKeyInput) {
    setStatus("Сначала введи API key");
    return;
  }

  if (!latestData.question && !latestData.options.length) {
    setStatus("Нет данных вопроса");
    return;
  }

  setStatus("Sending...");
  document.getElementById("analysis").textContent = "Loading...";
  
  // Сбрасываем подсветку перед новым запросом
  resetHighlights();

  const prompt = buildPrompt(latestData);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKeyInput}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "Ты помощник по тестам. Твоя задача: найти правильный ответ. В начале ответа ВСЕГДА пиши только цифру правильного варианта, а затем краткое пояснение."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "API error");

    const text = data?.choices?.[0]?.message?.content || "";
    document.getElementById("analysis").textContent = text;
    
    // Выделяем правильный ответ
    highlightCorrectOption(text);
    
    setStatus("Done");
  } catch (error) {
    document.getElementById("analysis").textContent = `API error: ${error.message}`;
    setStatus("API failed");
  }
}

// НОВАЯ ФУНКЦИЯ: Ищет цифру в ответе и красит соответствующий блок
function highlightCorrectOption(aiText) {
  // Ищем первую попавшуюся цифру от 1 до 6 в начале или первой строке текста
  const match = aiText.match(/\b([1-6])\b/);
  if (match) {
    const optionNumber = match[1];
    const element = document.getElementById(`option-${optionNumber}`);
    if (element) {
      element.style.backgroundColor = "#dcfce7"; // Светло-зеленый
      element.style.borderLeft = "4px solid #22c55e"; // Зеленая полоска слева
      element.style.fontWeight = "bold";
    }
  }
}

function resetHighlights() {
  const items = document.querySelectorAll(".option-item");
  items.forEach(el => {
    el.style.backgroundColor = "transparent";
    el.style.borderLeft = "none";
    el.style.fontWeight = "normal";
  });
}

function buildPrompt(data) {
  const question = data.question || "";
  const options = Array.isArray(data.options) ? data.options : [];

  return [
    "Проанализируй вопрос и варианты ответа.",
    "Выбери правильный ответ.",
    "",
    "QUESTION:",
    question,
    "",
    "OPTIONS:",
    ...options.map((item, index) => `${index + 1}. ${item}`)
  ].join("\n");
}

// ... (остальные функции setStatus и extractQuestionData остаются без изменений)

function setStatus(text) {
  document.getElementById("status").textContent = text;
  const dot = document.getElementById("statusDot");
  if (!dot) return;
  const value = String(text || "").toLowerCase();

  if (value.includes("done") || value.includes("ready") || value.includes("updated") || value.includes("saved") || value.includes("loaded")) {
    dot.style.background = "#22c55e";
    dot.style.boxShadow = "0 0 0 4px rgba(34, 197, 94, 0.18)";
    return;
  }
  if (value.includes("failed") || value.includes("error") || value.includes("read failed")) {
    dot.style.background = "#ef4444";
    dot.style.boxShadow = "0 0 0 4px rgba(239, 68, 68, 0.18)";
    return;
  }
  if (value.includes("sending") || value.includes("loading")) {
    dot.style.background = "#f59e0b";
    dot.style.boxShadow = "0 0 0 4px rgba(245, 158, 11, 0.18)";
    return;
  }
  dot.style.background = "#cbd5e1";
  dot.style.boxShadow = "0 0 0 4px rgba(203, 213, 225, 0.22)";
}

function extractQuestionData() {
  function clean(text) {
    return (text || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0);
  }

  function isInsideViewportArea(rect) {
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  function isBadText(text) {
    const t = clean(text).toLowerCase();
    if (!t) return true;
    return (
      t.includes("instrux helper") || t.includes("groq api key") || t.includes("сохранить api key") ||
      t.includes("отправить промт") || t.includes("no analysis yet") || t.includes("question loaded") ||
      t.includes("updated") || t.includes("materials") || t.includes("материалы курса") ||
      t.includes("запустить задание") || t.includes("why choose this course") || t.includes("students") ||
      t.includes("reviews") || t.includes("step-by-step guide") || t.includes("последнее обновление")
    );
  }

  function getLeftContentBoundary() {
    return Math.max(900, Math.floor(window.innerWidth * 0.72));
  }

  function dedupeStrings(items) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      const key = clean(item).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(clean(item));
    }
    return out;
  }

  function collectOptionCandidates() {
    const leftBoundary = getLeftContentBoundary();
    const allTexts = Array.from(document.querySelectorAll("body *")).filter(isVisible).map((el) => clean(el.innerText)).filter((t) => t.length > 0);
    const trueFalse = allTexts.filter((t) => {
      const x = t.toLowerCase();
      return x === "true" || x === "true." || x === "false" || x === "false.";
    });
    if (trueFalse.length >= 2) return [...new Set(trueFalse)].slice(0, 2);

    const radioBlocks = Array.from(document.querySelectorAll("[role='radio'], label")).filter(isVisible).map((el) => {
      return { text: clean(el.innerText), rect: el.getBoundingClientRect() };
    }).filter((item) => {
      if (!item.text || item.text.length < 3 || item.text.length > 160) return false;
      if (item.rect.left > leftBoundary || !isInsideViewportArea(item.rect)) return false;
      return true;
    });

    if (radioBlocks.length) {
      const unique = [];
      const seen = new Set();
      for (const item of radioBlocks) {
        const key = item.text.toLowerCase();
        if (!seen.has(key)) { seen.add(key); unique.push(item.text); }
      }
      return unique.slice(0, 6);
    }

    const fallback = Array.from(document.querySelectorAll("div")).filter(isVisible).map((el) => {
      return { text: clean(el.innerText), rect: el.getBoundingClientRect() };
    }).filter((item) => {
      const t = item.text.toLowerCase();
      if (!item.text || item.text.length < 10 || item.text.length > 120) return false;
      if (item.rect.left > leftBoundary || !isInsideViewportArea(item.rect)) return false;
      if (t.includes("udemy") || t.includes("progress") || t.includes("курс") || t.includes("раздел") || t.includes("materials") || t.includes("cookie") || item.text.includes("?")) return false;
      return true;
    });

    const unique = [];
    const seen = new Set();
    for (const item of fallback) {
      const key = item.text.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(item.text); }
    }
    return unique.slice(0, 6);
  }

  function collectQuestionCandidates() {
    const leftBoundary = getLeftContentBoundary();
    return Array.from(document.querySelectorAll("h1, h2, h3, h4, p, span, div")).filter(isVisible).map((el) => {
      return { el, text: clean(el.innerText), rect: el.getBoundingClientRect() };
    }).filter((item) => {
      if (!item.text || item.text.length < 10 || item.text.length > 220) return false;
      if (!isInsideViewportArea(item.rect) || item.rect.left > leftBoundary || item.rect.width < 120 || isBadText(item.text)) return false;
      return true;
    });
  }

  function findQuestionNearOptions(options) {
    const leftBoundary = getLeftContentBoundary();
    const questionCandidates = collectQuestionCandidates();
    const optionNodes = Array.from(document.querySelectorAll("label, [role='radio'], div, li")).filter(isVisible).map((el) => ({
      el, text: clean(el.innerText), rect: el.getBoundingClientRect()
    })).filter((item) => {
      if (!item.text || item.rect.left > leftBoundary || !isInsideViewportArea(item.rect)) return false;
      return options.some((opt) => clean(opt) === item.text);
    });

    if (!optionNodes.length) {
      const fallback = questionCandidates.find((item) => {
        const t = item.text.toLowerCase();
        return (item.text.includes("?") || t.startsWith("which ") || t.startsWith("what ") || t.startsWith("when ") || t.startsWith("where ") || t.startsWith("why ") || t.startsWith("how "));
      });
      return fallback ? fallback.text : "";
    }

    const topOfOptions = Math.min(...optionNodes.map((n) => n.rect.top));
    const candidatesAbove = questionCandidates.filter((item) => {
      if (item.rect.bottom > topOfOptions + 5 || topOfOptions - item.rect.bottom > 220) return false;
      return true;
    }).sort((a, b) => {
      const aDistance = topOfOptions - a.rect.bottom;
      const bDistance = topOfOptions - b.rect.bottom;
      const aScore = (a.text.includes("?") ? 10 : 0) + (aDistance >= 0 && aDistance < 120 ? 5 : 0) + (a.text.length >= 20 ? 2 : 0);
      const bScore = (b.text.includes("?") ? 10 : 0) + (bDistance >= 0 && bDistance < 120 ? 5 : 0) + (b.text.length >= 20 ? 2 : 0);
      return bScore - aScore;
    });

    if (candidatesAbove.length) return candidatesAbove[0].text;
    const fallback = questionCandidates.find((item) => {
      const t = item.text.toLowerCase();
      return (item.text.includes("?") || t.startsWith("which ") || t.startsWith("what ") || t.startsWith("when ") || t.startsWith("where ") || t.startsWith("why ") || t.startsWith("how "));
    });
    return fallback ? fallback.text : "";
  }

  const options = collectOptionCandidates();
  const question = findQuestionNearOptions(options);

  return {
    question: clean(question),
    options: dedupeStrings(options)
  };
}