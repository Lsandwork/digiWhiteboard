"use client";

import { ChevronDown } from "lucide-react";
import type { AdminBoardType } from "@/lib/admin/types";

type BoardSwitcherProps = {
  board: AdminBoardType;
  boards: AdminBoardType[];
  onChange: (board: AdminBoardType) => void;
};

const BOARD_LABELS: Record<AdminBoardType, string> = {
  lobby: "Lobby Whiteboard",
  staff: "Staff Digital Whiteboard",
  marketing: "Marketing"
};

export function BoardSwitcher({ board, boards, onChange }: BoardSwitcherProps) {
  const options = boards.map((value) => ({ value, label: BOARD_LABELS[value] }));

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Select board</span>
      <select
        value={board}
        onChange={(event) => onChange(event.target.value as AdminBoardType)}
        className="admin-select appearance-none pr-8"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-admin-muted" />
    </label>
  );
}
