import { RECIPES, recipeById } from "@agentsean/launch";
import { emit, emitError } from "../output.js";

export async function recipesCommand(opts: {
  json: boolean;
  target?: string | undefined;
}): Promise<number> {
  if (opts.target) {
    const recipe = recipeById(opts.target);
    if (!recipe) {
      emitError(
        opts.json,
        { command: "recipes", error: "unknown_recipe", id: opts.target },
        `Unknown recipe ${opts.target}. Try sean recipes.`,
      );
      return 2;
    }
    emit(
      opts.json,
      { ok: true, command: "recipes", recipe },
      `${recipe.title}\n${recipe.summary}\n\n${recipe.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    );
    return 0;
  }
  emit(
    opts.json,
    {
      ok: true,
      command: "recipes",
      recipes: RECIPES.map((r) => ({ id: r.id, title: r.title, cms: r.cms })),
    },
    RECIPES.map((r) => `${r.id}\n  ${r.title}`).join("\n"),
  );
  return 0;
}
