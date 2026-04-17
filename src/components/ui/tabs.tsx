"use client";

/**
 * シンプルな Tabs プリミティブ（Radix 不使用）
 *
 * shadcn/ui の Tabs API と互換性のあるインターフェースを提供する。
 * value / onValueChange で制御されたタブとして動作する。
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Context ──────────────────────────────────────────────────────────────────

type TabsContextValue = {
  value:         string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs コンポーネントの外で使用されています");
  return ctx;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type TabsProps = {
  value:          string;
  onValueChange:  (value: string) => void;
  className?:     string;
  children:       React.ReactNode;
};

function Tabs({ value, onValueChange, className, children }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("flex gap-6 items-start", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ── TabsList ─────────────────────────────────────────────────────────────────

type TabsListProps = {
  className?: string;
  children:   React.ReactNode;
};

function TabsList({ className, children }: TabsListProps) {
  return (
    <div role="tablist" className={cn("flex flex-col", className)}>
      {children}
    </div>
  );
}

// ── TabsTrigger ───────────────────────────────────────────────────────────────

type TabsTriggerProps = {
  value:      string;
  className?: string;
  children:   React.ReactNode;
};

function TabsTrigger({ value, className, children }: TabsTriggerProps) {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => onValueChange(value)}
      className={cn("text-left", className)}
    >
      {children}
    </button>
  );
}

// ── TabsContent ───────────────────────────────────────────────────────────────

type TabsContentProps = {
  value:      string;
  className?: string;
  children:   React.ReactNode;
};

function TabsContent({ value, className, children }: TabsContentProps) {
  const { value: activeValue } = useTabsContext();
  if (activeValue !== value) return null;

  return (
    <div role="tabpanel" className={cn("flex-1 min-w-0", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
