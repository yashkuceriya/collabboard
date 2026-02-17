export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      boards: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          created_at?: string;
        };
      };
      board_elements: {
        Row: {
          id: string;
          board_id: string;
          type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "connector";
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
          type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "connector";
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
    };
  };
}

export type Board = Database["public"]["Tables"]["boards"]["Row"];
export type BoardElement = Database["public"]["Tables"]["board_elements"]["Row"];
export type BoardElementInsert = Database["public"]["Tables"]["board_elements"]["Insert"];
export type BoardElementUpdate = Database["public"]["Tables"]["board_elements"]["Update"];
export type ElementType = BoardElement["type"];
