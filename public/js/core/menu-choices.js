export const choicesFor = product => Array.isArray(product?.choices) ? product.choices : [];

export function choiceLabel(choice) {
  if (choice.kind === "remove") return `No ${choice.name}`;
  if (choice.kind === "select") return `${choice.group}: ${choice.name}`;
  return `Extra ${choice.name}`;
}

export function selectedChoices(product, ids) {
  const all = choicesFor(product);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error("Choose each option once.");
  const selected = ids.map(id => all.find(choice => choice.id === id));
  if (selected.some(choice => !choice || choice.available === false)) throw new Error("One of your choices is unavailable.");
  const groups = selected.filter(choice => choice.kind === "select").map(choice => String(choice.group || "").trim().toLowerCase());
  if (groups.some(group => !group) || new Set(groups).size !== groups.length) throw new Error("Choose only one per preference group.");
  if (selected.some(choice => !["add", "remove", "select"].includes(choice.kind) || !Number.isInteger(choice.price) || choice.price < 0 || (choice.kind === "remove" && choice.price !== 0))) throw new Error("An option has an invalid price.");
  return selected;
}

export function sameChoice(a, b) {
  return a.id === b.id && a.name === b.name && a.kind === b.kind && (a.group || "") === (b.group || "") && a.price === b.price && b.available !== false;
}
