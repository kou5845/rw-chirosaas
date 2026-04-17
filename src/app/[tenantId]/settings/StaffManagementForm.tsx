"use client";

import { useTransition, useState, useEffect } from "react";
import { toast } from "sonner";
import { UserPlus, UserMinus, Edit2, Check, X, Loader2 } from "lucide-react";
import { addStaffAction, updateStaffAction, disableStaffAction } from "./staff-actions";

type Staff = {
  id: string;
  name: string;
  role: string | null;
};

type Props = {
  tenantId: string;
  staffs: Staff[];
};

export function StaffManagementForm({ tenantId, staffs }: Props) {
  const [isPending, startTransition] = useTransition();
  const [localStaffs, setLocalStaffs] = useState<Staff[]>(staffs);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  useEffect(() => {
    setLocalStaffs(staffs);
  }, [staffs]);

  const handleAdd = () => {
    if (!newName.trim()) {
      toast.error("名前を入力してください");
      return;
    }
    const formData = new FormData();
    formData.append("tenantId", tenantId);
    formData.append("name", newName);
    formData.append("role", newRole);

    startTransition(async () => {
      const res = await addStaffAction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("スタッフを追加しました");
        setNewName("");
        setNewRole("");
      }
    });
  };

  const handleStartEdit = (staff: Staff) => {
    setEditingId(staff.id);
    setEditName(staff.name);
    setEditRole(staff.role || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRole("");
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) {
      toast.error("名前を入力してください");
      return;
    }
    const formData = new FormData();
    formData.append("tenantId", tenantId);
    formData.append("id", id);
    formData.append("name", editName);
    formData.append("role", editRole);

    startTransition(async () => {
      const res = await updateStaffAction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("スタッフ情報を更新しました");
        setEditingId(null);
      }
    });
  };

  const handleDisable = (id: string) => {
    if (!confirm("このスタッフを削除（無効化）しますか？予約メニューの選択肢から消えますが、過去のデータは保持されます。")) return;

    const formData = new FormData();
    formData.append("tenantId", tenantId);
    formData.append("id", id);
    startTransition(async () => {
      const res = await disableStaffAction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("スタッフを削除しました");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 追加フォーム */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-gray-700">新規スタッフ追加</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-500">名前（必須）</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="例: 佐藤 健太"
              className="w-full rounded-lg border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              disabled={isPending}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-500">役職・肩書き（任意）</label>
            <input
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="例: 院長、理学療法士"
              className="w-full rounded-lg border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              disabled={isPending}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={isPending || !newName.trim()}
            className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                登録中…
              </>
            ) : (
              <>
                <UserPlus size={15} />
                登録する
              </>
            )}
          </button>
        </div>
      </div>

      {/* 一覧リスト */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">登録済みスタッフ ({localStaffs.length}名)</h3>
        {localStaffs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
            <p className="text-sm text-gray-500">スタッフが登録されていません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {localStaffs.map((staff) => (
              <div
                key={staff.id}
                className="group flex flex-col justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
              >
                {editingId === staff.id ? (
                  // 編集モード
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border-gray-300 px-2 py-1 text-sm sm:w-1/3"
                      placeholder="名前"
                      disabled={isPending}
                    />
                    <input
                      type="text"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full rounded-md border-gray-300 px-2 py-1 text-sm sm:w-1/3"
                      placeholder="役職"
                      disabled={isPending}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSaveEdit(staff.id)}
                        disabled={isPending || !editName.trim()}
                        className="rounded-md bg-green-50 p-1.5 text-green-600 hover:bg-green-100"
                        title="保存"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isPending}
                        className="rounded-md bg-gray-50 p-1.5 text-gray-500 hover:bg-gray-100"
                        title="キャンセル"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <>
                    <div className="flex flex-1 items-center gap-4">
                      {/* Name & Role */}
                      <div>
                        <div className="font-semibold text-gray-800">{staff.name}</div>
                        {staff.role && <div className="text-xs text-gray-500">{staff.role}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleStartEdit(staff)}
                        disabled={isPending}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Edit2 size={13} />
                        <span>編集</span>
                      </button>
                      <button
                        onClick={() => handleDisable(staff.id)}
                        disabled={isPending}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <UserMinus size={13} />
                        <span>削除</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
