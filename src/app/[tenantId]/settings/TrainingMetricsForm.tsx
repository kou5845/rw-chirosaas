"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, CheckCircle2, AlertCircle, Plus, GripVertical, Pencil, Trash2, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type MetricConfigItem, getMetricColor } from "@/lib/training-metrics";
import { updateTrainingMetrics } from "./training-metrics-action";

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  tenantId:   string;
  tenantSlug: string;
  initial:    MetricConfigItem[];
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-9 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-sm transition-all",
        pending
          ? "cursor-not-allowed bg-gray-200 text-gray-400"
          : "bg-[var(--brand)] text-white hover:bg-[var(--brand-medium)] active:scale-95",
      )}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          保存中...
        </>
      ) : (
        <><Save size={14} />保存</>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable ListItem
// ─────────────────────────────────────────────────────────────────────────────

function SortableMetricItem({
  item,
  index,
  onEdit,
  onDelete,
  onToggle
}: {
  item: MetricConfigItem;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (val: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const color = getMetricColor(item.id, index);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 py-3 px-2 transition-opacity group rounded-xl hover:bg-gray-50 border border-transparent",
        !item.enabled && "opacity-50"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500 p-1">
        <GripVertical size={16} />
      </div>
      
      <div className="h-8 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span className="truncate">{item.label}</span>
          {item.unit && <span className="shrink-0 text-xs font-normal text-gray-400">({item.unit})</span>}
        </p>
        <p className="text-[10px] text-gray-400">ID: {item.id}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-blue-500 rounded bg-transparent transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded bg-transparent transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 size={15} />
        </button>
        <div className="ml-1 pl-3 border-l border-gray-200">
          <Switch checked={item.enabled} onCheckedChange={onToggle} aria-label={`${item.label}の表示`} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────────────────────────────────────

export function TrainingMetricsForm({ tenantId, tenantSlug, initial }: Props) {
  const [config, setConfig] = useState<MetricConfigItem[]>(initial || []);
  const [state, formAction] = useActionState(updateTrainingMetrics, null);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Dialog State
  const [editItem, setEditItem] = useState<MetricConfigItem | Partial<MetricConfigItem> | null>(null);

  // Functions
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setConfig((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function handleToggle(id: string, val: boolean) {
    setConfig(prev => prev.map(m => m.id === id ? { ...m, enabled: val } : m));
  }

  function handleDelete(id: string) {
    if (confirm("本当に削除してもよろしいですか？（すでに保存されたデータがある場合、グラフ描画等に影響する可能性があります）")) {
      setConfig(prev => prev.filter(m => m.id !== id));
    }
  }

  function saveEdit() {
    if (!editItem?.label || !editItem?.id) {
      alert("必須項目が入力されていません");
      return;
    }
    const isNew = !config.some(m => m.id === editItem.id);
    
    if (isNew) {
      setConfig(prev => [...prev, editItem as MetricConfigItem]);
    } else {
      setConfig(prev => prev.map(m => m.id === editItem.id ? editItem as MetricConfigItem : m));
    }
    setEditItem(null);
  }

  const enabledCount = config.filter(m => m.enabled).length;

  return (
    <div className="relative">
      <form action={formAction} className="px-6 py-5 space-y-5">
        {/* hidden */}
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="configJson" value={JSON.stringify(config)} />

        {/* ヘッダー */}
        <div className="flex items-start justify-between">
          <p className="text-xs leading-relaxed text-gray-500">
            トレーニングカルテの入力欄・患者マイページのグラフに表示する体組成指標を選択してください。
            ドラッグ＆ドロップで表示順を変更できます。
            <span className="ml-1 font-semibold text-[var(--brand-dark)] text-nowrap">{enabledCount} / {config.length} 項目 ON</span>
          </p>
          <button
            type="button"
            onClick={() => setEditItem({ id: `custom-${Date.now()}`, label: "", unit: "", enabled: true })}
            className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-[var(--brand-dark)] bg-[var(--brand-bg)] hover:bg-[var(--brand-hover)] px-3 py-1.5 rounded-lg transition-colors ml-4"
          >
            <Plus size={14} /> 新規追加
          </button>
        </div>

        {/* リスト (DnD) */}
        <div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={config.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl p-1 bg-white shadow-sm">
                {config.map((item, index) => (
                  <SortableMetricItem
                    key={item.id}
                    item={item}
                    index={index}
                    onToggle={(val) => handleToggle(item.id, val)}
                    onEdit={() => setEditItem({ ...item })}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
                {config.length === 0 && (
                  <div className="text-center py-6 text-sm text-gray-400">表示する指標がありません</div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* フォームフッター */}
        <div className="flex items-center justify-between pt-1">
          <div className="h-6">
            {state?.success && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 size={13} />
                保存しました
              </span>
            )}
            {state?.error && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
                <AlertCircle size={13} />
                {state.error}
              </span>
            )}
          </div>
          <SaveButton />
        </div>
      </form>

      {/* 編集ダイアログ(簡易オーバーレイ) */}
      {editItem && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm rounded-3xl" onClick={() => setEditItem(null)} />
          
          {/* Modal */}
          <div className="relative w-full max-w-sm bg-white border border-gray-200 shadow-xl rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center justify-between">
              指標の編集
              <button type="button" onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">ID (変更非推奨)*</label>
                <input
                  type="text"
                  value={editItem.id}
                  disabled={config.some(m => m.id === editItem.id)} // 既存なら変更不可に
                  onChange={e => setEditItem({ ...editItem, id: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-[var(--brand)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">ラベル名*</label>
                <input
                  type="text"
                  value={editItem.label}
                  onChange={e => setEditItem({ ...editItem, label: e.target.value })}
                  placeholder="例: 体重"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[var(--brand)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">単位</label>
                <input
                  type="text"
                  value={editItem.unit}
                  onChange={e => setEditItem({ ...editItem, unit: e.target.value })}
                  placeholder="例: kg (なしでも可)"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[var(--brand)] outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button type="button" onClick={() => setEditItem(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  キャンセル
                </button>
                <button type="button" onClick={saveEdit} className="px-5 py-2 text-sm font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-medium)] rounded-xl transition-colors">
                  追加・更新
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
