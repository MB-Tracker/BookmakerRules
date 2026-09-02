/**
 * The four compatibility levels, and how they are drawn.
 *
 * The same four words and the same four colours are what MB-Tracker shows on a
 * search result, so a level added here without a counterpart over there would
 * render as an unstyled badge rather than as a new state.
 */
export const LEVELS = ["compatible", "partial", "incompatible", "additional_profit"];

export const LEVEL_LABEL = {
  compatible: "Compatible",
  partial: "Partial",
  incompatible: "Incompatible",
  additional_profit: "Additional profit",
};

export const LEVEL_CLASS = {
  compatible: "alert-success",
  partial: "alert-warning",
  incompatible: "alert-danger",
  additional_profit: "alert-purple",
};

export const LEVEL_HINT = {
  compatible: "Exactly one leg wins, whatever happens.",
  partial: "Depends on the bet — write cases below to say which way.",
  incompatible: "Both legs can lose.",
  additional_profit: "Both legs can win, and neither can lose extra.",
};
