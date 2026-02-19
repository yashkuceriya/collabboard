export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      boards: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          is_starred: boolean;
          is_interview: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          owner_id: string;
          is_starred?: boolean;
          is_interview?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          is_starred?: boolean;
          is_interview?: boolean;
          created_at?: string;
        };
      };
      board_members: {
        Row: {
          board_id: string;
          user_id: string;
          role: "editor" | "viewer";
          created_at: string;
        };
        Insert: {
          board_id: string;
          user_id: string;
          role?: "editor" | "viewer";
          created_at?: string;
        };
        Update: {
          board_id?: string;
          user_id?: string;
          role?: "editor" | "viewer";
          created_at?: string;
        };
      };
      board_elements: {
        Row: {
          id: string;
          board_id: string;
          type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "connector" | "freehand";
          x: number;
          y: number;
          width: number;
          height: number;
          color: string;
          text: string;
          properties: Json;
          created_by: string;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "connector" | "freehand";
          x: number;
          y: number;
          width?: number;
          height?: number;
          color?: string;
          text?: string;
          properties?: Json;
          created_by: string;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          board_id?: string;
          type?: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "connector";
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          color?: string;
          text?: string;
          properties?: Json;
          created_by?: string;
          updated_at?: string;
          created_at?: string;
        };
      };
      board_chat_messages: {
        Row: {
          id: string;
          board_id: string;
          user_id: string;
          user_email: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          user_id: string;
          user_email: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          board_id?: string;
          user_id?: string;
          user_email?: string;
          body?: string;
          created_at?: string;
        };
      };
    };
    Functions: {
      get_user_id_by_email: {
        Args: { user_email: string };
        Returns: string | null;
      };
    };
  };
}

export type Board = Database["public"]["Tables"]["boards"]["Row"];
export type BoardMember = Database["public"]["Tables"]["board_members"]["Row"];
export type BoardElement = Database["public"]["Tables"]["board_elements"]["Row"];
export type BoardElementInsert = Database["public"]["Tables"]["board_elements"]["Insert"];
export type BoardElementUpdate = Database["public"]["Tables"]["board_elements"]["Update"];
export type BoardChatMessage = Database["public"]["Tables"]["board_chat_messages"]["Row"];
export type ElementType = BoardElement["type"];
