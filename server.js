const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// プロジェクトルート
const ROOT_DIR = __dirname;
// カード画像フォルダ (ユーザーにここへ画像を置いてもらう)
const CARD_DIR = path.join(ROOT_DIR, "card");

// JSON ボディ
app.use(express.json());

// デッキ状態保存用（SQLite or インメモリ）
const DB_PATH = path.join(ROOT_DIR, "deck_state.sqlite3");
let db = null;
let inMemoryState = {
  decks: [],
  activeDeckIds: []
};

async function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("SQLite データベースのオープンに失敗しました:", err);
        db = null;
        console.warn("デッキ状態はインメモリで保持されます。");
        return resolve();
      }
      db.run(
        `
          CREATE TABLE IF NOT EXISTS deck_state (
            id INTEGER PRIMARY KEY,
            state TEXT NOT NULL
          )
        `,
        (err2) => {
          if (err2) {
            console.error("deck_state テーブルの作成に失敗しました:", err2);
            db = null;
            console.warn("デッキ状態はインメモリで保持されます。");
          }
          resolve();
        }
      );
    });
  });
}

async function readState() {
  if (!db) {
    return inMemoryState;
  }
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT state FROM deck_state WHERE id = 1",
      [],
      (err, row) => {
        if (err) {
          console.error("デッキ状態の取得に失敗しました:", err);
          return reject(err);
        }
        if (!row || !row.state) {
          return resolve({ decks: [], activeDeckIds: [] });
        }
        try {
          const parsed = JSON.parse(row.state);
          resolve({
            decks: Array.isArray(parsed.decks) ? parsed.decks : [],
            activeDeckIds: Array.isArray(parsed.activeDeckIds)
              ? parsed.activeDeckIds
              : []
          });
        } catch (e) {
          console.error("デッキ状態JSONのパースに失敗しました:", e);
          resolve({ decks: [], activeDeckIds: [] });
        }
      }
    );
  });
}

async function writeState(newState) {
  const safeState = {
    decks: Array.isArray(newState.decks) ? newState.decks : [],
    activeDeckIds: Array.isArray(newState.activeDeckIds)
      ? newState.activeDeckIds
      : []
  };

  if (!db) {
    inMemoryState = safeState;
    return;
  }

  const json = JSON.stringify(safeState);
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT OR REPLACE INTO deck_state (id, state) VALUES (1, ?)",
      [json],
      (err) => {
        if (err) {
          console.error("デッキ状態の保存に失敗しました:", err);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

// デッキ状態 API
app.get("/api/state", async (req, res) => {
  try {
    const state = await readState();
    res.json(state);
  } catch (err) {
    console.error("デッキ状態の取得に失敗しました:", err);
    res.status(500).json({ error: "failed_to_load_state" });
  }
});

app.post("/api/state", async (req, res) => {
  try {
    const { decks, activeDeckIds } = req.body || {};
    await writeState({ decks, activeDeckIds });
    res.json({ ok: true });
  } catch (err) {
    console.error("デッキ状態の保存に失敗しました:", err);
    res.status(500).json({ error: "failed_to_save_state" });
  }
});

// 静的ファイル: フロントエンド
app.use(express.static(path.join(ROOT_DIR, "public")));
// 静的ファイル: カード画像 (例: /card/pikachu.png)
app.use("/card", express.static(CARD_DIR));

// カード一覧 API
app.get("/api/cards", (req, res) => {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

  const cards = [];
  let energyCardPath = null;

  function walk(dir, category) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.error("カードフォルダの読み込みに失敗しました:", err);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // card/pokemon, card/items ... のようなサブフォルダをカテゴリとして扱う
        const subCategory = category || entry.name;
        walk(fullPath, subCategory);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!imageExtensions.includes(ext)) continue;

        const relPath = path.relative(CARD_DIR, fullPath).replace(/\\/g, "/");
        const base = path.basename(entry.name);
        // どのサブフォルダでもファイル名が psychic_energy.png なら基本エネルギーとする
        if (base === "psychic_energy.png" && !energyCardPath) {
          energyCardPath = relPath;
        }
        cards.push({
          path: relPath,
          category: category || "other"
        });
      }
    }
  }

  walk(CARD_DIR, null);

  const categories = Array.from(
    new Set(cards.map((c) => c.category))
  ).sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });

  res.json({
    cards,
    energyCard: energyCardPath || "psychic_energy.png",
    categories
  });
});

// ルートは index.html を返す
app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `GLC Card Deck Manager running on http://localhost:${PORT}`
      );
      console.log(
        "カード画像は ./card フォルダから読み込まれます。"
      );
      if (db) {
        console.log("デッキ状態は SQLite ファイルに保存されます。");
      } else {
        console.log(
          "SQLite が使用できないため、デッキ状態はインメモリに保存されます。"
        );
      }
    });
  })
  .catch((err) => {
    console.error("サーバー初期化中にエラーが発生しました:", err);
    process.exit(1);
  });

