import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat-panel";

export const metadata: Metadata = { title: "Deal assistant" };

export default function AssistantPage() {
  return (
    <div className="wrap">
      <h1 className="page-title" style={{ textAlign: "center" }}>
        Tell it what you need. It finds the deal.
      </h1>
      <p className="page-sub" style={{ textAlign: "center", margin: "10px auto 0" }}>
        The assistant searches every verified store at once and only shows deals that pass our checks. Free accounts get 20 chats a day; Gold is
        unlimited.
      </p>
      <ChatPanel variant="page" />
    </div>
  );
}
