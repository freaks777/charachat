/* RP Standalone — Persona Studio */

let hasDraft = false;
let _loading = false;

// ── デフォルトID ──
function defaultPersonaId() {
  const dt = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `persona-${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}-${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;
}

// ── スタイル ──
const stylePresets = {
  novel_ai: { viewpoint: "ai_character", person: "first", narration: true },
  novel_user: { viewpoint: "user_character", person: "third", narration: true },
  chat: { viewpoint: "ai_character", person: "first", narration: false },
};

function getStyle() {
  const preset = document.getElementById("t-style-preset").value;
  if (preset !== "custom") return stylePresets[preset];
  return {
    viewpoint: document.getElementById("t-viewpoint").value,
    person: document.getElementById("t-person").value,
    narration: document.getElementById("t-narration").value === "true",
  };
}

function onStyleChange() {
  document.getElementById("t-style-custom").style.display =
    document.getElementById("t-style-preset").value === "custom" ? "inline-flex" : "none";
}

// ── UI補助 ──
function setLoading(active, msg) {
  _loading = active;
  document.getElementById("loading-overlay").style.display = active ? "flex" : "none";
  if (msg) document.querySelector("#loading-overlay span").textContent = msg;
  document.querySelectorAll(".btn-primary").forEach(b => {
    if (b.id !== "lang-toggle") b.disabled = active;
  });
}

function setStatus(msg, isError) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.style.color = isError ? "var(--error)" : "var(--text-dim)";
}

function showToast(msg, isError) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.background = isError ? "var(--error)" : "var(--accent)";
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── タブ切替 ──
function switchTab(id) {
  document.querySelectorAll(".tab-row button").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.querySelector(`.tab-row button[onclick*="${id}"]`).classList.add("active");
  document.getElementById("tab-" + id).classList.add("active");
  if (id === "saved") loadSavedPersonas();
}

// ── 全フォームフィールドID ──
const ALL_T_FIELDS = [
  "name","sex","gender","age","birthday","species","blood",
  "height","weight","bwh","hair","eyes","skin","clothing",
  "personality","principles","firstperson","secondperson","tone","speech",
  "likes","habits","occupation","skills",
  "background","forbidden","opening_scene"
];

function resetForm(prefix) {
  ALL_T_FIELDS.forEach(id => {
    const el = document.getElementById(prefix + "-" + id);
    if (el) el.value = "";
  });
  if (prefix === "t") document.getElementById("raw-text").value = "";
}

function resetAll() {
  const hasInput = hasDraft || ALL_T_FIELDS.some(id => {
    const el = document.getElementById("t-" + id);
    return el && el.value.trim();
  }) || (document.getElementById("raw-text").value.trim())
    || (document.getElementById("d-source-dir").value.trim());
  if (hasInput && !confirm("入力内容をすべてリセットしますか？")) return;

  ALL_T_FIELDS.forEach(id => {
    const el = document.getElementById("t-" + id);
    if (el) el.value = "";
  });
  document.getElementById("raw-text").value = "";
  document.getElementById("d-source-dir").value = "";
  document.getElementById("t-persona-id").value = defaultPersonaId();
  document.getElementById("d-persona-id").value = document.getElementById("t-persona-id").value;
  validatePersonaId(document.getElementById("t-persona-id"));
  validatePersonaId(document.getElementById("d-persona-id"));
  document.getElementById("t-style-preset").value = "novel_ai";
  document.getElementById("t-style-custom").style.display = "none";
  document.getElementById("file-validation").style.display = "none";
  setExtraSections([]);
  document.getElementById("result-panel").style.display = "none";
  document.getElementById("action-bar").style.display = "none";
  hasDraft = false;
  setStatus(t("statusReady"));
}

// ── 結果表示 ──
function showResult(draft) {
  hasDraft = true;
  document.getElementById("result-soul").value = draft.soul_md || "";
  document.getElementById("result-skill").value = draft.skill_md || "";
  document.getElementById("result-panel").style.display = "block";
  document.getElementById("action-bar").style.display = "flex";
  switchResultTab("soul");
}

function switchResultTab(tab) {
  document.getElementById("result-soul").style.display = tab === "soul" ? "block" : "none";
  document.getElementById("result-skill").style.display = tab === "skill" ? "block" : "none";
  document.getElementById("result-tab-soul").className = "btn btn-secondary btn-sm" + (tab === "soul" ? " active" : "");
  document.getElementById("result-tab-skill").className = "btn btn-secondary btn-sm" + (tab === "skill" ? " active" : "");
}

function toggleTestChat() {
  const o = document.getElementById("test-overlay");
  o.style.display = o.style.display === "flex" ? "none" : "flex";
}

// ── フィールド抽出（v3.3: LLMで構造化JSON抽出 → フォーム反映） ──

// ── 自由設定（extra_sections）DOM管理 ──

function addExtraSection(title, content) {
  title = title || "";
  content = content || "";
  const container = document.getElementById("extra-sections-list");
  const div = document.createElement("div");
  div.className = "extra-section-item";
  div.style.cssText = "margin-bottom:8px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px";
  div.innerHTML =
    `<input class="extra-title" value="${escapeHtml(title)}" placeholder="タイトル（任意）" style="width:100%;margin-bottom:4px;font-size:13px">` +
    `<textarea class="extra-content" placeholder="内容" style="width:100%;min-height:60px;font-size:13px;resize:vertical">${escapeHtml(content)}</textarea>` +
    `<button type="button" class="btn btn-danger btn-sm" onclick="removeExtraSection(this)" style="margin-top:4px">× 削除</button>`;
  container.appendChild(div);
}

function removeExtraSection(btn) {
  btn.closest(".extra-section-item").remove();
}

function getExtraSections() {
  const items = document.querySelectorAll(".extra-section-item");
  const result = [];
  items.forEach(item => {
    const title = item.querySelector(".extra-title").value.trim();
    const content = item.querySelector(".extra-content").value.trim();
    if (content) result.push({ title, content });
  });
  return result;
}

function setExtraSections(data) {
  const container = document.getElementById("extra-sections-list");
  container.innerHTML = "";
  if (Array.isArray(data)) {
    data.forEach(s => addExtraSection(s.title || "", s.content || ""));
  }
}

// ── フォーム反映（JSON → フォーム） ──

function fillFormFromFields(fields) {
  // JSONキー → フォームID の直接マッピング。正規表現廃止。
  const mapping = {
    name: "t-name", sex: "t-sex", gender: "t-gender", age: "t-age",
    birthday: "t-birthday", species: "t-species", blood: "t-blood",
    height: "t-height", weight: "t-weight", bwh: "t-bwh",
    hair: "t-hair", eyes: "t-eyes", skin: "t-skin", clothing: "t-clothing",
    personality: "t-personality", principles: "t-principles",
    firstperson: "t-firstperson", secondperson: "t-secondperson",
    tone: "t-tone", speech: "t-speech",
    likes: "t-likes", habits: "t-habits",
    occupation: "t-occupation", skills: "t-skills",
    background: "t-background", forbidden: "t-forbidden",
    opening_scene: "t-opening_scene",
  };
  for (const [key, elId] of Object.entries(mapping)) {
    if (fields[key] !== undefined && fields[key] !== null) {
      const el = document.getElementById(elId);
      if (el) el.value = String(fields[key]);
    }
  }
}

async function extractFields() {
  if (_loading) return;
  const text = document.getElementById("raw-text").value.trim();
  if (!text) { setStatus(t("statusNeedText"), true); return; }
  const personaId = document.getElementById("t-persona-id").value.trim() || defaultPersonaId();
  setLoading(true, "抽出中...");
  try {
    const res = await fetch("/api/persona-studio/extract-fields", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, persona_id: personaId }),
    });
    const data = await res.json();
    if (data.error) { setLoading(false); setStatus(data.error, true); return; }

    fillFormFromFields(data.fields || {});
    setExtraSections(data.extra_sections || []);
    setLoading(false);
    const extraCount = (data.extra_sections || []).length;
    setStatus(`抽出完了: ${Object.keys(data.fields || {}).filter(k => data.fields[k]).length} 項目反映` + (extraCount > 0 ? ` / extra_sections: ${extraCount}件` : ""));
    showToast("✓ フィールド抽出完了。必要に応じて編集し「フォームから生成」を押してください");
  } catch (err) { setLoading(false); setStatus("通信エラー: " + err, true); }
}

// ── 旧: テキスト→SOUL.md直接変換（非推奨、後方互換） ──

function readTemplateFields() {
  const f = {};
  ALL_T_FIELDS.forEach(id => { f[id] = document.getElementById("t-" + id).value; });
  return f;
}

async function generateFromTemplate() {
  if (_loading) return;
  const personaId = document.getElementById("t-persona-id").value.trim();
  const name = document.getElementById("t-name").value.trim();
  if (!personaId) { setStatus("ペルソナIDは必須です", true); return; }
  if (!name) { setStatus("名前は必須です", true); return; }
  setLoading(true, "生成中...");
  try {
    const res = await fetch("/api/persona-studio/create-template", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona_id: personaId,
        fields: readTemplateFields(),
        extra_sections: getExtraSections(),
        style_override: getStyle(),
      }),
    });
    const data = await res.json();
    if (data.error) { setLoading(false); setStatus(data.error, true); return; }
    showResult(data.draft);
    setLoading(false);
    setStatus(t("statusReady"));
  } catch (err) { setLoading(false); setStatus("通信エラー: " + err, true); }
}

async function convertRawText() {
  if (_loading) return;
  const text = document.getElementById("raw-text").value.trim();
  if (!text) { setStatus("テキストを入力してください", true); return; }
  const personaId = document.getElementById("t-persona-id").value.trim() || defaultPersonaId();
  setLoading(true, "生成中...");
  try {
    const res = await fetch("/api/persona-studio/convert-freetext", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, persona_id: personaId, style_override: getStyle() }),
    });
    const data = await res.json();
    if (data.error) { setLoading(false); setStatus(data.error, true); return; }
    showResult(data.draft);
    fillTemplateForm(data.draft.soul_md || "");
    setLoading(false);
    setStatus(t("statusReady"));
  } catch (err) { setLoading(false); setStatus("通信エラー: " + err, true); }
}

// ── 保存 ──
async function saveDraft() {
  if (!hasDraft) { setStatus("先に生成してください", true); return; }

  let personaId = document.getElementById("t-persona-id").value.trim()
               || document.getElementById("d-persona-id").value.trim();
  if (!personaId) {
    personaId = defaultPersonaId();
    document.getElementById("t-persona-id").value = personaId;
    document.getElementById("d-persona-id").value = personaId;
  }

  try {
    const listRes = await fetch("/api/persona/list");
    const personas = await listRes.json();
    if (personas.some(p => p.id === personaId)) {
      if (!confirm(`「${personaId}」は既に存在します。上書き保存しますか？`)) return;
    }
  } catch (err) { /* 照合失敗時は確認なしで続行 */ }

  const draft = {
    persona_id: personaId,
    soul_md: document.getElementById("result-soul").value,
    skill_md: document.getElementById("result-skill").value,
    extra_sections: getExtraSections(),
    style: getStyle(),
  };

  setStatus("保存中...");
  try {
    const res = await fetch("/api/persona-studio/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona_id: personaId, draft }),
    });
    const data = await res.json();
    if (data.error) { setStatus(data.error, true); showToast(data.error, true); return; }
    setStatus("保存しました: " + personaId);
    showToast("✓ 保存完了: " + personaId);
    hasDraft = false;
    document.getElementById("result-panel").style.display = "none";
    document.getElementById("action-bar").style.display = "none";
    loadSavedPersonas();
  } catch (err) { setStatus("通信エラー: " + err, true); showToast("保存失敗: " + err, true); }
}

// ── テスト会話 ──
async function doTestChat() {
  if (!hasDraft) { setStatus("先に生成してください", true); return; }
  const msg = document.getElementById("test-msg").value.trim();
  if (!msg) return;
  setLoading(true, "応答生成中...");
  try {
    const draft = {
      persona_id: document.getElementById("t-persona-id").value.trim(),
      soul_md: document.getElementById("result-soul").value,
      skill_md: document.getElementById("result-skill").value,
      style: getStyle(),
    };
    const res = await fetch("/api/persona-studio/test-chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, message: msg }),
    });
    const data = await res.json();
    if (data.error) { setLoading(false); setStatus(data.error, true); showToast(data.error, true); return; }
    setLoading(false);
    const log = document.getElementById("test-log");
    log.textContent += (log.textContent ? "\n\n" : "") + "👤 " + msg + "\n🤖 " + data.response;
    document.getElementById("test-msg").value = "";
    document.getElementById("test-msg").style.height = "auto";
    document.getElementById("test-overlay").style.display = "flex";
    setStatus(t("statusReady"));
  } catch (err) { setLoading(false); setStatus("通信エラー: " + err, true); }
}

// ── インポート ──
async function validateFiles() {
  const sourceDir = document.getElementById("d-source-dir").value.trim();
  if (!sourceDir) { setStatus("フォルダを入力してください", true); return; }
  setStatus("確認中...");
  try {
    const res = await fetch("/api/persona-studio/validate-files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_dir: sourceDir }),
    });
    const data = await res.json();
    const el = document.getElementById("file-validation");
    el.style.display = "block";
    if (data.error) {
      el.innerHTML = `<span style="color:var(--error)">${data.error}</span>`;
    } else {
      const found = data.found || [];
      const missing = data.missing || [];
      let html = found.map(f => `<span style="color:#22c55e">✓ ${f}</span>`).join("<br>");
      if (missing.length) html += "<br>" + missing.map(f => `<span style="color:#f59e0b">⚠ ${f} — 登録時に自動生成</span>`).join("<br>");
      el.innerHTML = html;
      setStatus(missing.length === 0 ? "全ファイル検出 — 即登録可能" : "一部ファイル不足 — 登録時に自動生成");
    }
  } catch (err) { setStatus("確認失敗: " + err, true); }
}

async function importPersona() {
  if (_loading) return;
  const personaId = document.getElementById("d-persona-id").value.trim();
  const sourceDir = document.getElementById("d-source-dir").value.trim();
  if (!personaId) { setStatus("ペルソナIDを入力してください", true); return; }
  if (!sourceDir) { setStatus("登録元フォルダを入力してください", true); return; }
  setLoading(true, "インポート中...");
  try {
    const res = await fetch("/api/persona-studio/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona_id: personaId, source_dir: sourceDir }),
    });
    const data = await res.json();
    if (data.error) { setLoading(false); setStatus(data.error, true); showToast(data.error, true); return; }
    setLoading(false);
    setStatus("インポート完了: " + personaId + " (" + data.imported.join(", ") + ")");
    showToast("✓ インポート: " + personaId);
    loadSavedPersonas();
  } catch (err) { setLoading(false); setStatus("インポート失敗: " + err, true); showToast("インポート失敗: " + err, true); }
}

// ── 保存済み一覧 ──
async function loadSavedPersonas() {
  const container = document.getElementById("saved-persona-list");
  container.innerHTML = '<span style="color:var(--text-dim)">読み込み中...</span>';
  try {
    const res = await fetch("/api/persona/list");
    const personas = await res.json();
    if (!personas.length) { container.innerHTML = '<span style="color:var(--text-dim)">登録済みペルソナはありません</span>'; return; }
    container.innerHTML = personas.map(p => `
      <div class="saved-persona-item" onclick="loadDraft('${p.id}')" ondblclick="deletePersona('${p.id}')">
        <div class="saved-persona-main">
          <span class="saved-persona-date">${p.updated || ''}</span>
          <span class="saved-persona-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="saved-persona-actions">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();loadDraft('${p.id}')">読込</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deletePersona('${p.id}')">削除</button>
        </div>
      </div>
    `).join("");
  } catch (err) { container.innerHTML = '<span style="color:var(--error)">読み込み失敗</span>'; }
}

// ── SOUL.md → フォーム抽出 ──
function setMatch(text, regex, fieldId) {
  const m = text.match(regex);
  if (m) document.getElementById(fieldId).value = m[1].trim();
}

function extractSection(text, heading) {
  const re = new RegExp(`##\\s*[■□]?\\s*${heading}[\\s\\S]*?(?=\\n##\\s|\\n---|$)`, "i");
  const m = text.match(re);
  return m ? m[0].replace(/^##.*\n/, "").trim() : "";
}

function fillTemplateForm(soul) {
  if (!soul) return;

  const nameMatch = soul.match(/#\s*SOUL:\s*(.+?)(?:\s*[—–-].*)?$/m);
  if (nameMatch) document.getElementById("t-name").value = nameMatch[1].trim();

  const allText = soul;
  setMatch(allText, /身体的性別[：:]\s*(.+)/, "t-sex");
  setMatch(allText, /^\s*-\s*\*\*性別\*\*[：:]\s*(.+)/m, "t-sex");
  setMatch(allText, /性自認[：:]\s*(.+)/, "t-gender");
  setMatch(allText, /年齢[：:]\s*(.+)/, "t-age");
  setMatch(allText, /^\s*-\s*\*\*年齢\*\*[：:]\s*(.+)/m, "t-age");
  setMatch(allText, /誕生日[：:]\s*(.+)/, "t-birthday");
  setMatch(allText, /種族[：:]\s*(.+)/, "t-species");
  setMatch(allText, /血液型[：:]\s*(.+)/, "t-blood");
  setMatch(allText, /身長[：:]\s*(.+)/, "t-height");
  setMatch(allText, /^\s*-\s*\*\*体格\*\*[：:]\s*(.+)/m, "t-height");
  setMatch(allText, /体重[：:]\s*(.+)/, "t-weight");
  setMatch(allText, /BWH[：:]\s*(.+)/, "t-bwh");
  setMatch(allText, /^\s*-\s*\*\*髪\*\*[：:]\s*(.+)/m, "t-hair");
  setMatch(allText, /髪[：:]\s*(.+)/, "t-hair");
  setMatch(allText, /^\s*-\s*\*\*目\*\*[：:]\s*(.+)/m, "t-eyes");
  setMatch(allText, /目[：:]\s*(.+)/, "t-eyes");
  setMatch(allText, /^\s*-\s*\*\*肌\*\*[：:]\s*(.+)/m, "t-skin");
  setMatch(allText, /肌[：:]\s*(.+)/, "t-skin");
  setMatch(allText, /^\s*-\s*\*\*服装\*\*[：:]\s*(.+)/m, "t-clothing");
  setMatch(allText, /服装[：:]\s*(.+)/, "t-clothing");
  setMatch(allText, /一人称[：:]\s*["「]?(.+?)["」]?\s*$/m, "t-firstperson");
  setMatch(allText, /^\s*-\s*\*\*一人称\*\*[：:]\s*["「]?(.+?)["」]?\s*$/m, "t-firstperson");
  setMatch(allText, /二人称[：:]\s*["「]?(.+?)["」]?\s*$/m, "t-secondperson");
  setMatch(allText, /^\s*-\s*\*\*二人称\*\*[：:]\s*["「]?(.+?)["」]?\s*$/m, "t-secondperson");
  setMatch(allText, /職業[：:]\s*(.+)/, "t-occupation");
  setMatch(allText, /^\s*-\s*\*\*職業\*\*[：:]\s*(.+)/m, "t-occupation");
  setMatch(allText, /所属[：:]\s*(.+)/, "t-occupation");
  setMatch(allText, /年収[：:]\s*(.+)/, "t-income");
  setMatch(allText, /生活水準[：:]\s*(.+)/, "t-income");
  setMatch(allText, /能力[：:]\s*(.+)/, "t-skills");
  setMatch(allText, /スキル[：:]\s*(.+)/, "t-skills");

  document.getElementById("t-personality").value = extractSection(allText, "人格定義");
  document.getElementById("t-principles").value = extractSection(allText, "行動原理");
  document.getElementById("t-tone").value = extractSection(allText, "口調[^サ]") || extractSection(allText, "口調の特徴");
  document.getElementById("t-speech").value = extractSection(allText, "口調サンプル") || extractSection(allText, "セリフサンプル");
  document.getElementById("t-likes").value = extractSection(allText, "好き嫌い");
  document.getElementById("t-habits").value = extractSection(allText, "癖");
  document.getElementById("t-background").value = extractSection(allText, "背景");
  document.getElementById("t-forbidden").value = extractSection(allText, "禁止事項");
  document.getElementById("t-opening_scene").value = extractSection(allText, "開始時の状況");
}

async function loadDraft(personaId) {
  setStatus("読み込み中...");
  try {
    const res = await fetch("/api/persona-studio/load/" + encodeURIComponent(personaId));
    const data = await res.json();
    if (data.error) { setStatus(data.error, true); showToast(data.error, true); return; }
    const d = data.draft;

    document.getElementById("t-persona-id").value = d.persona_id || "";
    document.getElementById("d-persona-id").value = d.persona_id || "";
    validatePersonaId(document.getElementById("t-persona-id"));
    validatePersonaId(document.getElementById("d-persona-id"));

    if (d.style) {
      const s = d.style;
      document.getElementById("t-viewpoint").value = s.viewpoint || "ai_character";
      document.getElementById("t-person").value = s.person || "first";
      document.getElementById("t-narration").value = s.narration ? "true" : "false";
      const match = Object.entries(stylePresets).find(([,v]) =>
        v.viewpoint === s.viewpoint && v.person === s.person && v.narration === s.narration);
      document.getElementById("t-style-preset").value = match ? match[0] : "custom";
      onStyleChange();
    }

    fillTemplateForm(d.soul_md || "");
    setExtraSections(d.extra_sections || []);
    showResult(d);
    setStatus("読み込み完了: " + personaId);
    showToast("✓ 読み込み: " + personaId);
  } catch (err) { setStatus("読込失敗: " + err, true); }
}

async function deletePersona(personaId) {
  if (!confirm("ペルソナ '" + personaId + "' を削除しますか？")) return;
  setStatus("削除中...");
  try {
    const res = await fetch("/api/persona-studio/delete/" + encodeURIComponent(personaId), { method: "DELETE" });
    const data = await res.json();
    if (data.error) { setStatus(data.error, true); showToast(data.error, true); return; }
    setStatus("削除しました: " + personaId);
    showToast("✓ 削除: " + personaId);
    loadSavedPersonas();
  } catch (err) { setStatus("削除失敗: " + err, true); showToast("削除失敗: " + err, true); }
}

// ── バリデーション ──
const PERSONA_ID_RE = /^[a-zA-Z0-9_-]*$/;

function validatePersonaId(el) {
  const hint = el.parentElement.querySelector(".validation-hint");
  if (!hint) return;
  const valid = PERSONA_ID_RE.test(el.value);
  el.classList.toggle("invalid", !valid && el.value.length > 0);
  hint.textContent = valid || el.value.length === 0 ? "" : "半角英数字・ハイフン・アンダースコアのみ使用可";
  hint.classList.toggle("visible", !valid && el.value.length > 0);
}

function syncPersonaIdAndValidate(fromId, toId) {
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  if (fromEl && toEl) {
    toEl.value = fromEl.value;
    validatePersonaId(fromEl);
    validatePersonaId(toEl);
  }
}

// ── 初期化 ──
document.addEventListener("DOMContentLoaded", () => {
  i18nApply();
  updateLangToggle();

  const defaultId = defaultPersonaId();
  document.getElementById("t-persona-id").value = defaultId;
  document.getElementById("d-persona-id").value = defaultId;

  // t ↔ d のpersona-id同期（バリデーション付き）
  document.getElementById("t-persona-id").addEventListener("input", () => {
    syncPersonaIdAndValidate("t-persona-id", "d-persona-id");
  });
  document.getElementById("d-persona-id").addEventListener("input", () => {
    syncPersonaIdAndValidate("d-persona-id", "t-persona-id");
  });

  const testMsg = document.getElementById("test-msg");
  testMsg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doTestChat(); }
  });
  testMsg.addEventListener("input", () => {
    testMsg.style.height = "auto";
    testMsg.style.height = Math.min(testMsg.scrollHeight, parseFloat(getComputedStyle(testMsg).lineHeight) * 3 + 16) + "px";
  });
});

window.addEventListener("beforeunload", (e) => {
  if (hasDraft) e.preventDefault();
});
