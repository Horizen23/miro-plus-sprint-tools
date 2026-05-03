import { RealtimeService } from "./types";
import { SocketIOAdapter } from "./SocketIOAdapter";
import { SupabaseAdapter } from "./SupabaseAdapter";

export class RealtimeFactory {
  private static instance: RealtimeService | null = null;

  static getInstance(): RealtimeService {
    if (this.instance) return this.instance;

    const provider = process.env.NEXT_PUBLIC_REALTIME_PROVIDER || "socketio";

    if (provider === "supabase") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      this.instance = new SupabaseAdapter(url, key);
    } else {
      const url = process.env.NEXT_PUBLIC_SOCKET_URL || "";
      this.instance = new SocketIOAdapter(url);
    }

    return this.instance;
  }
}
