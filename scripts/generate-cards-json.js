/**
 * card/ フォルダをスキャンし、GitHub Pages 用の cards.json をプロジェクトルートに生成します。
 * カード画像を追加・削除したあと、デプロイ前にこのスクリプトを実行してください。
 * 例: node scripts/generate-cards-json.js
 */
const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.join(__dirname, "..");
const CARD_DIR = path.join(ROOT_DIR, "card");
const OUT_PATH = path.join(ROOT_DIR, "cards.json");

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
      const subCategory = category || entry.name;
      walk(fullPath, subCategory);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const relPath = path.relative(CARD_DIR, fullPath).replace(/\\/g, "/");
      const base = path.basename(entry.name);
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

const categories = Array.from(new Set(cards.map((c) => c.category))).sort(
  (a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  }
);

const state = {
  cards,
  energyCard: energyCardPath || "psychic_energy.png",
  categories
};

fs.writeFileSync(OUT_PATH, JSON.stringify(state, null, 2), "utf8");
console.log("cards.json を生成しました:", OUT_PATH);
console.log("  - カード数:", cards.length);
console.log("  - カテゴリ:", categories.join(", "));
