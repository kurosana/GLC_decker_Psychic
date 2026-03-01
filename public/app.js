// ローカルストレージキー
const STORAGE_KEY = "glc_decks_v1";

let decks = [];
let activeDeckIds = [];
let cardPool = [];
let cardCategories = [];
let currentFilter = "all";
let energyCardFile = "psychic_energy.png";
// デッキ作成ビュー用の作業コピー
const builderWorking = {};
let builderSelectedDeckId = null;

function getEnergyCount(deck) {
  if (!deck) return 0;
  if (typeof deck.energyCount === "number") return deck.energyCount;
  // 旧形式 (オブジェクト) に対応して合計を返す
  if (deck.energyCount && typeof deck.energyCount === "object") {
    return Object.values(deck.energyCount).reduce(
      (sum, v) => sum + (typeof v === "number" ? v : 0),
      0
    );
  }
  return 0;
}

// ユーティリティ: ストレージ読み書き
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    decks = [];
    activeDeckIds = [];
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    decks = parsed.decks || [];
    if (Array.isArray(parsed.activeDeckIds)) {
      activeDeckIds = parsed.activeDeckIds;
    } else if (parsed.activeDeckId) {
      activeDeckIds = [parsed.activeDeckId];
    } else {
      activeDeckIds = [];
    }
  } catch (e) {
    console.error("状態の読み込みに失敗しました", e);
    decks = [];
    activeDeckIds = [];
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ decks, activeDeckIds })
  );
}

// カード API から画像一覧を取得
async function loadCards() {
  try {
    const res = await fetch("/api/cards");
    const data = await res.json();
    cardPool = data.cards || [];
    cardCategories = data.categories || [];
    if (data.energyCard) {
      energyCardFile = data.energyCard;
    }
  } catch (e) {
    console.error("カード一覧の取得に失敗しました", e);
    cardPool = [];
  }
}

// パスからカテゴリを取得（フォルダ名。cardPool に無い場合は path の先頭セグメント）
function getCardCategory(path) {
  const entry = cardPool.find(
    (c) => (typeof c === "string" ? c : c.path) === path
  );
  if (entry && typeof entry !== "string" && entry.category)
    return entry.category;
  const segment = (path || "").split("/")[0];
  return segment || "other";
}

// 作業コピーに対するカード追加/削除（オーバーレイ・メイン両方から利用）
function toggleCardInWorking(working, filename) {
  if (filename === energyCardFile) {
    working.energyCount = (working.energyCount || 0) + 1;
  } else {
    const idx = working.cards.indexOf(filename);
    if (idx === -1) {
      const cat = getCardCategory(filename);
      let insertAt = working.cards.length;
      for (let i = working.cards.length - 1; i >= 0; i--) {
        if (getCardCategory(working.cards[i]) === cat) {
          insertAt = i + 1;
          break;
        }
      }
      working.cards.splice(insertAt, 0, filename);
    } else {
      working.cards.splice(idx, 1);
    }
  }
  renderBuilder();
}

// ----- UI 切り替え -----
function setupNavigation() {
  const navButtons = document.querySelectorAll(".nav-item");
  const views = {
    decks: document.getElementById("view-decks"),
    builder: document.getElementById("view-builder"),
    switcher: document.getElementById("view-switcher")
  };
  const title = document.getElementById("view-title");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;

      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      Object.values(views).forEach((v) => v.classList.remove("active"));
      views[view].classList.add("active");

      if (view === "decks") title.textContent = "デッキ一覧";
      if (view === "builder") title.textContent = "デッキ編集";
      if (view === "switcher") title.textContent = "デッキ入れ替え";

      if (view === "builder") {
        renderBuilder();
      } else if (view === "switcher") {
        renderSwitcher();
      }
    });
  });
}

// ----- デッキ一覧 -----
function renderDeckList() {
  const container = document.getElementById("deck-list");
  container.innerHTML = "";

  if (decks.length === 0) {
    container.innerHTML =
      '<p class="hint">まだデッキがありません。「新しいデッキを作成」から追加してください。</p>';
    return;
  }

  const activeDecks = decks.filter((d) => activeDeckIds.includes(d.id));
  const otherDecks = decks.filter((d) => !activeDeckIds.includes(d.id));

  function createDeckCard(deck) {
    const card = document.createElement("div");
    card.className = "deck-card";

    const count = deck.cards.length + getEnergyCount(deck);
    const isActive = activeDeckIds.includes(deck.id);
    const activateClass = isActive
      ? "primary-btn deck-activate"
      : "primary-btn deck-activate outline";

    card.innerHTML = `
      <div>
        <div class="deck-name">${deck.name}</div>
        <div class="deck-meta">${count} 枚</div>
      </div>
      <div class="deck-actions">
        <button class="secondary-btn deck-edit">
          <span class="deck-action-icon">✏️</span>
          <span class="deck-action-label">Name</span>
        </button>
        <button class="secondary-btn deck-view">
          <span class="deck-action-icon">👁️</span>
          <span class="deck-action-label">Check</span>
        </button>
        <button class="${activateClass}">
          <span class="deck-action-label">Active</span>
        </button>
      </div>
    `;

    card.querySelector(".deck-edit").addEventListener("click", () => {
      openDeckModal(deck);
    });

    card.querySelector(".deck-view").addEventListener("click", () => {
      openDeckViewer(deck);
    });

    const activateBtn = card.querySelector(".deck-activate");

    activateBtn.addEventListener("mousedown", () => {
      const currentlyActive = activeDeckIds.includes(deck.id);
      if (currentlyActive) {
        activateBtn.classList.add("outline");
      } else {
        activateBtn.classList.remove("outline");
      }
    });

    ["mouseup", "mouseleave"].forEach((ev) => {
      activateBtn.addEventListener(ev, () => {
        const currentlyActive = activeDeckIds.includes(deck.id);
        if (currentlyActive) {
          activateBtn.classList.remove("outline");
        } else {
          activateBtn.classList.add("outline");
        }
      });
    });

    activateBtn.addEventListener("click", () => {
      const idx = activeDeckIds.indexOf(deck.id);
      if (idx === -1) {
        activeDeckIds.push(deck.id);
      } else {
        activeDeckIds.splice(idx, 1);
      }
      saveState();
      renderDeckList();
      renderSwitcher();
    });

    return card;
  }

  // アクティブデッキ欄
  const activeSection = document.createElement("div");
  activeSection.className = "deck-section";
  const activeHeader = document.createElement("div");
  activeHeader.className = "deck-section-header";
  activeHeader.textContent = "アクティブデッキ";
  const activeGrid = document.createElement("div");
  activeGrid.className = "deck-list-grid";

  if (activeDecks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "アクティブなデッキはまだありません。";
    activeGrid.appendChild(empty);
  } else {
    activeDecks.forEach((d) => activeGrid.appendChild(createDeckCard(d)));
  }

  activeSection.appendChild(activeHeader);
  activeSection.appendChild(activeGrid);
  container.appendChild(activeSection);

  // 区切り線
  const divider = document.createElement("hr");
  divider.className = "deck-divider";
  container.appendChild(divider);

  // その他のデッキ欄
  const otherSection = document.createElement("div");
  otherSection.className = "deck-section";
  const otherHeader = document.createElement("div");
  otherHeader.className = "deck-section-header";
  otherHeader.textContent = "その他のデッキ";
  const otherGrid = document.createElement("div");
  otherGrid.className = "deck-list-grid";

  if (otherDecks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "その他のデッキはありません。";
    otherGrid.appendChild(empty);
  } else {
    otherDecks.forEach((d) => otherGrid.appendChild(createDeckCard(d)));
  }

  otherSection.appendChild(otherHeader);
  otherSection.appendChild(otherGrid);
  container.appendChild(otherSection);
}

// ----- デッキ作成 / 編集モーダル -----
function setupDeckModal() {
  const modal = document.getElementById("deck-modal");
  const title = document.getElementById("deck-modal-title");
  const nameInput = document.getElementById("deck-name-input");
  const cancelBtn = document.getElementById("deck-modal-cancel");
  const saveBtn = document.getElementById("deck-modal-save");
  const createBtn = document.getElementById("create-deck-btn");

  let editingDeck = null;

  function close() {
    modal.classList.add("hidden");
    nameInput.value = "";
    editingDeck = null;
  }

  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  createBtn.addEventListener("click", () => {
    editingDeck = null;
    title.textContent = "デッキを作成";
    nameInput.value = "";
    modal.classList.remove("hidden");
    nameInput.focus();
  });

  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || "名称未設定デッキ";
    if (editingDeck) {
      editingDeck.name = name;
    } else {
      const id = `deck_${Date.now()}`;
      const newDeck = { id, name, cards: [] };
      decks.push(newDeck);
      if (activeDeckIds.length === 0) activeDeckIds = [id];
      builderSelectedDeckId = id;
    }
    saveState();
    renderDeckList();
    renderBuilder();
    renderSwitcher();
    close();
  });

  // 外から編集を呼び出せるように
  window.openDeckModal = (deck) => {
    editingDeck = deck;
    title.textContent = "デッキ名を編集";
    nameInput.value = deck.name;
    modal.classList.remove("hidden");
    nameInput.focus();
  };
}

// ----- デッキ確認モーダル -----
function setupDeckViewer() {
  const modal = document.getElementById("deck-viewer-modal");
  const title = document.getElementById("deck-viewer-title");
  const countLabel = document.getElementById("deck-viewer-count");
  const grid = document.getElementById("deck-viewer-grid");
  const closeBtn = document.getElementById("deck-viewer-close");

  function close() {
    modal.classList.add("hidden");
    grid.innerHTML = "";
  }

  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  window.openDeckViewer = (deck) => {
    title.textContent = deck.name;
    grid.innerHTML = "";

    const files = [...deck.cards];
    const energyNum = getEnergyCount(deck);
    if (energyNum) {
      files.push(energyCardFile);
    }
    const total = deck.cards.length + energyNum;
    countLabel.textContent = `${total} / 60 枚`;

    files.forEach((file) => {
      const div = document.createElement("div");
      div.className = "card selected";
      const isEnergy = file === energyCardFile;
      let badge = "";
      if (isEnergy) {
        badge = `<span class="card-badge">エネ ×${energyNum}</span>`;
      }
      div.innerHTML = `
        <img src="/card/${file}" alt="${file}" />
        ${badge}
      `;
      grid.appendChild(div);
    });

    modal.classList.remove("hidden");
  };
}

// パスからサブフォルダ一覧を構築（card/1.ポケモン/サブ/file.png → 1.ポケモン → [サブ, ...]）
function buildSubcategoriesMap() {
  const map = {};
  cardPool.forEach((c) => {
    const path = typeof c === "string" ? c : (c && c.path) || "";
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const cat = parts[0];
      const sub = parts[1];
      if (!map[cat]) map[cat] = [];
      if (!map[cat].includes(sub)) map[cat].push(sub);
    }
  });
  Object.keys(map).forEach((cat) => map[cat].sort());
  return map;
}

// ----- 構築ビュー -----
function renderBuilder() {
  const deckSelect = document.getElementById("builder-deck-select");
  const deckCardsContainer = document.getElementById("current-deck-cards");
  const filterTrigger = document.getElementById("card-filter-trigger");
  const filterDropdown = document.getElementById("card-filter-dropdown");
  const filterWrap = filterTrigger && filterTrigger.closest(".filter-wrap");

  deckSelect.innerHTML = "";
  const poolContainer = document.getElementById("card-pool-list");
  if (decks.length === 0) {
    deckSelect.innerHTML = '<option>デッキがありません</option>';
    if (poolContainer) poolContainer.innerHTML = "";
    if (deckCardsContainer) deckCardsContainer.innerHTML = "";
    return;
  }

  if (!builderSelectedDeckId && decks.length > 0) {
    builderSelectedDeckId = decks[0].id;
  }

  decks.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    if (d.id === builderSelectedDeckId) opt.selected = true;
    deckSelect.appendChild(opt);
  });

  function getSelectedDeck() {
    const id = builderSelectedDeckId || deckSelect.value;
    return decks.find((d) => d.id === id) || decks[0];
  }

  function getWorking(deck) {
    if (!builderWorking[deck.id]) {
      builderWorking[deck.id] = {
        cards: [...deck.cards],
        energyCount: getEnergyCount(deck)
      };
    }
    return builderWorking[deck.id];
  }

  function toggleCard(working, filename) {
    toggleCardInWorking(working, filename);
  }

  function renderPool(deck, working, container) {
    container.innerHTML = "";

    // フィルター初期化（カスタムドロップダウン＋サブメニューは別ボックスで隣に表示）
    if (filterTrigger && filterDropdown && filterWrap && container.id === "card-pool-list") {
      const submenuPanel = document.getElementById("card-filter-submenu");
      const subcategoriesMap = buildSubcategoriesMap();
      filterDropdown.innerHTML = "";
      const setFilter = (value) => {
        currentFilter = value;
        const label =
          value === "all"
            ? "すべて"
            : value.includes("/")
              ? value.replace("/", " › ")
              : value;
        filterTrigger.textContent = label;
        filterDropdown.classList.add("hidden");
        if (submenuPanel) submenuPanel.classList.add("hidden");
        filterTrigger.setAttribute("aria-expanded", "false");
        renderBuilder();
      };
      let submenuHideTimer = null;
      const showSubmenu = (cat, rowEl) => {
        const subs = subcategoriesMap[cat] || [];
        if (subs.length === 0 || !submenuPanel) return;
        if (submenuHideTimer) clearTimeout(submenuHideTimer);
        submenuHideTimer = null;
        submenuPanel.innerHTML = "";
        subs.forEach((sub) => {
          const val = cat + "/" + sub;
          const subBtn = document.createElement("button");
          subBtn.type = "button";
          subBtn.className = "filter-option" + (currentFilter === val ? " active" : "");
          subBtn.textContent = sub;
          subBtn.addEventListener("click", () => setFilter(val));
          submenuPanel.appendChild(subBtn);
        });
        const dr = filterDropdown.getBoundingClientRect();
        const rr = rowEl.getBoundingClientRect();
        submenuPanel.style.left = (dr.right + 8) + "px";
        submenuPanel.style.top = rr.top + "px";
        submenuPanel.classList.remove("hidden");
      };
      const hideSubmenu = (delay = 0) => {
        if (delay) {
          submenuHideTimer = setTimeout(() => {
            submenuHideTimer = null;
            if (submenuPanel) submenuPanel.classList.add("hidden");
          }, delay);
        } else {
          if (submenuHideTimer) clearTimeout(submenuHideTimer);
          submenuHideTimer = null;
          if (submenuPanel) submenuPanel.classList.add("hidden");
        }
      };
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "filter-option" + (currentFilter === "all" ? " active" : "");
      allBtn.textContent = "すべて";
      allBtn.addEventListener("click", () => setFilter("all"));
      filterDropdown.appendChild(allBtn);
      cardCategories.forEach((cat) => {
        const subs = subcategoriesMap[cat] || [];
        const row = document.createElement("div");
        row.className = "filter-row";
        const mainBtn = document.createElement("button");
        mainBtn.type = "button";
        mainBtn.className =
          "filter-option" +
          (currentFilter === cat ? " active" : "") +
          (subs.length ? " has-sub" : "");
        mainBtn.textContent = cat;
        mainBtn.addEventListener("click", () => setFilter(cat));
        row.appendChild(mainBtn);
        if (subs.length && submenuPanel) {
          row.addEventListener("mouseenter", () => showSubmenu(cat, row));
          row.addEventListener("mouseleave", () => hideSubmenu(200));
        }
        filterDropdown.appendChild(row);
      });
      if (submenuPanel) {
        submenuPanel.addEventListener("mouseenter", () => {
          if (submenuHideTimer) clearTimeout(submenuHideTimer);
          submenuHideTimer = null;
        });
        submenuPanel.addEventListener("mouseleave", () => hideSubmenu(0));
      }
      if (!filterWrap._filterListenersAttached) {
        filterWrap._filterListenersAttached = true;
        filterTrigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = !filterDropdown.classList.contains("hidden");
          filterDropdown.classList.toggle("hidden", open);
          if (!open && submenuPanel) submenuPanel.classList.add("hidden");
          filterTrigger.setAttribute("aria-expanded", String(!open));
        });
        document.addEventListener("click", (e) => {
          if (!filterWrap.contains(e.target) && !(submenuPanel && submenuPanel.contains(e.target))) {
            filterDropdown.classList.add("hidden");
            if (submenuPanel) submenuPanel.classList.add("hidden");
            filterTrigger.setAttribute("aria-expanded", "false");
          }
        });
      }
      const label =
        currentFilter === "all"
          ? "すべて"
          : currentFilter.includes("/")
            ? currentFilter.replace("/", " › ")
            : currentFilter;
      filterTrigger.textContent = label;
    }

    cardPool.forEach((card) => {
      const file = typeof card === "string" ? card : card.path;
      const pathForFilter = file || "";

      if (
        currentFilter !== "all" &&
        !(pathForFilter.startsWith(currentFilter + "/"))
      )
        return;

      const isEnergy = file === energyCardFile;
      const isSelected =
        (!isEnergy && working.cards.includes(file)) ||
        (isEnergy && (working.energyCount || 0) > 0);

      const div = document.createElement("div");
      div.className =
        "card" +
        (isSelected ? " selected" : "") +
        (isEnergy ? " energy-card" : "");
      div.dataset.path = file;

      if (isEnergy) {
        const count = working.energyCount || 0;
        div.innerHTML = `
          <img src="/card/${file}" alt="${file}" />
          <div class="energy-hover-panel">
            <div>基本エネルギー枚数</div>
            <div class="energy-controls">
              <button class="energy-minus">-</button>
              <span class="energy-count">${count}</span>
              <button class="energy-plus">+</button>
            </div>
          </div>
        `;
        div
          .querySelector(".energy-plus")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            working.energyCount = (working.energyCount || 0) + 1;
            renderBuilder();
          });
        div
          .querySelector(".energy-minus")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            const current = working.energyCount || 0;
            working.energyCount = Math.max(0, current - 1);
            renderBuilder();
          });
      } else {
        div.innerHTML = `<img src="/card/${file}" alt="${file}" />`;
      }

      div.addEventListener("click", () => toggleCard(working, file));
      container.appendChild(div);
    });
  }

  const DROP_GAP = 12;
  const DROP_LINE_WIDTH = 4;

  function clearDropTarget() {
    deckCardsContainer
      .querySelectorAll(".deck-card-draggable.drop-target")
      .forEach((el) => el.classList.remove("drop-target"));
    const ind = document.getElementById("deck-drop-indicator");
    if (ind) ind.style.display = "none";
    deckCardsContainer.dataset.dropInsertIndex = "";
  }

  function showDropIndicatorBeforeCard(cardEl, insertIndex, isEdgeLeft) {
    let ind = document.getElementById("deck-drop-indicator");
    if (!ind) {
      ind = document.createElement("div");
      ind.id = "deck-drop-indicator";
      ind.className = "deck-drop-indicator";
      deckCardsContainer.appendChild(ind);
    }
    const cr = cardEl.getBoundingClientRect();
    const cont = deckCardsContainer.getBoundingClientRect();
    const scrollTop = deckCardsContainer.scrollTop || 0;
    const scrollLeft = deckCardsContainer.scrollLeft || 0;
    const offset =
      (isEdgeLeft ? DROP_GAP * 2 : DROP_GAP / 2) + DROP_LINE_WIDTH / 2;
    const left = cr.left - cont.left + scrollLeft - offset;
    ind.style.left = left + "px";
    ind.style.top = (cr.top - cont.top + scrollTop) + "px";
    ind.style.height = cr.height + "px";
    ind.style.display = "block";
    deckCardsContainer.dataset.dropInsertIndex =
      insertIndex !== undefined ? String(insertIndex) : cardEl.dataset.index ?? "";
  }

  function showDropIndicatorAfterLastCard(lastCardEl, insertIndex, isEdgeRight) {
    let ind = document.getElementById("deck-drop-indicator");
    if (!ind) {
      ind = document.createElement("div");
      ind.id = "deck-drop-indicator";
      ind.className = "deck-drop-indicator";
      deckCardsContainer.appendChild(ind);
    }
    const cr = lastCardEl.getBoundingClientRect();
    const cont = deckCardsContainer.getBoundingClientRect();
    const scrollTop = deckCardsContainer.scrollTop || 0;
    const scrollLeft = deckCardsContainer.scrollLeft || 0;
    const offset =
      (isEdgeRight ? DROP_GAP * 2 : DROP_GAP / 2) + DROP_LINE_WIDTH / 2;
    const left = cr.right - cont.left + scrollLeft + offset;
    ind.style.left = left + "px";
    ind.style.top = (cr.top - cont.top + scrollTop) + "px";
    ind.style.height = cr.height + "px";
    ind.style.display = "block";
    deckCardsContainer.dataset.dropInsertIndex = String(insertIndex);
  }

  if (!deckCardsContainer._dropListenersAttached) {
    deckCardsContainer._dropListenersAttached = true;
    deckCardsContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const card = e.target.closest(".deck-card-draggable");
      const all = deckCardsContainer.querySelectorAll(".deck-card-draggable");
      if (card) {
        deckCardsContainer
          .querySelectorAll(".deck-card-draggable.drop-target")
          .forEach((el) => el.classList.remove("drop-target"));
        const idx = parseInt(card.dataset.index, 10);
        showDropIndicatorBeforeCard(
          card,
          Number.isNaN(idx) ? undefined : idx,
          idx === 0
        );
        return;
      }
      if (all.length === 0) {
        clearDropTarget();
        return;
      }
      const x = e.clientX;
      let insertBeforeIndex = -1;
      for (let i = 0; i < all.length; i++) {
        const r = all[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          insertBeforeIndex = i;
          break;
        }
      }
      if (insertBeforeIndex === 0) {
        showDropIndicatorBeforeCard(all[0], 0, true);
        return;
      }
      if (insertBeforeIndex > 0) {
        showDropIndicatorBeforeCard(
          all[insertBeforeIndex],
          insertBeforeIndex,
          false
        );
        return;
      }
      showDropIndicatorAfterLastCard(all[all.length - 1], all.length, true);
    });
    deckCardsContainer.addEventListener("drop", (e) => {
      const card = e.target.closest(".deck-card-draggable");
      if (card) return;
      const insertIndexStr = deckCardsContainer.dataset.dropInsertIndex;
      if (insertIndexStr === "" || insertIndexStr === undefined) return;
      e.preventDefault();
      const insertIndex = parseInt(insertIndexStr, 10);
      if (Number.isNaN(insertIndex)) return;
      clearDropTarget();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const deck = getSelectedDeck();
      const working = getWorking(deck);
      const arr = working.cards;
      if (fromIndex < 0 || fromIndex >= arr.length) return;
      const [removed] = arr.splice(fromIndex, 1);
      const toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
      arr.splice(Math.max(0, toIndex), 0, removed);
      renderBuilder();
    });
    deckCardsContainer.addEventListener("dragleave", (e) => {
      if (
        e.relatedTarget &&
        !deckCardsContainer.contains(e.relatedTarget)
      ) {
        clearDropTarget();
      }
    });
  }

  function renderDeckCards(deck, working) {
    deckCardsContainer.innerHTML = "";
    const energyNum = working.energyCount || 0;
    const totalCount = working.cards.length + energyNum;
    const countLabel = document.getElementById("deck-count-label");
    if (countLabel) {
      countLabel.textContent = `${totalCount} / 60 枚`;
    }

    // 非エネルギーカード（ドラッグ並べ替え可能）
    working.cards.forEach((file, index) => {
      const div = document.createElement("div");
      div.className = "card selected deck-card-draggable";
      div.draggable = true;
      div.dataset.index = String(index);
      div.innerHTML = `<img src="/card/${file}" alt="${file}" />`;
      div.addEventListener("click", (e) => {
        if (e.target.closest("img")) {
          const idx = working.cards.indexOf(file);
          if (idx !== -1) working.cards.splice(idx, 1);
          renderBuilder();
        }
      });
      div.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
        div.classList.add("dragging");
      });
      div.addEventListener("dragend", () => {
        div.classList.remove("dragging");
        clearDropTarget();
      });
      div.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      div.addEventListener("drop", (e) => {
        e.preventDefault();
        clearDropTarget();
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIndex = parseInt(e.currentTarget.dataset.index, 10);
        if (fromIndex === toIndex) return;
        const arr = working.cards;
        const [removed] = arr.splice(fromIndex, 1);
        const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
        arr.splice(insertAt, 0, removed);
        renderBuilder();
      });
      deckCardsContainer.appendChild(div);
    });

    // 基本エネルギーは1枚にまとめて枚数表示
    if (energyNum > 0) {
      const div = document.createElement("div");
      div.className = "card selected";
      div.innerHTML = `
        <img src="/card/${energyCardFile}" alt="${energyCardFile}" />
        <span class="card-badge">エネ ×${energyNum}</span>
      `;
      div.addEventListener("click", () => {
        working.energyCount = Math.max(0, energyNum - 1);
        renderBuilder();
      });
      deckCardsContainer.appendChild(div);
    }
  }

  const deck = getSelectedDeck();
  if (!deck) return;
  const working = getWorking(deck);

  deckSelect.onchange = () => {
    builderSelectedDeckId = deckSelect.value;
    renderBuilder();
  };

  renderPool(deck, working, poolContainer);
  renderDeckCards(deck, working);
}

// 作業コピーを保存して実デッキに反映
function saveBuilderChanges() {
  const deckSelect = document.getElementById("builder-deck-select");
  if (!deckSelect || decks.length === 0) return;
  const deckId = deckSelect.value;
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;
  const working = builderWorking[deck.id];
  if (!working) return;

  deck.cards = [...working.cards];
  deck.energyCount = working.energyCount || 0;

  saveState();
  renderDeckList();
  renderSwitcher();
  renderBuilder();

  const toast = document.getElementById("builder-save-toast");
  if (toast) {
    toast.classList.remove("hidden");
    clearTimeout(window.__saveToastTimer);
    window.__saveToastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 5000);
  }
}

// ----- デッキ入れ替えビュー -----
function renderSwitcher() {
  const fromSelect = document.getElementById("from-deck-select");
  const toSelect = document.getElementById("to-deck-select");
  const removeContainer = document.getElementById("switch-remove-cards");
  const addContainer = document.getElementById("switch-add-cards");

  fromSelect.innerHTML = "";
  toSelect.innerHTML = "";
  if (removeContainer) removeContainer.innerHTML = "";
  if (addContainer) addContainer.innerHTML = "";

  if (decks.length < 2) {
    if (removeContainer)
      removeContainer.innerHTML =
        '<p class="hint">2 つ以上のデッキが必要です。</p>';
    return;
  }

  const activeDecks = decks.filter((d) => activeDeckIds.includes(d.id));

  if (activeDecks.length === 0) {
    if (removeContainer)
      removeContainer.innerHTML =
        '<p class="hint">アクティブデッキがありません。デッキ一覧からアクティブデッキを設定してください。</p>';
  }

  activeDecks.forEach((d, index) => {
    const opt1 = document.createElement("option");
    opt1.value = d.id;
    opt1.textContent = d.name;
    if (index === 0) opt1.selected = true;
    fromSelect.appendChild(opt1);
  });

  decks.forEach((d) => {
    const opt2 = document.createElement("option");
    opt2.value = d.id;
    opt2.textContent = d.name;
    toSelect.appendChild(opt2);
  });

  const btn = document.getElementById("calc-switch-btn");
  const applyBtn = document.getElementById("apply-switch-btn");
  const switchToast = document.getElementById("switcher-toast");

  btn.onclick = () => {
    const fromDeck = decks.find((d) => d.id === fromSelect.value);
    const toDeck = decks.find((d) => d.id === toSelect.value);
    if (!fromDeck || !toDeck || fromDeck.id === toDeck.id) return;

    const fromNonEnergy = fromDeck.cards.filter(
      (file) => file !== energyCardFile
    );
    const toNonEnergy = toDeck.cards.filter((file) => file !== energyCardFile);

    const fromEnergy = getEnergyCount(fromDeck);
    const toEnergy = getEnergyCount(toDeck);
    const needAddEnergy = Math.max(0, toEnergy - fromEnergy);
    const needRemoveEnergy = Math.max(0, fromEnergy - toEnergy);

    const toRemove = fromNonEnergy.filter(
      (file) => !toNonEnergy.includes(file)
    );
    const toAdd = toNonEnergy.filter((file) => !fromNonEnergy.includes(file));

    if (removeContainer) removeContainer.innerHTML = "";
    if (addContainer) addContainer.innerHTML = "";

    if (
      (!toRemove || toRemove.length === 0) &&
      (!toAdd || toAdd.length === 0) &&
      needAddEnergy === 0 &&
      needRemoveEnergy === 0
    ) {
      if (removeContainer)
        removeContainer.innerHTML =
          '<p class="hint">解体デッキのカードだけで組み替え可能です。(エネルギーは除く)</p>';
      return;
    }

    if (removeContainer) {
      if (needRemoveEnergy > 0) {
        const div = document.createElement("div");
        div.className = "card selected";
        div.innerHTML = `
          <img src="/card/${energyCardFile}" alt="${energyCardFile}" />
          <span class="card-badge">エネ ×${needRemoveEnergy}</span>
        `;
        removeContainer.appendChild(div);
      }
      toRemove.forEach((file) => {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<img src="/card/${file}" alt="${file}" />`;
        removeContainer.appendChild(div);
      });
    }

    if (addContainer) {
      if (needAddEnergy > 0) {
        const div = document.createElement("div");
        div.className = "card selected";
        div.innerHTML = `
          <img src="/card/${energyCardFile}" alt="${energyCardFile}" />
          <span class="card-badge">エネ ×${needAddEnergy}</span>
        `;
        addContainer.appendChild(div);
      }
      toAdd.forEach((file) => {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<img src="/card/${file}" alt="${file}" />`;
        addContainer.appendChild(div);
      });
    }
  };

  if (applyBtn) {
    applyBtn.onclick = () => {
      const fromId = fromSelect.value;
      const toId = toSelect.value;
      if (!fromId || !toId || fromId === toId) return;

      const fromIdx = activeDeckIds.indexOf(fromId);
      if (fromIdx !== -1) activeDeckIds.splice(fromIdx, 1);
      if (!activeDeckIds.includes(toId)) activeDeckIds.push(toId);

      saveState();
      renderDeckList();
      renderSwitcher();

      if (switchToast) {
        switchToast.classList.remove("hidden");
        setTimeout(() => {
          switchToast.classList.add("hidden");
        }, 5000);
      }
    };
  }
}

// ----- 初期化 -----
window.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await loadCards();
  setupNavigation();
  setupDeckModal();
  setupDeckViewer();
  renderDeckList();
  renderBuilder();
  renderSwitcher();

  // Ctrl+S でデッキ作成ビューの変更を保存
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      const builderView = document.getElementById("view-builder");
      if (builderView && builderView.classList.contains("active")) {
        saveBuilderChanges();
      }
    }
  });

  const builderSaveBtn = document.getElementById("builder-save-btn");
  if (builderSaveBtn) {
    builderSaveBtn.addEventListener("click", () => {
      saveBuilderChanges();
    });
  }

  // カードプール オーバーレイ
  const poolBtn = document.getElementById("pool-overlay-btn");
  const poolModal = document.getElementById("pool-modal");
  const poolGrid = document.getElementById("pool-modal-grid");
  const poolClose = document.getElementById("pool-modal-close");

  function refreshPoolOverlayContent() {
    const src = document.getElementById("card-pool-list");
    if (src && !poolModal.classList.contains("hidden")) {
      poolGrid.innerHTML = src.innerHTML;
    }
  }

  function buildPoolModalFilter() {
    const wrap = document.getElementById("pool-modal-filter-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const subcategoriesMap = buildSubcategoriesMap();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "filter-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const dropdown = document.createElement("div");
    dropdown.className = "filter-dropdown hidden";
    dropdown.setAttribute("role", "listbox");
    const submenuPanel = document.createElement("div");
    submenuPanel.className = "filter-submenu-panel hidden";

    const setFilter = (value) => {
      currentFilter = value;
      const label =
        value === "all"
          ? "すべて"
          : value.includes("/")
            ? value.replace("/", " › ")
            : value;
      trigger.textContent = label;
      dropdown.classList.add("hidden");
      submenuPanel.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
      renderBuilder();
      refreshPoolOverlayContent();
    };

    let submenuHideTimer = null;
    const showSubmenu = (cat, rowEl) => {
      const subs = subcategoriesMap[cat] || [];
      if (subs.length === 0) return;
      if (submenuHideTimer) clearTimeout(submenuHideTimer);
      submenuHideTimer = null;
      submenuPanel.innerHTML = "";
      subs.forEach((sub) => {
        const val = cat + "/" + sub;
        const subBtn = document.createElement("button");
        subBtn.type = "button";
        subBtn.className = "filter-option" + (currentFilter === val ? " active" : "");
        subBtn.textContent = sub;
        subBtn.addEventListener("click", () => setFilter(val));
        submenuPanel.appendChild(subBtn);
      });
      const dr = dropdown.getBoundingClientRect();
      const rr = rowEl.getBoundingClientRect();
      submenuPanel.style.left = dr.right + 8 + "px";
      submenuPanel.style.top = rr.top + "px";
      submenuPanel.classList.remove("hidden");
    };
    const hideSubmenu = (delay = 0) => {
      if (delay) {
        submenuHideTimer = setTimeout(() => {
          submenuHideTimer = null;
          submenuPanel.classList.add("hidden");
        }, delay);
      } else {
        if (submenuHideTimer) clearTimeout(submenuHideTimer);
        submenuHideTimer = null;
        submenuPanel.classList.add("hidden");
      }
    };

    trigger.textContent =
      currentFilter === "all"
        ? "すべて"
        : currentFilter.includes("/")
          ? currentFilter.replace("/", " › ")
          : currentFilter;
    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    wrap.appendChild(submenuPanel);

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "filter-option" + (currentFilter === "all" ? " active" : "");
    allBtn.textContent = "すべて";
    allBtn.addEventListener("click", () => setFilter("all"));
    dropdown.appendChild(allBtn);

    cardCategories.forEach((cat) => {
      const subs = subcategoriesMap[cat] || [];
      const row = document.createElement("div");
      row.className = "filter-row";
      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className =
        "filter-option" +
        (currentFilter === cat ? " active" : "") +
        (subs.length ? " has-sub" : "");
      mainBtn.textContent = cat;
      mainBtn.addEventListener("click", () => setFilter(cat));
      row.appendChild(mainBtn);
      if (subs.length) {
        row.addEventListener("mouseenter", () => showSubmenu(cat, row));
        row.addEventListener("mouseleave", () => hideSubmenu(200));
      }
      dropdown.appendChild(row);
    });

    submenuPanel.addEventListener("mouseenter", () => {
      if (submenuHideTimer) clearTimeout(submenuHideTimer);
      submenuHideTimer = null;
    });
    submenuPanel.addEventListener("mouseleave", () => hideSubmenu(0));

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dropdown.classList.contains("hidden");
      dropdown.classList.toggle("hidden", open);
      if (open) {
        const tr = trigger.getBoundingClientRect();
        dropdown.style.left = tr.left + "px";
        dropdown.style.top = tr.bottom + 4 + "px";
      } else {
        submenuPanel.classList.add("hidden");
      }
      trigger.setAttribute("aria-expanded", String(!open));
    });
    if (!window._poolModalFilterClickAttached) {
      window._poolModalFilterClickAttached = true;
      document.addEventListener("click", (e) => {
        const w = document.getElementById("pool-modal-filter-wrap");
        const sub = w?.querySelector(".filter-submenu-panel");
        if (!w || !poolModal || poolModal.classList.contains("hidden")) return;
        if (w.contains(e.target) || (sub && sub.contains(e.target))) return;
        w.querySelector(".filter-dropdown")?.classList.add("hidden");
        sub?.classList.add("hidden");
        w.querySelector(".filter-trigger")?.setAttribute("aria-expanded", "false");
      });
    }
  }

  function openPoolModal() {
    const src = document.getElementById("card-pool-list");
    if (!src) return;
    buildPoolModalFilter();
    poolGrid.innerHTML = src.innerHTML;
    poolModal.classList.remove("hidden");
    document.body.classList.add("pool-modal-open");
  }

  function closePoolModal() {
    poolModal.classList.add("hidden");
    document.body.classList.remove("pool-modal-open");
  }

  function handlePoolOverlayClick(e) {
    if (e.target.closest("button")) return;
    const card = e.target.closest(".card");
    if (!card) return;
    let path = card.dataset.path;
    if (!path) {
      const img = card.querySelector("img");
      if (!img) return;
      const src = img.getAttribute("src") || img.src || "";
      path = src.replace(/^.*\/card\//, "").split("?")[0].trim();
    }
    if (!path) return;
    const deckSelect = document.getElementById("builder-deck-select");
    if (!deckSelect) return;
    const deck = decks.find((d) => d.id === deckSelect.value);
    if (!deck) return;
    const working = builderWorking[deck.id];
    if (!working) return;
    toggleCardInWorking(working, path);
    refreshPoolOverlayContent();
  }

  poolGrid.addEventListener("click", handlePoolOverlayClick);
  poolGrid.addEventListener("touchend", (e) => {
    if (e.target.closest(".card")) {
      e.preventDefault();
      handlePoolOverlayClick(e);
    }
  }, { passive: false });

  if (poolBtn && poolModal && poolGrid && poolClose) {
    poolBtn.addEventListener("click", () => {
      if (window.innerWidth <= 1050) {
        openPoolModal();
      }
    });
    poolClose.addEventListener("click", closePoolModal);
    poolModal.addEventListener("click", (e) => {
      if (e.target === poolModal) closePoolModal();
    });
  }
});

