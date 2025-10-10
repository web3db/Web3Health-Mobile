// src/components/marketplace/SortButton.tsx
import Button from "@/src/components/ui/Button";
import type { SortKey } from "@/src/store/useMarketStore";
import React from "react";

type Props = {
  sort: SortKey;            // 'newest' | 'reward'
  onToggle: () => void;
};

export default function SortButton({ sort, onToggle }: Props) {
  const label = sort === "reward" ? "Reward" : "Newest";
  return <Button title={`Sort: ${label}`} onPress={onToggle} variant="secondary" />;
}
