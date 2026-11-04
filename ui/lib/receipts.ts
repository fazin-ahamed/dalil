import { isTauri } from "./native-bridge";
export interface RequestReceipt { id:string; createdAt:string; host:string; model:string; bytes:number; screenshot:boolean; hash:string }
export async function listReceipts(): Promise<RequestReceipt[]> {
  if (!isTauri()) return [];
  const {invoke}=await import("@tauri-apps/api/core");
  return invoke<RequestReceipt[]>("receipt_list");
}
