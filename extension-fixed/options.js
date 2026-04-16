const STORAGE_KEY = "claudepacer_settings";

const defaults = {
  weeklyLimit: 100_000,
  weekStart: 1,
};

async function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (r) => {
      resolve({ ...defaults, ...(r[STORAGE_KEY] || {}) });
    });
  });
}

async function save(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

function toggleEl(id, value) {
  const el = document.getElementById(id);
  el.classList.toggle("on", value);
  el.setAttribute("aria-pressed", String(value));
  return el;
}

function highlightPlanBtn(limit) {
  document.querySelectorAll(".plan-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.limit) === limit);
  });
}

async function init() {
  const settings = await load();

  document.getElementById("weekly-limit").value = settings.weeklyLimit;
  // weekStart / alerts removed from UI; keep stored values for backward compatibility.

  // Show detected plan (from usage-page sync)
  try {
    chrome.storage.local.get("claudepacer_data", (r) => {
      const data = r.claudepacer_data || {};
      const plan = data.detectedPlan || null;
      const at   = data.detectedPlanAt || null;
      const label =
        plan === "pro" ? "Claude Pro" :
        plan === "max_5x" ? "Max 5×" :
        plan === "max_20x" ? "Max 20×" :
        plan === "max" ? "Max (unknown)" :
        "—";
      const el = document.getElementById("detected-plan");
      if (el) el.textContent = label;
      const ageEl = document.getElementById("detected-plan-age");
      if (ageEl && at) {
        const mins = Math.round((Date.now() - at) / 60_000);
        ageEl.textContent = mins < 2 ? "(just now)" : `(updated ${mins}m ago)`;
      }
    });
  } catch (_) {}

  // Plan preset buttons
  highlightPlanBtn(settings.weeklyLimit);
  document.querySelectorAll(".plan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const limit = parseInt(btn.dataset.limit);
      settings.weeklyLimit = limit;
      document.getElementById("weekly-limit").value = limit;
      highlightPlanBtn(limit);
    });
  });

  // Keep plan buttons in sync when user types manually
  document.getElementById("weekly-limit").addEventListener("input", (e) => {
    highlightPlanBtn(parseInt(e.target.value));
  });

  // Save
  document.getElementById("btn-save").addEventListener("click", async () => {
    settings.weeklyLimit = parseInt(document.getElementById("weekly-limit").value, 10) || 1_000_000;

    await save(settings);

    // Sync limit + week start to background data
    chrome.runtime.sendMessage({ type: "SET_LIMIT", limit: settings.weeklyLimit });

    const msg = document.getElementById("saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 2000);
  });

  // Pro mode toggle (testing)
  const STORAGE_KEY_DATA = "claudepacer_data";
  const proBtn    = document.getElementById("btn-toggle-pro");
  const proStatus = document.getElementById("pro-status");

  function refreshProStatus() {
    chrome.storage.local.get(STORAGE_KEY_DATA, (r) => {
      const isPaid = r[STORAGE_KEY_DATA]?.isPaid || false;
      proBtn.textContent = isPaid ? "Disable Pro Mode" : "Enable Pro Mode (test)";
      proBtn.style.background = isPaid ? "#22C55E" : "#D97757";
      proStatus.textContent = isPaid ? "✅ Pro is active — reload the side panel to see changes" : "Free tier";
    });
  }

  refreshProStatus();

  proBtn.addEventListener("click", () => {
    chrome.storage.local.get(STORAGE_KEY_DATA, (r) => {
      const data   = r[STORAGE_KEY_DATA] || {};
      data.isPaid  = !data.isPaid;
      chrome.storage.local.set({ [STORAGE_KEY_DATA]: data }, refreshProStatus);
    });
  });

  // Data reset removed (too destructive)
}

document.addEventListener("DOMContentLoaded", init);
