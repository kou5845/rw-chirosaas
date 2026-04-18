"use client";

import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useRef } from "react";

type Props = {
  defaultValue?: string;
  placeholder?: string;
};

export function PatientSearchBar({
  defaultValue = "",
  placeholder = "患者名・ふりがな・IDで検索...",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (new FormData(e.currentTarget).get("q") as string).trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = "";
    router.push(pathname);
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      {/* 検索アイコン */}
      <Search
        size={16}
        className="pointer-events-none absolute left-3 text-gray-400"
      />

      {/* 入力フィールド */}
      <input
        ref={inputRef}
        name="q"
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-72 rounded-xl border border-gray-200 bg-white pl-9 pr-10 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
      />

      {/* クリアボタン（入力中のみ表示） */}
      {defaultValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-10 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
          aria-label="検索をクリア"
        >
          <X size={12} />
        </button>
      )}

      {/* 検索ボタン */}
      <button
        type="submit"
        className="ml-2 flex h-10 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--brand-medium)] active:scale-95"
      >
        検索
      </button>
    </form>
  );
}
