document.getElementById("readPage").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractQuestionData
    });

    const data = results?.[0]?.result;

    document.getElementById("question").textContent =
      data?.question || "Question not found";

    document.getElementById("options").textContent =
      data?.options?.length
        ? data.options.map((item, index) => `${index + 1}. ${item}`).join("\n\n")
        : "Options not found";
  } catch (error) {
    document.getElementById("question").textContent = `Error: ${error.message}`;
    document.getElementById("options").textContent = "";
  }
});

function extractQuestionData() {
  function clean(text) {
    return (text || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isBadText(text) {
    const t = clean(text).toLowerCase();

    if (!t) return true;

    return (
      t.includes("instrux helper") ||
      t.includes("read question") ||
      t.includes("skip question") ||
      t.includes("check answer") ||
      t.includes("пропустить вопрос") ||
      t.includes("проверить ответ") ||
      t.includes("полный экран") ||
      t.includes("udemy") ||
      t.includes("materials") ||
      t.includes("материалы курса")
    );
  }

  function getQuestionFromSmallElements() {
    const selectors = "h1, h2, h3, h4, p, span, div";
    const nodes = Array.from(document.querySelectorAll(selectors))
      .filter(isVisible)
      .map((el) => {
        const text = clean(el.innerText);
        const rect = el.getBoundingClientRect();

        return { el, text, rect };
      })
      .filter((item) => {
        if (!item.text) return false;
        if (item.text.length < 15) return false;
        if (item.text.length > 220) return false;
        if (item.text.includes("\n")) return false;
        if (isBadText(item.text)) return false;
        return true;
      });

    const candidates = nodes.filter((item) => {
      const t = item.text.toLowerCase();

      return (
        item.text.includes("?") ||
        t.startsWith("which ") ||
        t.startsWith("what ") ||
        t.startsWith("how ") ||
        t.startsWith("why ") ||
        t.startsWith("when ") ||
        t.startsWith("where ")
      );
    });

    candidates.sort((a, b) => {
      const aScore =
        (a.text.includes("?") ? 5 : 0) +
        (a.rect.top > 0 && a.rect.top < window.innerHeight * 0.7 ? 2 : 0) +
        (a.rect.height < 120 ? 2 : 0);

      const bScore =
        (b.text.includes("?") ? 5 : 0) +
        (b.rect.top > 0 && b.rect.top < window.innerHeight * 0.7 ? 2 : 0) +
        (b.rect.height < 120 ? 2 : 0);

      return bScore - aScore;
    });

    return candidates[0] || null;
  }

  function getOptions() {
    const labelOptions = Array.from(document.querySelectorAll("label"))
      .filter(isVisible)
      .map((el) => clean(el.innerText))
      .filter((text) => text.length > 20 && !isBadText(text));

    const unique = [];
    const seen = new Set();

    for (const item of labelOptions) {
      if (!seen.has(item)) {
        seen.add(item);
        unique.push(item);
      }
    }

    return unique.slice(0, 8);
  }

  const options = getOptions();
  const questionNode = getQuestionFromSmallElements();

  let question = questionNode ? questionNode.text : "";

  if (question) {
    const firstOption = options[0];
    if (firstOption && question.includes(firstOption)) {
      question = question.split(firstOption)[0].trim();
    }
  }

  question = clean(question);

  return {
    question,
    options
  };
}