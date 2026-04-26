/**
 * 予約メール テンプレート
 *
 * - type="reception"    → 受付完了メール（予約作成直後）
 * - type="confirmation" → 確定通知メール（スタッフ承認後）
 * - type="reminder"     → 24時間前リマインダーメール
 * - type="update"       → 予約日時変更通知メール
 * - type="cancel"       → 予約キャンセル通知メール
 * - type="rejection"    → 予約お断り通知メール（院都合）
 *
 * Resend の `react` パラメータへそのまま渡せる React コンポーネント。
 * メールクライアントの互換性のため、スタイルはすべてインライン記述。
 */

const BRAND  = "#2E9BB8";
const ACCENT = "#1D7A94";
const BG     = "#F0FAFB";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function fmtDateJP(d: Date): string {
  // UTC を JST (+ 9h) に変換して表示
  const jst  = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m    = jst.getUTCMonth() + 1;
  const day  = jst.getUTCDate();
  const dow  = jst.getUTCDay();
  return `${m}月${day}日（${WEEKDAYS[dow]}）`;
}

function fmtTimeJP(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh  = String(jst.getUTCHours()).padStart(2, "0");
  const mm  = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type ReservationEmailProps = {
  type:          "reception" | "confirmation" | "reminder" | "update" | "cancel" | "rejection";
  tenantName:    string;
  patientName:   string;
  menuName:      string;
  durationMin:   number;
  price:         number;
  startAt:       Date;
  endAt:         Date;
  phone?:        string | null;
  address?:      string | null;
  /** email.ts 側で生成した Static Maps 画像URL（未設定時は非表示） */
  staticMapUrl?: string | null;
  /** type="update" 時の変更前日時 */
  oldStartAt?:   Date | null;
  oldEndAt?:     Date | null;
  /** 患者専用マイページURL（confirmation / reminder 時にメール末尾に表示） */
  mypageUrl?:       string | null;
  /** プロプラン限定: 医院が設定するカスタムメッセージ（cancel / rejection / update 以外で表示） */
  customMessage?:   string | null;
  /** LINE 友だち追加URL（設定時はメール末尾に友だち追加CTAを表示） */
  lineFriendUrl?:   string | null;
};

export function ReservationEmail({
  type,
  tenantName,
  patientName,
  menuName,
  durationMin,
  price,
  startAt,
  endAt,
  phone,
  address,
  staticMapUrl,
  oldStartAt,
  oldEndAt,
  mypageUrl,
  customMessage,
  lineFriendUrl,
}: ReservationEmailProps) {
  const isConfirmation = type === "confirmation";
  const isReminder     = type === "reminder";
  const isUpdate       = type === "update";
  const isCancel       = type === "cancel";
  const isRejection    = type === "rejection";

  const headline =
    isUpdate     ? "ご予約日時が変更されました" :
    isCancel     ? "ご予約がキャンセルされました" :
    isRejection  ? "ご予約をお受けできませんでした" :
    isReminder   ? "明日のご予約リマインダー" :
    isConfirmation ? "ご予約が確定しました" : "ご予約を受け付けました";

  const subText =
    isUpdate     ? "以下のとおり予約日時が変更されました。ご確認ください。" :
    isCancel     ? "以下のご予約がキャンセルされました。またのご利用をお待ちしております。" :
    isRejection  ? "誠に申し訳ございませんが、以下のご予約をお受けすることができませんでした。" :
    isReminder   ? "明日のご予約のお時間が近づいてまいりました。ご来院をお待ちしております。" :
    isConfirmation ? "以下の内容でご予約が確定しました。ご来院をお待ちしております。" :
    "以下の内容でご予約を受け付けました。スタッフ確認後、確定のご連絡をお送りします。";

  const dateLabel   = fmtDateJP(startAt);
  const timeLabel   = `${fmtTimeJP(startAt)} 〜 ${fmtTimeJP(endAt)}`;
  const mapsLinkUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{headline}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f5f5f5", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#f5f5f5", padding: "32px 16px" }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: 560, backgroundColor: "#ffffff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

                  {/* ── ヘッダー ── */}
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: BRAND, padding: "28px 32px", textAlign: "center" }}>
                        <p style={{ margin: 0, color: "#ffffff", fontSize: 20, fontWeight: "bold", letterSpacing: 1 }}>
                          {tenantName}
                        </p>
                        <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
                          オンライン予約システム
                        </p>
                      </td>
                    </tr>

                    {/* ── ステータスバナー ── */}
                    <tr>
                      <td style={{
                        backgroundColor: isUpdate ? "#EFF6FF" : (isCancel || isRejection) ? "#FEF2F2" : isReminder ? "#FFFBEB" : isConfirmation ? "#ECFDF5" : BG,
                        padding: "20px 32px",
                        textAlign: "center",
                        borderBottom: `1px solid ${isUpdate ? "#BFDBFE" : (isCancel || isRejection) ? "#FECACA" : isReminder ? "#FDE68A" : isConfirmation ? "#A7F3D0" : "#B2E4EF"}`,
                      }}>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: "bold", color: isUpdate ? "#1D4ED8" : (isCancel || isRejection) ? "#B91C1C" : isReminder ? "#92400E" : isConfirmation ? "#065F46" : ACCENT }}>
                          {headline}
                        </p>
                        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                          {subText}
                        </p>
                      </td>
                    </tr>

                    {/* ── 宛名 ── */}
                    <tr>
                      <td style={{ padding: "24px 32px 0" }}>
                        <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                          <span style={{ fontWeight: "bold" }}>{patientName}</span> 様
                        </p>
                      </td>
                    </tr>

                    {/* ── 医院カスタムメッセージ（プロプラン・cancel 以外）── */}
                    {customMessage && !isCancel && (
                      <tr>
                        <td style={{ padding: "16px 32px 0" }}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#FFFDF5", borderRadius: 10, border: "1px solid #FDE68A", overflow: "hidden" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "16px 20px" }}>
                                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: "bold", color: "#92400E", textTransform: "uppercase", letterSpacing: 1 }}>
                                    ✉ {tenantName} からのご案内
                                  </p>
                                  <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
                                    {customMessage.split("\n").map((line, i, arr) => (
                                      <span key={i}>
                                        {line}
                                        {i < arr.length - 1 && <br />}
                                      </span>
                                    ))}
                                  </p>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── 予約詳細 ── */}
                    <tr>
                      <td style={{ padding: "20px 32px" }}>
                        {/* update: 変更前 → 変更後を並べて表示 */}
                        {isUpdate && oldStartAt && oldEndAt ? (
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#EFF6FF", borderRadius: 12, border: "1px solid #BFDBFE", overflow: "hidden" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "12px 20px 8px", borderBottom: "1px solid #BFDBFE" }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: "bold", color: "#1D4ED8", textTransform: "uppercase", letterSpacing: 1 }}>
                                    変更前 → 変更後
                                  </p>
                                </td>
                              </tr>
                              {[
                                { label: "変更前", value: `${fmtDateJP(oldStartAt)} ${fmtTimeJP(oldStartAt)}〜${fmtTimeJP(oldEndAt)}`, muted: true },
                                { label: "変更後", value: `${fmtDateJP(startAt)} ${fmtTimeJP(startAt)}〜${fmtTimeJP(endAt)}`, muted: false },
                                { label: "💆 メニュー", value: `${menuName}（${durationMin}分）`, muted: false },
                              ].map((row, i, arr) => (
                                <tr key={row.label}>
                                  <td style={{ padding: "12px 20px", borderBottom: i < arr.length - 1 ? "1px solid #BFDBFE" : "none" }}>
                                    <table width="100%" cellPadding={0} cellSpacing={0}>
                                      <tbody>
                                        <tr>
                                          <td style={{ width: "30%", fontSize: 12, color: "#6B7280", verticalAlign: "top" }}>{row.label}</td>
                                          <td style={{ fontSize: 13, fontWeight: row.muted ? "normal" : "bold", color: row.muted ? "#9CA3AF" : "#111827", textDecoration: row.muted ? "line-through" : "none", verticalAlign: "top" }}>{row.value}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: (isCancel || isRejection) ? "#FEF2F2" : BG, borderRadius: 12, border: `1px solid ${(isCancel || isRejection) ? "#FECACA" : "#B2E4EF"}`, overflow: "hidden" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "16px 20px 8px", borderBottom: `1px solid ${(isCancel || isRejection) ? "#FECACA" : "#D1EEF5"}` }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: "bold", color: (isCancel || isRejection) ? "#B91C1C" : ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
                                    {isRejection ? "お断りした予約" : isCancel ? "キャンセルされた予約" : "予約内容"}
                                  </p>
                                </td>
                              </tr>
                              {[
                                { label: "📅 日付", value: dateLabel },
                                { label: "⏰ 時間", value: timeLabel },
                                { label: "💆 メニュー", value: `${menuName}（${durationMin}分）` },
                                ...(!isCancel ? [{ label: "💴 料金", value: `¥${price.toLocaleString("ja-JP")}` }] : []),
                              ].map((row, i, arr) => (
                                <tr key={row.label}>
                                  <td style={{
                                    padding: "12px 20px",
                                    borderBottom: i < arr.length - 1 ? `1px solid ${(isCancel || isRejection) ? "#FECACA" : "#D1EEF5"}` : "none",
                                  }}>
                                    <table width="100%" cellPadding={0} cellSpacing={0}>
                                      <tbody>
                                        <tr>
                                          <td style={{ width: "40%", fontSize: 12, color: "#6B7280", verticalAlign: "top" }}>
                                            {row.label}
                                          </td>
                                          <td style={{ fontSize: 13, fontWeight: "bold", color: (isCancel || isRejection) ? "#7F1D1D" : "#111827", verticalAlign: "top" }}>
                                            {row.value}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>

                    {/* ── メッセージ ── */}
                    <tr>
                      <td style={{ padding: "0 32px 24px" }}>
                        {isUpdate ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "14px 16px" }}>
                            ご予約の日時が変更されました。ご不便をおかけして申し訳ございません。<br />
                            ご不明な点はお電話にてお問い合わせください。
                          </p>
                        ) : isRejection ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "14px 16px" }}>
                            申し訳ございませんが、ご希望の日時は既にご予約が埋まっており、お受けすることができませんでした。<br />
                            別の日程をご検討いただけますと幸いです。
                          </p>
                        ) : isCancel ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "14px 16px" }}>
                            ご予約がキャンセルされました。またのご利用を心よりお待ちしております。
                          </p>
                        ) : isReminder ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "14px 16px" }}>
                            明日のご予約をお忘れなくご来院ください。<br />
                            変更・キャンセルの場合はお早めにご連絡ください。
                          </p>
                        ) : isConfirmation ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 16px" }}>
                            ご予約を確定いたしました。当日は時間に余裕を持ってお越しください。<br />
                            変更・キャンセルのご連絡はお早めにお願いいたします。
                          </p>
                        ) : (
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.8, backgroundColor: BG, border: `1px solid #B2E4EF`, borderRadius: 10, padding: "14px 16px" }}>
                            スタッフが内容を確認の上、改めて確定通知をお送りします。<br />
                            しばらくお待ちください。
                          </p>
                        )}
                      </td>
                    </tr>

                    {/* ── 医院情報（住所・電話）── */}
                    {(address || phone) && (
                      <tr>
                        <td style={{ padding: "0 32px 24px" }}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB", overflow: "hidden" }}>
                            <tbody>
                              {address && (
                                <tr>
                                  <td style={{ padding: "12px 16px", borderBottom: phone ? "1px solid #E5E7EB" : "none" }}>
                                    <table width="100%" cellPadding={0} cellSpacing={0}>
                                      <tbody>
                                        <tr>
                                          <td style={{ width: 20, fontSize: 14, verticalAlign: "top", paddingTop: 1 }}>📍</td>
                                          <td>
                                            <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>{address}</p>
                                            {mapsLinkUrl && (
                                              <a
                                                href={mapsLinkUrl}
                                                style={{ fontSize: 11, color: BRAND, textDecoration: "none" }}
                                              >
                                                Google マップで見る →
                                              </a>
                                            )}
                                            {/* Static Maps 画像（APIキー設定済み時のみ） */}
                                            {staticMapUrl && mapsLinkUrl && (
                                              <a href={mapsLinkUrl} style={{ display: "block", marginTop: 12 }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                  src={staticMapUrl}
                                                  alt={`${address} の地図`}
                                                  width="520"
                                                  style={{
                                                    display:      "block",
                                                    width:        "100%",
                                                    maxWidth:     520,
                                                    borderRadius: 8,
                                                    border:       "1px solid #E5E7EB",
                                                  }}
                                                />
                                              </a>
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                              {phone && (
                                <tr>
                                  <td style={{ padding: "12px 16px" }}>
                                    <table width="100%" cellPadding={0} cellSpacing={0}>
                                      <tbody>
                                        <tr>
                                          <td style={{ width: 20, fontSize: 14, verticalAlign: "top", paddingTop: 1 }}>📞</td>
                                          <td>
                                            <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
                                              変更・キャンセルはお電話にて承ります
                                            </p>
                                            <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: "bold", color: "#111827" }}>
                                              {/* tel: リンク — color/textDecoration をリセットしてデザインを維持 */}
                                              <a
                                                href={`tel:${phone}`}
                                                style={{ color: "inherit", textDecoration: "none" }}
                                              >
                                                {phone}
                                              </a>
                                            </p>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── マイページリンク（accessToken 保有患者のみ）── */}
                    {mypageUrl && (
                      <tr>
                        <td style={{ padding: "0 32px 24px" }}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE", overflow: "hidden" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "16px 20px" }}>
                                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: "bold", color: "#1D4ED8" }}>
                                    📋 患者専用マイページ
                                  </p>
                                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                                    施術記録・予約履歴をいつでもご確認いただけます。
                                  </p>
                                  <a
                                    href={mypageUrl}
                                    style={{
                                      display:         "inline-block",
                                      backgroundColor: BRAND,
                                      color:           "#ffffff",
                                      fontSize:        12,
                                      fontWeight:      "bold",
                                      padding:         "8px 16px",
                                      borderRadius:    8,
                                      textDecoration:  "none",
                                    }}
                                  >
                                    マイページを開く →
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── LINE 友だち追加CTA（lineFriendUrl 設定時のみ）── */}
                    {lineFriendUrl && (
                      <tr>
                        <td style={{ padding: "0 32px 24px" }}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#F0FFF4", borderRadius: 10, border: "1px solid #BBF7D0", overflow: "hidden" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "16px 20px" }}>
                                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: "bold", color: "#15803D" }}>
                                    💚 LINE公式アカウント
                                  </p>
                                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                                    友だち追加でお得なお知らせや最新情報をLINEでお届けします。
                                  </p>
                                  <a
                                    href={lineFriendUrl}
                                    style={{
                                      display:         "inline-block",
                                      backgroundColor: "#06C755",
                                      color:           "#ffffff",
                                      fontSize:        12,
                                      fontWeight:      "bold",
                                      padding:         "8px 16px",
                                      borderRadius:    8,
                                      textDecoration:  "none",
                                    }}
                                  >
                                    友だち追加する →
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── フッター ── */}
                    <tr>
                      <td style={{ backgroundColor: "#F9FAFB", borderTop: "1px solid #E5E7EB", padding: "20px 32px", textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>
                          このメールは {tenantName} の予約システムから自動送信されています。
                        </p>
                        {!phone && (
                          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                            ご不明な点はお電話にてお問い合わせください。
                          </p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
