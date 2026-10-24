"use client";

import { Heart } from "lucide-react";
import { useSaved } from "./saved";

export function SaveButton({ slug }: { slug: string }) {
  const { isSaved, toggle } = useSaved();
  const on = isSaved(slug);
  return (
    <button type="button" className="btn save-btn" aria-pressed={on} onClick={() => toggle(slug)}>
      <Heart size={18} fill={on ? "currentColor" : "none"} aria-hidden />
      {on ? "Saved" : "Save deal"}
    </button>
  );
}
