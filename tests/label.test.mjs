import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLabel, ingredientsOf } from "../lib/label.js";

test("front label: big brand + product name", () => {
  const lines = [
    { text: "CeraVe", height: 60 },
    { text: "DEVELOPED WITH DERMATOLOGISTS", height: 12 },
    { text: "Moisturising", height: 34 },
    { text: "Lotion", height: 34 },
    { text: "For dry to very dry skin", height: 14 },
    { text: "473 ml", height: 20 },
  ];
  const r = parseLabel(lines);
  assert.equal(r.brand, "CeraVe");
  assert.equal(r.name, "Moisturising Lotion");
});

test("back label: ingredients, expiry and PAO", () => {
  const text = "How to use: apply daily\nIngredients: Aqua, Niacinamide, Glycerin,\nZinc PCA, Panthenol.\n\nEXP 08/2027 12M Made in Korea";
  const r = parseLabel([{ text: "Ingredients: Aqua", height: 10 }], text);
  assert.equal(r.ingredients, "Aqua, Niacinamide, Glycerin, Zinc PCA, Panthenol.");
  assert.equal(r.expires_on, "2027-08-31");
  assert.equal(r.pao_months, 12);
});

test("Thai heading", () => {
  assert.match(ingredientsOf("ส่วนประกอบ: Water, Centella Asiatica Extract, Madecassoside"), /^Water, Centella/);
});

test("ingredient lines never become the name", () => {
  const lines = [
    { text: "DEVELOPED WITH DERMATOLOGISTS", height: 10 },
    { text: "INGREDIENTS: AQUA, GLYCERIN, CETEARYL ALCOHOL", height: 12 },
    { text: "HYALURONATE, CITRIC ACID, PHENOXYETHANOL", height: 11 },
  ];
  assert.ok(!/citric/i.test(parseLabel(lines).name));
});
