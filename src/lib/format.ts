/** 日付・文字列フォーマットユーティリティ */

/** 生年月日から現在の年齢を計算する */
export function calcAge(birthDate: Date): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** 日本語の日付表示（例: 2026年4月4日）*/
export function formatDateJa(date: Date | string): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 日本語の日時表示（例: 2026年4月4日 10:00）*/
export function formatDateTimeJa(date: Date | string): string {
  return new Date(date).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** UUID 末尾6文字を大文字で患者IDとして返す（例: #A3F9C1）*/
export function formatPatientId(uuid: string): string {
  return `#${uuid.slice(-6).toUpperCase()}`;
}

/** 名前の最初の1文字（アバター用）*/
export function getInitial(name: string): string {
  return name.charAt(0);
}
